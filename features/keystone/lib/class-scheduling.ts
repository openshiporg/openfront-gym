import { assertInstructorQualifications } from "../mutations/trainerQualifications";
import { assertNoMemberServiceConflict, lockTransactionKey } from "../mutations/classCapacity";
import { assertMembershipServiceEligibility } from "./membership-credits";
import { enqueueOperationalNotice } from "./operational-notices";

export function scheduleDuration(schedule: any) {
  const pattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!pattern.test(schedule.startTime) || !pattern.test(schedule.endTime) || schedule.endTime <= schedule.startTime) throw new Error("Class times must be increasing HH:MM values");
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (minutes(schedule.endTime) - minutes(schedule.startTime)) * 60000;
}
export function effectiveInstructor(instance: any) { return instance.instructorId ?? instance.classSchedule?.instructorId ?? null; }
export function overlapping(a: Date, b: Date, c: Date, d: Date) { return a < d && b > c; }

export async function assertClassAllocation(tx: any, organizationId: string, candidate: any, ignoreId?: string) {
  const closure = await tx.operationsCase.findFirst({ where: { organizationId, kind: "closure", status: { not: "resolved" }, ...(candidate.locationId ? { OR: [{ locationId: "" }, { locationId: candidate.locationId }] } : {}) } });
  if (closure) throw new Error("Class allocation is unavailable during a facility closure");
  const instructorId = effectiveInstructor(candidate);
  const resource = candidate.resourceId ? await tx.gymResource.findFirst({ where: { id: candidate.resourceId, organizationId, isActive: true } }) : null;
  if (candidate.resourceId && (!resource || resource.locationId !== candidate.locationId)) throw new Error("Class resource must be active and belong to the selected location");
  if (resource && candidate.maxCapacity > resource.capacity) throw new Error("Class capacity exceeds resource capacity");
  if (candidate.locationId && !await tx.location.findFirst({ where: { id: candidate.locationId, organizationId, isActive: true } })) throw new Error("Class location must be active in this organization");
  if (instructorId) {
    const instructor = await tx.instructor.findFirst({ where: { id: instructorId, organizationId, isActive: true } });
    if (!instructor) throw new Error("Class instructor must be active in this organization");
    assertInstructorQualifications(instructor, candidate.endsAt);
  }
  const before = (resource?.setupBufferMinutes || 0) * 60000;
  const after = (resource?.cleanupBufferMinutes || 0) * 60000;
  const start = new Date(candidate.date.getTime() - before);
  const end = new Date(candidate.endsAt.getTime() + after);
  const classes = await tx.classInstance.findMany({ where: { organizationId, isCancelled: false, ...(ignoreId ? { id: { not: ignoreId } } : {}), date: { lt: end, gt: new Date(start.getTime() - 48 * 3600000) } }, include: { classSchedule: true, resource: true } });
  for (const other of classes) {
    const otherEnd = other.endsAt || new Date(other.date.getTime() + scheduleDuration(other.classSchedule));
    if (instructorId && effectiveInstructor(other) === instructorId && overlapping(candidate.date, candidate.endsAt, other.date, otherEnd)) throw new Error("Instructor has an overlapping class");
    const otherResourceId = other.endsAt ? other.resourceId : other.resourceId ?? other.classSchedule?.resourceId;
    if (resource && otherResourceId === resource.id) {
      const otherResource = other.resource ?? resource;
      if (overlapping(start, end,
        new Date(other.date.getTime() - (otherResource.setupBufferMinutes || 0) * 60000),
        new Date(otherEnd.getTime() + (otherResource.cleanupBufferMinutes || 0) * 60000))) throw new Error("Resource has an overlapping class");
    }
  }
  if (instructorId || resource) {
    const appointments = await tx.trainerAppointment.findMany({ where: { organizationId,
      status: { in: ["confirmed", "scheduled", "checked_in"] }, startTime: { lt: new Date(end.getTime() + 4 * 3600000) }, endTime: { gt: new Date(start.getTime() - 4 * 3600000) },
      OR: [...(instructorId ? [{ instructorId }] : []), ...(resource ? [{ resourceId: resource.id }] : [])],
    } });
    for (const appointment of appointments) {
      if (instructorId && appointment.instructorId === instructorId && overlapping(candidate.date, candidate.endsAt, appointment.startTime, appointment.endTime)) throw new Error("Instructor has an overlapping training appointment");
      if (resource && appointment.resourceId === resource.id && overlapping(start, end, appointment.resourceStartsAt || new Date(appointment.startTime.getTime() - before), appointment.resourceEndsAt || new Date(appointment.endTime.getTime() + after))) throw new Error("Resource has an overlapping training appointment");
    }
  }
}

export async function saveControlledOccurrence(tx: any, organizationId: string, input: any, id?: string | null) {
  if (id) await lockTransactionKey(tx, `class-instance:${id}`);
  const existing = id ? await tx.classInstance.findFirst({ where: { id, organizationId } }) : null;
  if (id && !existing) throw new Error("Class instance not found");
  if (existing?.isCancelled || (existing && existing.date <= new Date())) throw new Error("Completed or cancelled occurrences cannot be edited");
  const scheduleId = input.classScheduleId ?? existing?.classScheduleId;
  if (existing && scheduleId !== existing.classScheduleId) throw new Error("An occurrence cannot be moved to another schedule; cancel and create a new occurrence");
  const schedule = await tx.classSchedule.findFirst({ where: { id: scheduleId, organizationId } });
  if (!schedule?.isActive && !existing) throw new Error("Active class schedule required");
  if (!schedule) throw new Error("Class schedule not found");
  const date = new Date(input.date ?? existing?.date);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new Error("Class must start in the future");
  const data = { organizationId, classScheduleId: schedule.id, occurrenceKey: existing?.occurrenceKey || `${schedule.id}:${(existing?.date || date).toISOString()}`, date, endsAt: new Date(date.getTime() + scheduleDuration(schedule)),
    instructorId: input.instructorId === undefined ? existing?.instructorId ?? null : input.instructorId,
    locationId: input.locationId === undefined ? existing?.endsAt ? existing.locationId : existing?.locationId ?? schedule.locationId : input.locationId,
    resourceId: input.resourceId === undefined ? existing?.endsAt ? existing.resourceId : existing?.resourceId ?? schedule.resourceId : input.resourceId,
    maxCapacity: input.maxCapacity ?? existing?.maxCapacity ?? schedule.maxCapacity,
  };
  if (!Number.isInteger(data.maxCapacity) || data.maxCapacity < 1 || data.maxCapacity > 10000) throw new Error("Capacity must be a whole number from 1 to 10000");
  await assertClassAllocation(tx, organizationId, { ...data, classSchedule: schedule }, id || undefined);
  const bookings = existing ? await tx.classBooking.findMany({ where: { organizationId, classInstanceId: existing.id, status: { in: ["confirmed", "waitlist"] } }, include: { member: { include: { user: { include: { membership: true } } } } } }) : [];
  if (bookings.filter((b: any) => b.status === "confirmed").length > data.maxCapacity) throw new Error("Capacity is below confirmed bookings");
  const changed = existing && (existing.date.getTime() !== date.getTime() || existing.instructorId !== data.instructorId || existing.locationId !== data.locationId || existing.resourceId !== data.resourceId);
  if (changed) {
    const members = [...new Set(bookings.map((b: any) => b.memberId))].sort();
    for (const memberId of members) await lockTransactionKey(tx, `member:${memberId}`);
    for (const booking of bookings) {
      const lockedMember = await tx.member.findFirst({ where: { id: booking.memberId, organizationId }, include: { user: { include: { membership: true } } } });
      if (lockedMember?.status !== "active") throw new Error("A booked member is not eligible; resolve the booking before rescheduling");
      assertMembershipServiceEligibility(lockedMember?.user?.membership, date);
      if (booking.status === "confirmed" && existing.date.getTime() !== date.getTime()) {
        const debit = await tx.membershipCreditEntry.findUnique({ where: { key: `${booking.id}:debit` }, include: { grant: true } });
        if (!debit?.grant || date < debit.grant.periodStart || date >= debit.grant.periodEnd) throw new Error("Reschedule crosses a booking credit month or legacy credit provenance is missing; cancel and rebook with restored credits");
        await assertNoMemberServiceConflict(tx, booking.memberId, organizationId, { ...data, id: existing.id, classSchedule: schedule });
      }
    }
  }
  const persisted = { ...data, ...(changed ? { changeHistory: [
    ...(Array.isArray(existing.changeHistory) ? existing.changeHistory : []),
    { at: new Date().toISOString(), actorId: input.actorId || "system", before: { date: existing.date.toISOString(), instructorId: existing.instructorId, locationId: existing.locationId, resourceId: existing.resourceId }, after: { date: date.toISOString(), instructorId: data.instructorId, locationId: data.locationId, resourceId: data.resourceId } },
  ] } : {}) };
  const result = existing ? await tx.classInstance.update({ where: { id: existing.id }, data: persisted }) : await tx.classInstance.create({ data: persisted });
  if (changed) for (const booking of bookings) await enqueueOperationalNotice(tx, { organizationId, memberId: booking.memberId,
    key: `booking:${booking.id}:reschedule:${persisted.changeHistory?.length}`, kind: "reschedule", message: `Your class details changed. The class starts ${date.toISOString()}. Please review your booking.` });
  return result;
}
