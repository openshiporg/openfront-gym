import { assertInstructorQualifications } from "./trainerQualifications";
import { lockParticipationPolicy, assertParticipationAllowed } from "../lib/operational-policy";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import type { Context } from ".keystone/types";
import { getTenantId } from "../access/tenantPolicy";
import { lockTransactionKey } from "./classCapacity";
import { assertAppointmentTransition, buildActiveAppointmentOverlapWhere, normalizeAppointmentWindow } from "./trainerAppointmentPolicy";
import { assertTrainerAppointmentReplayMatches, hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { assertPackageUsable, assertTrainerAvailable, assertTrainingActor, assertTrainingMember, assertTrainingTenant, trainingText, type TrainingActor } from "./trainingPolicy";
import { debitTrainingPackage, restoreTrainingPackage } from "./trainingPackages";

function throwOnKeystonePrismaError<T>(result: T): T {
  if (result instanceof Error) throw result;
  return result;
}

export function trainingActorFromContext(context: Context): TrainingActor {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Authenticated organization session required");
  const role = session.data?.role;
  return { userId: session.itemId, organizationId, canManageAppointments: Boolean(role?.canManageAllRecords || role?.canManageAppointments), canManagePrograms: Boolean(role?.canManageAllRecords || role?.canManagePrograms), canManagePeople: Boolean(role?.canManageAllRecords || role?.canManagePeople), isInstructor: Boolean(role?.isInstructor) };
}

// Direct Prisma is intentional: actor/tenant/state checks below precede atomic
// multi-record writes to lists whose generated create/update/delete are denied.
export async function createAtomicTrainerAppointment(prisma: any, input: {
  memberId: string; instructorId: string; locationId: string; resourceId?: string | null;
  trainingPackageId: string; startTime: string | Date; memberNotes?: string | null;
  idempotencyKey: string; actor: TrainingActor;
}, now = new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
  const actor = input.actor;
  assertTrainingActor(actor);
  const key = trainingText(input.idempotencyKey, "Idempotency key", 200);
  const memberNotes = trainingText(input.memberNotes ?? "", "Notes", 2000, false);
  const startTime = new Date(input.startTime);
  if (!Number.isFinite(startTime.getTime())) throw new Error("Appointment start time is invalid");
  const request = { memberId: input.memberId, instructorId: input.instructorId, locationId: input.locationId, resourceId: input.resourceId || null, trainingPackageId: input.trainingPackageId, startTime, memberNotes };
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor.organizationId}`);
    await lockTransactionKey(tx, `appointment-idempotency:${actor.organizationId}:${key}`);
    await lockTransactionKey(tx, `member:${input.memberId}`);
    await lockTransactionKey(tx, `member-appointment:${input.memberId}`);
    await lockTransactionKey(tx, `training-package:${input.trainingPackageId}`);
    const member = await tx.member.findUnique({ where: { id: input.memberId }, include: { user: { select: { id: true } } } });
    assertTrainingMember(member, actor); // authorization MUST precede replay output
    const existing = await tx.trainerAppointment.findFirst({ where: { organizationId: actor.organizationId, idempotencyKey: key } });
    if (existing) {
      assertTrainerAppointmentReplayMatches(existing, request);
      return { appointment: appointmentProjection(existing), reused: true };
    }
    if (startTime <= now || startTime.getTime() > now.getTime() + 366 * 86_400_000) throw new Error("Appointment must start within the next year");
    const [instructor, location, resource, pack, organization] = await Promise.all([
      tx.instructor.findUnique({ where: { id: input.instructorId } }),
      tx.location.findUnique({ where: { id: input.locationId } }),
      input.resourceId ? tx.gymResource.findUnique({ where: { id: input.resourceId } }) : null,
      tx.trainingPackage.findUnique({ where: { id: input.trainingPackageId } }),
      tx.organization.findUnique({ where: { id: actor.organizationId }, select: { timezone: true } }),
    ]);
    assertTrainingTenant(instructor, actor, "Instructor"); assertTrainingTenant(location, actor, "Location");
    if (input.resourceId) assertTrainingTenant(resource, actor, "Resource");
    if (!instructor.isActive || !location.isActive || (resource && (!resource.isActive || resource.locationId !== location.id))) throw new Error("Instructor, location or resource is unavailable");
    assertTrainingTenant(pack, actor, "Training package");
    const window = normalizeAppointmentWindow(startTime, pack.durationMinutes);
    assertPackageUsable(pack, actor, member.id, location.id, window.endTime);
    assertInstructorQualifications(instructor, window.endTime);
    await assertParticipationAllowed(tx, actor.organizationId, member.id, window.startTime, location.id);
    const rows = await tx.trainerAvailability.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Instructor availability requires operator review");
    assertTrainerAvailable(rows, window.startTime, window.endTime, organization?.timezone || "UTC");
    const overlap = buildActiveAppointmentOverlapWhere(window.startTime, window.endTime);
    const conflict = await tx.trainerAppointment.findFirst({ where: { organizationId: actor.organizationId, OR: [{ instructorId: instructor.id }, { memberId: member.id }], ...overlap }, select: { id: true } });
    if (conflict) throw new Error("Instructor or member already has an overlapping appointment");
    const resourceSetupBufferMs = (resource?.setupBufferMinutes || 0) * 60_000;
    const resourceCleanupBufferMs = (resource?.cleanupBufferMinutes || 0) * 60_000;
    const resourceStartsAt = new Date(window.startTime.getTime() - resourceSetupBufferMs);
    const resourceEndsAt = new Date(window.endTime.getTime() + resourceCleanupBufferMs);
    if (resource) {
      const count = await tx.trainerAppointment.count({ where: { organizationId: actor.organizationId, resourceId: resource.id, status: { in: ["scheduled", "confirmed", "checked_in"] }, OR: [{ resourceStartsAt: { lt: resourceEndsAt }, resourceEndsAt: { gt: resourceStartsAt } }, { resourceStartsAt: null, ...buildActiveAppointmentOverlapWhere(resourceStartsAt, resourceEndsAt) }] } });
      if (count >= (resource.isExclusive ? 1 : resource.capacity)) throw new Error("Resource is at capacity, including setup/cleanup buffers");
    }
    // Shared scheduling lock also covers the class generator/editor. Legacy
    // occurrences derive their end from the template until explicitly amended.
    const classes = await tx.classInstance.findMany({ where: { organizationId: actor.organizationId, isCancelled: false, date: {
      // HH:MM class schedules are bounded to under 24h; extend both sides by the
      // shared room buffers so an inherited-room class cannot sit outside this scan.
      gte: new Date(resourceStartsAt.getTime() - 86_400_000 - resourceCleanupBufferMs),
      lt: new Date(resourceEndsAt.getTime() + resourceSetupBufferMs),
    } }, include: { classSchedule: true, resource: true }, take: 1000 });
    if (classes.length >= 1000) throw new Error("Class conflict window requires operator review");
    for (const instance of classes) {
      const schedule = instance.classSchedule;
      const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
      const duration = schedule ? minutes(schedule.endTime) - minutes(schedule.startTime) : 480;
      const end = instance.endsAt ? new Date(instance.endsAt) : new Date(new Date(instance.date).getTime() + duration * 60_000);
      const effectiveInstructor = instance.instructorId || schedule?.instructorId;
      if (effectiveInstructor === instructor.id && new Date(instance.date) < window.endTime && end > window.startTime) throw new Error("Instructor has an overlapping class");
      const classResourceId = instance.endsAt ? instance.resourceId : instance.resourceId ?? schedule?.resourceId;
      const classResourceStart = new Date(new Date(instance.date).getTime() - (instance.resource?.setupBufferMinutes || resource?.setupBufferMinutes || 0) * 60_000);
      const classResourceEnd = new Date(end.getTime() + (instance.resource?.cleanupBufferMinutes || resource?.cleanupBufferMinutes || 0) * 60_000);
      if (resource && classResourceId === resource.id && classResourceEnd > resourceStartsAt && classResourceStart < resourceEndsAt) throw new Error("Resource is allocated to a class, including buffers");
    }
    const classBookings = await tx.classBooking.findMany({ where: { organizationId: actor.organizationId, memberId: member.id, status: "confirmed", classInstance: { isCancelled: false, date: { gte: new Date(window.startTime.getTime() - 86_400_000), lt: window.endTime } } }, include: { classInstance: { include: { classSchedule: true } } }, take: 1000 });
    if (classBookings.length >= 1000) throw new Error("Member calendar requires operator review");
    for (const booking of classBookings) {
      const instance = booking.classInstance;
      if (!instance) continue;
      const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
      const duration = instance.classSchedule ? minutes(instance.classSchedule.endTime) - minutes(instance.classSchedule.startTime) : 480;
      const end = instance.endsAt ? new Date(instance.endsAt) : new Date(new Date(instance.date).getTime() + duration * 60_000);
      if (end > window.startTime) throw new Error("Member already has an overlapping class booking");
    }
    const appointment = await tx.trainerAppointment.create({ data: { organizationId: actor.organizationId, memberId: member.id, instructorId: instructor.id, locationId: location.id, resourceId: resource?.id || null, trainingPackageId: pack.id, ...window, resourceStartsAt, resourceEndsAt, status: "confirmed", serviceName: pack.serviceName, priceAmount: Math.floor(pack.amount / pack.totalCredits), currencyCode: pack.currencyCode, memberNotes, idempotencyKey: key, requestHash: hashTrainerAppointmentRequest(request) } });
    await debitTrainingPackage(tx, pack, appointment.id, actor);
    throwOnKeystonePrismaError(await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: member.id, key: `training-booked:${appointment.id}`, kind: "training", message: `${pack.serviceName} is confirmed for ${window.startTime.toISOString()}. One credit was reserved from your training package. Cancel before the start to restore that credit.` }));
    return { appointment: appointmentProjection(appointment), reused: false };
  });
}

export async function transitionAtomicTrainerAppointment(prisma: any, input: { appointmentId: string; status: string; reason?: string | null; actor: TrainingActor }, now = new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
  const actor = input.actor; assertTrainingActor(actor);
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor.organizationId}`);
    await lockTransactionKey(tx, `appointment:${input.appointmentId}`);
    const appointment = await tx.trainerAppointment.findUnique({ where: { id: input.appointmentId }, include: { member: { include: { user: { select: { id: true } } } }, instructor: { include: { user: { select: { id: true } } } } } });
    assertTrainingTenant(appointment, actor, "Appointment");
    await lockTransactionKey(tx, `member:${appointment.memberId}`);
    appointment.member = await tx.member.findUnique({ where: { id: appointment.memberId }, include: { user: { select: { id: true } } } });
    const owner = appointment.member?.user?.id === actor.userId;
    const instructor = actor.isInstructor && appointment.instructor?.user?.id === actor.userId;
    if (!actor.canManageAppointments && !instructor && !(owner && input.status === "cancelled")) throw new Error("Appointment transition is not permitted");
    assertAppointmentTransition(appointment.status, input.status);
    if (appointment.status === input.status) return { appointment: appointmentProjection(appointment), reused: true };
    const data: Record<string, unknown> = { status: input.status };
    if (input.status === "cancelled") {
      if (new Date(appointment.startTime) <= now) throw new Error("Started appointments require an attendance outcome; cancellation credit restoration is closed");
      data.cancelledAt = now; data.cancellationReason = trainingText(input.reason ?? "", "Cancellation reason", 2000, true);
      await restoreTrainingPackage(tx, appointment, actor);
    }
    if (["checked_in", "completed", "no_show"].includes(input.status)) {
      if (new Date(appointment.startTime) > now) throw new Error("Attendance cannot be recorded before the appointment starts");
      if (input.status === "completed" && new Date(appointment.endTime) > now) throw new Error("Completion cannot precede the scheduled end");
      if (input.status !== "no_show" && appointment.member?.status !== "active") throw new Error("Inactive members cannot receive training; operator review required");
      if (input.status !== "no_show") {
        if (!appointment.instructor?.isActive) throw new Error("Inactive instructors cannot fulfill appointments");
        assertInstructorQualifications(appointment.instructor, now);
        await assertParticipationAllowed(tx, actor.organizationId, appointment.memberId, now, appointment.locationId);
      }
      if (input.status === "checked_in") data.checkedInAt = now;
      if (input.status === "completed") data.completedAt = now;
    }
    const updated = await tx.trainerAppointment.update({ where: { id: appointment.id }, data });
    throwOnKeystonePrismaError(await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: appointment.memberId, key: `training-${input.status}:${appointment.id}`, kind: "training", message: `${appointment.serviceName}: ${input.status.replaceAll("_", " ")}. ${input.status === "cancelled" ? "The credit was restored to its original package and expiry." : "Review the appointment in Account → Training."}` }));
    return { appointment: appointmentProjection(updated), reused: false };
  });
}
export function appointmentProjection(row: any) {
  return { id: row.id, memberId: row.memberId, instructorId: row.instructorId, locationId: row.locationId, trainingPackageId: row.trainingPackageId, serviceName: row.serviceName, startTime: new Date(row.startTime).toISOString(), endTime: new Date(row.endTime).toISOString(), status: row.status, cancellationReason: row.cancellationReason || "", memberNotes: row.memberNotes || "" };
}
export async function bookTrainerAppointment(_root: unknown, { data }: { data: any }, context: Context) {
  return createAtomicTrainerAppointment(context.prisma, { ...data, actor: trainingActorFromContext(context) });
}
export async function transitionTrainerAppointment(_root: unknown, args: { appointmentId: string; status: string; reason?: string | null }, context: Context) {
  return transitionAtomicTrainerAppointment(context.prisma, { ...args, actor: trainingActorFromContext(context) });
}

// Cancellation and the replacement reservation share one outer transaction: a
// conflict cannot strand the member without the original appointment or credit.
export async function rescheduleAtomicTrainerAppointment(prisma: any, input: {
  appointmentId: string; instructorId?: string; resourceId?: string | null; startTime: string | Date;
  idempotencyKey: string; reason: string; actor: TrainingActor;
}, now = new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
  const actor = input.actor; assertTrainingActor(actor);
  const reason = trainingText(input.reason, "Reschedule reason", 2000);
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor.organizationId}`);
    const original = await tx.trainerAppointment.findUnique({ where: { id: input.appointmentId }, include: { member: { include: { user: true } } } });
    assertTrainingTenant(original, actor, "Appointment");
    if (!actor.canManageAppointments && original.member?.user?.id !== actor.userId) throw new Error("Only the member or training manager can reschedule");
    if (!original.trainingPackageId) throw new Error("Legacy appointments need a recorded package before rescheduling");
    const request = { memberId: original.memberId, instructorId: input.instructorId || original.instructorId, locationId: original.locationId, resourceId: input.resourceId === undefined ? original.resourceId : input.resourceId, trainingPackageId: original.trainingPackageId, startTime: input.startTime, memberNotes: original.memberNotes || "", idempotencyKey: input.idempotencyKey, actor };
    const existing = await tx.trainerAppointment.findFirst({ where: { organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey } });
    const nested = { $transaction: (fn: (value: any) => unknown) => fn(tx) };
    if (existing) {
      if (existing.replacesAppointmentId !== original.id) throw new Error("Reschedule key belongs to another appointment");
      return createAtomicTrainerAppointment(nested, request, now);
    }
    if (!["scheduled", "confirmed"].includes(original.status)) throw new Error("Only an upcoming reserved appointment can be rescheduled");
    await transitionAtomicTrainerAppointment(nested, { appointmentId: original.id, status: "cancelled", reason: `Rescheduled: ${reason}`, actor }, now);
    const result = await createAtomicTrainerAppointment(nested, request, now);
    const linkedReplacement = await tx.trainerAppointment.update({ where: { id: result.appointment.id }, data: { replacesAppointmentId: original.id } });
    if (linkedReplacement instanceof Error) throw linkedReplacement;
    return result;
  });
}
export async function rescheduleTrainerAppointment(_root: unknown, { data }: { data: any }, context: Context) {
  return rescheduleAtomicTrainerAppointment(context.prisma, { ...data, actor: trainingActorFromContext(context) });
}
