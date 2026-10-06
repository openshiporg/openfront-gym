import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { refreshScopedMembership } from "../lib/membership-credits";
import { lockParticipationPolicy } from "../lib/operational-policy";
import { lockTransactionKey } from "./classCapacity";
import { saveControlledOccurrence, scheduleDuration } from "../lib/class-scheduling";
import { futureLocalOccurrence, localWeekdayAtOffset, resolveGymTimeZone } from "../../../lib/timezone";
import {
  updateCapacityControlledClassInstance,
  updateCapacityControlledClassSchedule,
} from "./classCapacity";

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

async function schedulingManager(context: any) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Scheduling management permission required");
  return { userId: actor.userId, organizationId: actor.organizationId };
}

export async function updateClassScheduleCapacity(
  _root: unknown,
  { classScheduleId, maxCapacity }: { classScheduleId: string; maxCapacity: number },
  context: any,
) {
  const { organizationId } = await schedulingManager(context);
  return updateCapacityControlledClassSchedule(context.prisma, {
    classScheduleId,
    maxCapacity,
    organizationId,
  });
}

export async function updateClassInstanceCapacity(
  _root: unknown,
  { classInstanceId, maxCapacity }: { classInstanceId: string; maxCapacity: number | null },
  context: any,
) {
  const { organizationId } = await schedulingManager(context);
  return updateCapacityControlledClassInstance(context.prisma, {
    classInstanceId,
    maxCapacity,
    organizationId,
  });
}

export async function generateUpcomingClassInstances(
  _root: unknown,
  { weeks }: { weeks: number },
  context: any,
) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
    throw new Error("weeks must be an integer from 1 to 12");
  }
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const sudo = context.sudo();
  const [settings, organization] = await Promise.all([
    prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { timezone: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    }),
  ]);
  const timeZone = resolveGymTimeZone(settings?.timezone, organization?.timezone);
  const schedules = await sudo.query.ClassSchedule.findMany({
    where: {
      AND: [
        { organization: { id: { equals: organizationId } } },
        { isActive: { equals: true } },
      ],
    },
    take: 500,
    query: "id dayOfWeek startTime endTime maxCapacity organization { id }",
  });
  const now = new Date();
  const pendingInstances: Array<{
    organizationId: string;
    classScheduleId: string;
    instructorId?: string;
    date: Date;
    maxCapacity: number;
    isCancelled: boolean;
  }> = [];

  for (const schedule of schedules as any[]) {
    if (schedule.organization?.id !== organizationId) throw new Error("Schedule tenant mismatch");
    const targetDay = DAY_MAP[schedule.dayOfWeek];
    if (targetDay === undefined) continue;
    const [hours, minutes] = String(schedule.startTime).split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) throw new Error("Schedule time is invalid");

    for (let offset = 0; offset <= weeks * 7; offset += 1) {
      if (localWeekdayAtOffset(now, timeZone, offset) !== targetDay) continue;
      const date = futureLocalOccurrence(now, timeZone, offset, hours, minutes);
      if (date <= now) continue;

      pendingInstances.push({
        organizationId,
        classScheduleId: schedule.id,

        date,
        maxCapacity: schedule.maxCapacity,
        isCancelled: false,
      });
    }
  }

  const createdCount = await prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    let count = 0;
    for (const candidate of pendingInstances) {
      // Template timing cannot change once occurrences exist; exact identity is
      // consequently stable across regeneration. An explicit reschedule stays
      // attached to its original generated date so regeneration cannot recreate it.
      const key = `${candidate.classScheduleId}:${candidate.date.toISOString()}`;
      const found = await tx.classInstance.findFirst({ where: { organizationId, classScheduleId: candidate.classScheduleId, OR: [{ occurrenceKey: key }, { date: candidate.date }] } });
      if (found) continue;
      const created = await saveControlledOccurrence(tx, organizationId, candidate);
      await tx.classInstance.update({ where: { id: created.id }, data: { occurrenceKey: key } });
      count += 1;
    }
    return count;
  }, { timeout: 30000 });
  return { success: true, createdCount };
}

/** Full edits share the class/PT allocation lock; generated CRUD cannot bypass them. */
export async function saveGymClassSchedule(_root: unknown, { id, data }: { id?: string | null; data: any }, context: any) {
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    if (id) await lockTransactionKey(tx, `class-schedule:${id}`);
    const existing = id ? await tx.classSchedule.findFirst({ where: { id, organizationId } }) : null;
    if (id && !existing) throw new Error("Schedule not found");
    const next: any = { organizationId };
    for (const key of ["name", "description", "dayOfWeek", "startTime", "endTime", "maxCapacity", "isActive"]) if (data[key] !== undefined) next[key] = data[key];
    for (const [field, list] of [["instructor", "instructor"], ["classType", "classType"], ["location", "location"], ["resource", "gymResource"]]) {
      if (data[field] === undefined) continue;
      const relatedId = data[field]?.disconnect ? null : data[field]?.connect?.id;
      if (relatedId !== null && (typeof relatedId !== "string" || !await tx[list].findFirst({ where: { id: relatedId, organizationId } }))) throw new Error(`${field} is not in this organization`);
      next[`${field}Id`] = relatedId;
    }
    const merged = { ...existing, ...next };
    if (!merged.classTypeId) throw new Error("Select a class type");
    if (typeof merged.name !== "string" || !merged.name.trim() || merged.name.length > 200) throw new Error("Class name is required (maximum 200 characters)");
    if (typeof merged.description !== "string" && merged.description !== undefined) throw new Error("Description must be text");
    if (merged.isActive !== undefined && typeof merged.isActive !== "boolean") throw new Error("Active flag must be boolean");
    if (!(merged.dayOfWeek in DAY_MAP)) throw new Error("Choose a valid weekday");
    scheduleDuration(merged);
    if (!Number.isInteger(merged.maxCapacity) || merged.maxCapacity < 1 || merged.maxCapacity > 10000) throw new Error("Capacity must be a whole number from 1 to 10000");
    if (existing) {
      const instances = await tx.classInstance.findMany({ where: { organizationId, classScheduleId: existing.id }, select: { id: true, maxCapacity: true, resource: { select: { capacity: true } } }, orderBy: { id: "asc" } });
      const policyChange = ["dayOfWeek", "startTime", "endTime", "instructorId", "classTypeId", "locationId", "resourceId"].some((key) => next[key] !== undefined && next[key] !== existing[key]);
      if (instances.length && policyChange) throw new Error("This recurring schedule has occurrences. Edit individual future occurrences, or deactivate this template and create a new one. Existing bookings are preserved.");
      for (const instance of instances.filter((row: any) => row.maxCapacity === null)) {
        if (instance.resource && merged.maxCapacity > instance.resource.capacity) throw new Error("Schedule capacity exceeds an occurrence resource capacity");
        await lockTransactionKey(tx, `class-instance:${instance.id}`);
        const count = await tx.classBooking.count({ where: { organizationId, classInstanceId: instance.id, status: "confirmed" } });
        if (count > merged.maxCapacity) throw new Error("Capacity is below confirmed bookings");
      }
    }
    if (merged.resourceId) {
      const resource = await tx.gymResource.findFirst({ where: { id: merged.resourceId, organizationId, isActive: true } });
      if (!resource || resource.locationId !== merged.locationId || resource.capacity < merged.maxCapacity) throw new Error("Resource must be active, at the selected location, and large enough");
    }
    if (merged.instructorId && !await tx.instructor.findFirst({ where: { id: merged.instructorId, organizationId, isActive: true } })) throw new Error("Instructor must be active");
    // Template overlaps are rejected before generation; occurrence changes are
    // checked separately against both actual classes and training appointments.
    if (merged.isActive !== false && (merged.instructorId || merged.resourceId)) {
      const conflicts = await tx.classSchedule.findMany({ where: { organizationId, isActive: true, dayOfWeek: merged.dayOfWeek, ...(id ? { id: { not: id } } : {}) } });
      if (conflicts.some((other: any) => other.startTime < merged.endTime && other.endTime > merged.startTime && ((merged.instructorId && other.instructorId === merged.instructorId) || (merged.resourceId && other.resourceId === merged.resourceId)))) throw new Error("Recurring instructor or resource allocation overlaps another schedule");
    }
    return existing ? tx.classSchedule.update({ where: { id: existing.id }, data: next }) : tx.classSchedule.create({ data: next });
  });
}

export async function saveGymClassInstance(_root: unknown, { id, data }: { id?: string | null; data: any }, context: any) {
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const input: any = { actorId: context.session.itemId };
  for (const key of ["date", "maxCapacity"]) if (data[key] !== undefined) input[key] = data[key];
  for (const key of ["classSchedule", "instructor", "location", "resource"]) if (data[key] !== undefined) {
    const value = data[key]?.disconnect ? null : data[key]?.connect?.id;
    if (value !== null && typeof value !== "string") throw new Error(`Invalid ${key} relation`);
    input[`${key}Id`] = value;
  }
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    return saveControlledOccurrence(tx, organizationId, input, id);
  });
}

export async function reconcileGymEntitlements(_root: unknown, { afterId, limit = 50 }: { afterId?: string; limit?: number }, context: any) {
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be from 1 to 100");
  const rows = await prisma.membership.findMany({ where: { organizationId, ...(afterId ? { id: { gt: afterId } } : {}) }, orderBy: { id: "asc" }, take: limit + 1, select: { id: true } });
  const results = [];
  for (const row of rows.slice(0, limit)) results.push(await refreshScopedMembership(prisma, organizationId, row.id));
  return { processed: results.length, nextAfterId: rows.length > limit ? rows[limit - 1].id : null, results };
}

/** Resource allocation settings are immutable through raw CRUD. Resolve dependent
 * sessions first, then amend/retire the resource with an accountable reason. */
export async function updateGymResource(_root: unknown, { id, data }: { id: string; data: any }, context: any) {
  const { organizationId, userId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const reason = typeof data?.reason === "string" ? data.reason.trim() : "";
  if (reason.length < 3 || reason.length > 1000) throw new Error("Resource change reason must be 3 to 1000 characters");
  const values: any = {};
  for (const field of ["isActive", "isExclusive"]) if (data[field] !== undefined) {
    if (typeof data[field] !== "boolean") throw new Error(`${field} must be boolean`);
    values[field] = data[field];
  }
  for (const [field, minimum, maximum] of [["capacity", 1, 500], ["setupBufferMinutes", 0, 240], ["cleanupBufferMinutes", 0, 240]] as const) if (data[field] !== undefined) {
    if (!Number.isInteger(data[field]) || data[field] < minimum || data[field] > maximum) throw new Error(`${field} must be a whole number from ${minimum} to ${maximum}`);
    values[field] = data[field];
  }
  if (!Object.keys(values).length) throw new Error("Choose a resource allocation setting to change");
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    const resource = await tx.gymResource.findFirst({ where: { id, organizationId } });
    if (!resource) throw new Error("Resource not found in this organization");
    const changed = Object.keys(values).some((key) => resource[key] !== values[key]);
    if (!changed) return { id, reused: true };
    const now = new Date();
    const cleanupBufferMs = Math.max(0, Number(resource.cleanupBufferMinutes) || 0) * 60_000;
    const classCandidates = await tx.classInstance.findMany({ where: { organizationId, isCancelled: false,
      AND: [
        { OR: [{ resourceId: id }, { endsAt: null, resourceId: null, classSchedule: { resourceId: id } }] },
        { OR: [
          { endsAt: { gt: new Date(now.getTime() - cleanupBufferMs) } },
          { endsAt: null, date: { gt: new Date(now.getTime() - 86400000 - cleanupBufferMs) } },
        ] },
      ],
    }, include: { classSchedule: true }, take: 1000 });
    if (classCandidates.length >= 1000) throw new Error("Resource class dependency window requires review");
    const classDependency = classCandidates.some((instance: any) => {
      const classEnd = instance.endsAt ? new Date(instance.endsAt) : new Date(instance.date.getTime() + scheduleDuration(instance.classSchedule));
      return classEnd.getTime() + cleanupBufferMs > now.getTime();
    });
    const trainingDependency = await tx.trainerAppointment.findFirst({ where: { organizationId, resourceId: id,
      status: { in: ["scheduled", "confirmed", "checked_in"] },
      OR: [
        { resourceEndsAt: { gt: now } },
        { resourceEndsAt: null, endTime: { gt: new Date(now.getTime() - cleanupBufferMs) } },
        { endTime: { gt: now } },
      ],
    }, select: { id: true } });
    if (classDependency || trainingDependency) throw new Error("Cancel or reassign upcoming/in-progress classes and appointments before changing this resource");
    const history = Array.isArray(resource.metadata?.allocationHistory) ? resource.metadata.allocationHistory : [];
    if (history.length >= 500) throw new Error("Resource allocation history requires archival review");
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, resource[key]]));
    await tx.gymResource.update({ where: { id }, data: { ...values, metadata: { ...resource.metadata, allocationHistory: [...history, { at: now.toISOString(), actorId: userId, reason, before, after: values }] } } });
    return { id, reused: false };
  });
}
