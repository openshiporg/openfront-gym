import type { Context } from ".keystone/types";
import { getTenantId } from "../access/tenantPolicy";
import { lockTransactionKey } from "./classCapacity";
import {
  assertAppointmentTransition,
  buildActiveAppointmentOverlapWhere,
  normalizeAppointmentWindow,
} from "./trainerAppointmentPolicy";
import {
  assertTrainerAppointmentReplayMatches,
  hashTrainerAppointmentRequest,
} from "./trainerAppointmentEvidence";

type AppointmentActor = {
  userId: string;
  organizationId: string;
  canManageAppointments: boolean;
  isInstructor: boolean;
};

type BookTrainerAppointmentInput = {
  memberId: string;
  instructorId: string;
  locationId: string;
  resourceId?: string | null;
  startTime: Date | string;
  durationMinutes: number;
  serviceName: string;
  priceAmount?: number | null;
  currencyCode?: string | null;
  memberNotes?: string | null;
  idempotencyKey: string;
  actor: AppointmentActor;
};

const MAX_SERVICE_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

function normalizeText(value: unknown, name: string, max: number, required = false) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${name} is required`);
  if (normalized.length > max) throw new Error(`${name} is too long`);
  return normalized;
}

function assertSameTenant(entity: { organizationId?: string | null } | null, organizationId: string, name: string) {
  if (!entity || entity.organizationId !== organizationId) throw new Error(`${name} was not found in this organization`);
}

export async function createAtomicTrainerAppointment(prisma: any, input: BookTrainerAppointmentInput) {
  const start = new Date(input.startTime);
  const window = normalizeAppointmentWindow(start, input.durationMinutes);
  const serviceName = normalizeText(input.serviceName, "serviceName", MAX_SERVICE_NAME_LENGTH, true);
  const memberNotes = normalizeText(input.memberNotes ?? "", "memberNotes", MAX_NOTES_LENGTH);
  const clientIdempotencyKey = normalizeText(input.idempotencyKey, "idempotencyKey", MAX_IDEMPOTENCY_KEY_LENGTH, true);
  const idempotencyKey = clientIdempotencyKey;
  const currencyCode = normalizeText(input.currencyCode ?? "USD", "currencyCode", 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("currencyCode must be a three-letter code");
  const priceAmount = input.priceAmount ?? 0;
  if (!Number.isInteger(priceAmount) || priceAmount < 0) throw new Error("priceAmount must be a non-negative integer");
  const request = {
    memberId: input.memberId,
    instructorId: input.instructorId,
    locationId: input.locationId,
    resourceId: input.resourceId ?? null,
    startTime: window.startTime,
    durationMinutes: window.durationMinutes,
    serviceName,
    priceAmount,
    currencyCode,
    memberNotes,
  };
  const requestHash = hashTrainerAppointmentRequest(request);

  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `appointment-idempotency:${input.actor.organizationId}:${idempotencyKey}`);
    await lockTransactionKey(transaction, `trainer:${input.instructorId}`);
    await lockTransactionKey(transaction, `member-appointment:${input.memberId}`);
    if (input.resourceId) await lockTransactionKey(transaction, `resource:${input.resourceId}`);

    const existing = await transaction.trainerAppointment.findFirst({
      where: {
        organizationId: input.actor.organizationId,
        idempotencyKey,
      },
    });
    if (existing) {
      assertTrainerAppointmentReplayMatches(existing, request);
      return { appointment: existing, reused: true };
    }

    const [member, instructor, location, resource] = await Promise.all([
      transaction.member.findUnique({ where: { id: input.memberId }, include: { user: { select: { id: true } } } }),
      transaction.instructor.findUnique({ where: { id: input.instructorId }, include: { user: { select: { id: true } } } }),
      transaction.location.findUnique({ where: { id: input.locationId } }),
      input.resourceId ? transaction.gymResource.findUnique({ where: { id: input.resourceId } }) : null,
    ]);
    assertSameTenant(member, input.actor.organizationId, "Member");
    assertSameTenant(instructor, input.actor.organizationId, "Instructor");
    assertSameTenant(location, input.actor.organizationId, "Location");
    if (input.resourceId) assertSameTenant(resource, input.actor.organizationId, "Resource");
    if (!input.actor.canManageAppointments && member.user?.id !== input.actor.userId) {
      throw new Error("You cannot book an appointment for another member");
    }
    if (!instructor.isActive) throw new Error("Instructor is inactive");
    if (!location.isActive) throw new Error("Location is inactive");
    if (resource && (!resource.isActive || resource.locationId !== input.locationId)) {
      throw new Error("Resource is unavailable at this location");
    }

    const overlap = buildActiveAppointmentOverlapWhere(window.startTime, window.endTime);
    const trainerCollision = await transaction.trainerAppointment.findFirst({
      where: { organizationId: input.actor.organizationId, instructorId: input.instructorId, ...overlap },
      select: { id: true },
    });
    if (trainerCollision) throw new Error("Instructor already has an overlapping appointment");

    const memberCollision = await transaction.trainerAppointment.findFirst({
      where: { organizationId: input.actor.organizationId, memberId: input.memberId, ...overlap },
      select: { id: true },
    });
    if (memberCollision) throw new Error("Member already has an overlapping appointment");

    if (resource) {
      const resourceBookings = await transaction.trainerAppointment.count({
        where: { organizationId: input.actor.organizationId, resourceId: resource.id, ...overlap },
      });
      const capacity = resource.isExclusive ? 1 : resource.capacity;
      if (resourceBookings >= capacity) throw new Error("Resource is already at capacity for this time");
    }

    const blocked = await transaction.trainerAvailability.findFirst({
      where: {
        organizationId: input.actor.organizationId,
        instructorId: input.instructorId,
        type: "time_off",
        isAvailable: false,
        date: { gte: new Date(window.startTime.toISOString().slice(0, 10)), lt: new Date(new Date(window.startTime.toISOString().slice(0, 10)).getTime() + 86_400_000) },
      },
      select: { id: true },
    });
    if (blocked) throw new Error("Instructor is unavailable at this time");

    const appointment = await transaction.trainerAppointment.create({
      data: {
        organizationId: input.actor.organizationId,
        memberId: input.memberId,
        instructorId: input.instructorId,
        locationId: input.locationId,
        resourceId: input.resourceId ?? null,
        ...window,
        status: "scheduled",
        serviceName,
        priceAmount,
        currencyCode,
        memberNotes,
        idempotencyKey,
        requestHash,
      },
    });
    return { appointment, reused: false };
  });
}

export async function transitionAtomicTrainerAppointment(
  prisma: any,
  input: { appointmentId: string; status: string; reason?: string | null; actor: AppointmentActor }
) {
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `appointment:${input.appointmentId}`);
    const appointment = await transaction.trainerAppointment.findUnique({
      where: { id: input.appointmentId },
      include: {
        member: { include: { user: { select: { id: true } } } },
        instructor: { include: { user: { select: { id: true } } } },
      },
    });
    assertSameTenant(appointment, input.actor.organizationId, "Appointment");
    const isOwner = appointment.member?.user?.id === input.actor.userId;
    const isAssignedInstructor = appointment.instructor?.user?.id === input.actor.userId;
    if (!input.actor.canManageAppointments && !isAssignedInstructor && !(isOwner && input.status === "cancelled")) {
      throw new Error("You do not have permission for this appointment transition");
    }
    assertAppointmentTransition(appointment.status, input.status);
    if (appointment.status === input.status) return { appointment, reused: true };
    const now = new Date();
    const data: Record<string, unknown> = { status: input.status };
    if (input.status === "cancelled") {
      data.cancelledAt = now;
      data.cancellationReason = normalizeText(input.reason ?? "", "reason", MAX_NOTES_LENGTH);
    }
    if (input.status === "checked_in") data.checkedInAt = now;
    if (input.status === "completed") data.completedAt = now;
    const updated = await transaction.trainerAppointment.update({ where: { id: appointment.id }, data });
    return { appointment: updated, reused: false };
  });
}

function actorFromContext(context: Context): AppointmentActor {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Authenticated organization session required");
  return {
    userId: session.itemId,
    organizationId,
    canManageAppointments: Boolean(session.data?.role?.canManageAllRecords || session.data?.role?.canManageAppointments),
    isInstructor: Boolean(session.data?.role?.isInstructor),
  };
}

export async function bookTrainerAppointment(root: unknown, { data }: { data: any }, context: Context) {
  return createAtomicTrainerAppointment(context.prisma, { ...data, actor: actorFromContext(context) });
}

export async function transitionTrainerAppointment(
  root: unknown,
  args: { appointmentId: string; status: string; reason?: string | null },
  context: Context
) {
  return transitionAtomicTrainerAppointment(context.prisma, { ...args, actor: actorFromContext(context) });
}
