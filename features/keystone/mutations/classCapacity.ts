import { assertNoPendingMembershipFreeze, ensureMonthlyCreditGrant, debitBookingCredit } from "../lib/membership-credits";
import { assertParticipationAllowed, lockParticipationPolicy } from "../lib/operational-policy";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

type CapacityMode = "waitlist" | "reject";

type CapacityBookingInput = {
  classInstanceId: string;
  memberId: string;
  actorUserId: string;
  actorOrganizationId: string;
  actorCanManageAllRecords: boolean;
  capacityMode: CapacityMode;
};

type CapacityBookingResult = {
  bookingId: string;
  status: "confirmed" | "waitlist";
  waitlistPosition: number | null;
  creditsRemaining: number;
};

export async function lockTransactionKey(transaction: any, key: string) {
  const result = await transaction.$queryRaw`
    SELECT true AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired
  `;
  if (result instanceof Error) throw result;
}

function boundedCapacity(value: unknown, allowNull = false): number | null {
  if (allowNull && value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10000) {
    throw new Error("Capacity must be a whole number between 1 and 10000");
  }
  return value as number;
}

export async function updateCapacityControlledClassInstance(
  prisma: any,
  input: { classInstanceId: string; maxCapacity: number | null; organizationId: string },
) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.organizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    const instance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.organizationId },
      include: { classSchedule: { select: { maxCapacity: true } }, resource: { select: { capacity: true } } },
    });
    if (!instance || instance.organizationId !== input.organizationId) {
      throw new Error("Class instance was not found in this organization");
    }
    const requested = boundedCapacity(input.maxCapacity, true);
    const effectiveCapacity = requested ?? instance.classSchedule?.maxCapacity;
    if (typeof effectiveCapacity !== "number") throw new Error("Class instance capacity is unavailable");
    if (instance.resource && effectiveCapacity > instance.resource.capacity) throw new Error("Class capacity exceeds resource capacity");
    const confirmed = await transaction.classBooking.count({
      where: { classInstanceId: instance.id, organizationId: input.organizationId, status: "confirmed" },
    });
    if (effectiveCapacity < confirmed) {
      throw new Error(`Capacity cannot be lower than the ${confirmed} confirmed bookings`);
    }
    return transaction.classInstance.update({
      where: { id: instance.id },
      data: { maxCapacity: requested },
    });
  });
}

export async function updateCapacityControlledClassScheduleInTransaction(
  transaction: any,
  input: { classScheduleId: string; maxCapacity: number; organizationId: string },
  beforeCapacityWrite?: () => Promise<unknown>,
) {
  transaction = guardKeystonePrismaResults(transaction);
  const maxCapacity = boundedCapacity(input.maxCapacity) as number;
  await lockParticipationPolicy(transaction, input.organizationId);
  await lockTransactionKey(transaction, `class-schedule:${input.classScheduleId}`);
  const schedule = await transaction.classSchedule.findFirst({
    where: { id: input.classScheduleId, organizationId: input.organizationId },
    include: { resource: { select: { capacity: true } } },
  });
  if (!schedule || schedule.organizationId !== input.organizationId) {
    throw new Error("Class schedule was not found in this organization");
  }
  if (schedule.resource && maxCapacity > schedule.resource.capacity) throw new Error("Schedule capacity exceeds resource capacity");
  const inheritedInstances = await transaction.classInstance.findMany({
    where: { classScheduleId: schedule.id, organizationId: input.organizationId, maxCapacity: null },
    select: { id: true, resource: { select: { capacity: true } } },
    orderBy: { id: "asc" },
  });
  for (const instance of inheritedInstances) {
    if (instance.resource && maxCapacity > instance.resource.capacity) throw new Error("Schedule capacity exceeds an occurrence resource capacity");
    await lockTransactionKey(transaction, `class-instance:${instance.id}`);
  }

  // Callers may perform Keystone-validated non-capacity updates here. They share
  // this transaction and the same locks as the capacity check and write.
  if (beforeCapacityWrite) await beforeCapacityWrite();

  const instanceIds = inheritedInstances.map((instance: any) => instance.id);
  if (instanceIds.length) {
    const counts = await transaction.classBooking.groupBy({
      by: ["classInstanceId"],
      where: {
        classInstanceId: { in: instanceIds },
        organizationId: input.organizationId,
        status: "confirmed",
      },
      _count: { _all: true },
    });
    const highestConfirmed = counts.reduce(
      (highest: number, row: any) => Math.max(highest, row._count._all),
      0,
    );
    if (maxCapacity < highestConfirmed) {
      throw new Error(`Capacity cannot be lower than the ${highestConfirmed} confirmed bookings on a class instance`);
    }
  }
  return transaction.classSchedule.update({
    where: { id: schedule.id },
    data: { maxCapacity },
  });
}

export async function updateCapacityControlledClassSchedule(
  prisma: any,
  input: { classScheduleId: string; maxCapacity: number; organizationId: string },
) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction((transaction: any) =>
    updateCapacityControlledClassScheduleInTransaction(transaction, input),
  );
}

/**
 * The availability decision and booking write must share this transaction.
 * The instance lock serializes every writer that can consume a class seat;
 * the member lock also prevents one finite credit being spent in two classes.
 */
export async function createCapacityControlledBooking(
  prisma: any,
  input: CapacityBookingInput
): Promise<CapacityBookingResult> {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actorOrganizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);

    const classInstance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actorOrganizationId },
      include: { classSchedule: { select: { maxCapacity: true, startTime: true, endTime: true } } },
    });
    if (!classInstance) throw new Error("Class instance not found");
    if (classInstance.organizationId !== input.actorOrganizationId) throw new Error("Class is not in the actor's organization");
    if (classInstance.isCancelled) throw new Error("Class has been cancelled");
    if (classInstance.date.getTime() <= Date.now()) throw new Error("Past classes cannot be booked");

    const member = await transaction.member.findFirst({
      where: { id: input.memberId, organizationId: input.actorOrganizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!member) throw new Error("Member not found");
    if (member.organizationId !== input.actorOrganizationId) throw new Error("Member is not in the actor's organization");
    if (!member.user) throw new Error("Member is not linked to a user account");
    if (member.status !== "active") throw new Error("Member account is not active");
    if (
      member.user.id !== input.actorUserId &&
      !input.actorCanManageAllRecords
    ) {
      throw new Error("You cannot manage bookings for another member");
    }

    const membership = await transaction.membership.findFirst({
      where: { memberId: member.user.id, organizationId: input.actorOrganizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } },
    });
    if (!membership) throw new Error("No active membership found");
    await assertNoPendingMembershipFreeze(transaction, input.actorOrganizationId, membership.id);

    await assertParticipationAllowed(transaction, input.actorOrganizationId, member.id, classInstance.date, classInstance.locationId);
    const grant = await ensureMonthlyCreditGrant(transaction, membership, classInstance.date);
    const unlimited = grant.allowance === -1;
    const currentCredits = grant.remaining;
    if (!unlimited && currentCredits <= 0) {
      throw new Error("No class credits remaining");
    }

    const maximumBookings = membership.agreementSnapshot?.maxClassBookings ?? membership.tier?.maxClassBookings ?? 0;
    if (maximumBookings > 0 && await transaction.classBooking.count({ where: { organizationId: input.actorOrganizationId, memberId: member.id, status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: new Date() } } } }) >= maximumBookings) throw new Error("Membership concurrent booking limit reached");
    const duplicate = await transaction.classBooking.findFirst({
      where: {
        classInstanceId: input.classInstanceId,
        memberId: input.memberId,
        organizationId: input.actorOrganizationId,
        status: { in: ["confirmed", "waitlist"] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error("Member already has an active booking for this class instance");
    }

    const capacity =
      classInstance.maxCapacity ??
      classInstance.classSchedule?.maxCapacity ??
      20;
    const confirmedCount = await transaction.classBooking.count({
      where: {
        classInstanceId: input.classInstanceId,
        organizationId: input.actorOrganizationId,
        status: "confirmed",
      },
    });
    const atCapacity = confirmedCount >= capacity;
    if (atCapacity && input.capacityMode === "reject") {
      throw new Error("Class is at capacity, cannot process walk-in");
    }

    const waitlistPosition = atCapacity
      ? (await transaction.classBooking.count({
          where: {
            classInstanceId: input.classInstanceId,
            organizationId: input.actorOrganizationId,
            status: "waitlist",
          },
        })) + 1
      : null;
    const status = atCapacity ? "waitlist" : "confirmed";
    if (status === "confirmed") await assertNoMemberServiceConflict(transaction, member.id, input.actorOrganizationId, classInstance);
    const booking = await transaction.classBooking.create({
      data: {
        organizationId: classInstance.organizationId,
        classInstanceId: input.classInstanceId,
        memberId: input.memberId,
        memberName: member.user.name || member.name,
        memberEmail: member.user.email || member.email,
        memberPhone: member.phone || "",
        status,
        activeBookingKey: "active",
        waitlistPosition,
        bookedAt: new Date(),
      },
      select: { id: true },
    });

    if (status === "confirmed") await debitBookingCredit(transaction, membership, booking.id, classInstance.date);
    await enqueueOperationalNotice(transaction, { organizationId: input.actorOrganizationId, memberId: member.id,
      key: `booking:${booking.id}:created`, kind: "booking", message: status === "confirmed" ? "Your class booking is confirmed." : "You joined the waitlist. A released place is automatically confirmed and reserves any required class credit; we will notify you." });

    return {
      bookingId: booking.id,
      status,
      waitlistPosition,
      creditsRemaining: unlimited
        ? -1
        : currentCredits - (status === "confirmed" ? 1 : 0),
    };
  });
}

export async function promoteCapacityControlledWaitlistBooking(
  prisma: any,
  classInstanceId: string,
  organizationId: string
) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction((transaction: any) =>
    promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId),
  );
}

/** Caller must hold the participation-policy and class-instance locks when locksAlreadyHeld is true. */
export async function promoteCapacityControlledWaitlistBookingInTransaction(
  transaction: any,
  classInstanceId: string,
  organizationId: string,
  locksAlreadyHeld = false,
) {
  transaction = guardKeystonePrismaResults(transaction);
  if (!locksAlreadyHeld) {
    await lockParticipationPolicy(transaction, organizationId);
    await lockTransactionKey(transaction, `class-instance:${classInstanceId}`);
  }

  const classInstance = await transaction.classInstance.findFirst({
    where: { id: classInstanceId, organizationId },
    include: { classSchedule: { select: { maxCapacity: true, startTime: true, endTime: true } } },
  });
  if (!classInstance) throw new Error("Class instance not found");
  if (classInstance.organizationId !== organizationId) throw new Error("Class is not in the requested organization");
  if (classInstance.isCancelled) {
    return { promoted: false, message: "Class has been cancelled" };
  }
  if (classInstance.date.getTime() <= Date.now()) {
    return { promoted: false, message: "Past classes cannot promote a waitlist" };
  }

  const capacity = classInstance.maxCapacity ?? classInstance.classSchedule?.maxCapacity ?? 20;
  const confirmedCount = await transaction.classBooking.count({
    where: { classInstanceId, organizationId, status: "confirmed" },
  });
  if (confirmedCount >= capacity) {
    return { promoted: false, message: "Class is already at capacity" };
  }

  const candidates = await transaction.classBooking.findMany({
    where: { classInstanceId, organizationId, status: "waitlist" },
    orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
    take: 10000,
    include: {
      member: { include: { user: { select: { id: true } } } },
    },
  });
  if (!candidates.length) return { promoted: false, message: "No members on waitlist" };

  let booking: any = null;
  let membership: any = null;
  for (const candidate of candidates) {
    if (candidate.member?.organizationId !== organizationId) {
      throw new Error("Waitlisted member is not in the class organization");
    }
    if (candidate.member?.status !== "active" || !candidate.member?.user?.id) continue;
    const candidateMembership = await transaction.membership.findFirst({
      where: { memberId: candidate.member.user.id, organizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } },
    });
    if (!candidateMembership) continue;
    await lockTransactionKey(transaction, `member:${candidate.memberId}`);
    const lockedMembership = await transaction.membership.findFirst({
      where: { id: candidateMembership.id, organizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } },
    });
    if (!lockedMembership) continue;
    const lockedMember = await transaction.member.findFirst({ where: { id: candidate.memberId, organizationId, status: "active" } });
    if (!lockedMember) continue;
    try {
      await assertNoPendingMembershipFreeze(transaction, organizationId, lockedMembership.id);
      await assertParticipationAllowed(transaction, organizationId, candidate.memberId, classInstance.date, classInstance.locationId);
      await assertNoMemberServiceConflict(transaction, candidate.memberId, organizationId, classInstance);
      const grant = await ensureMonthlyCreditGrant(transaction, lockedMembership, classInstance.date);
      if (grant.allowance !== -1 && grant.remaining <= 0) {
        if (candidate.eligibilityReviewReason) {
          await transaction.classBooking.update({ where: { id: candidate.id }, data: { eligibilityReviewReason: "" } });
        }
        continue;
      }
    } catch (error) {
      // Expected policy denials are visible to staff; infrastructure failures
      // must abort instead of being silently acknowledged as ineligibility.
      if (!(error instanceof Error) || !/Membership|membership|Service is outside|waiver|Waiver|closure|closed|participation|Adult age verification|Registered participant verification|overlapping training appointment|overlapping class/i.test(error.message)) throw error;
      await transaction.classBooking.update({ where: { id: candidate.id }, data: { eligibilityReviewReason: error.message } });
      continue;
    }
    booking = candidate;
    membership = lockedMembership;
    break;
  }
  if (!booking || !membership) {
    return { promoted: false, message: "No eligible members on waitlist" };
  }

  await transaction.classBooking.update({
    where: { id: booking.id },
    data: { status: "confirmed", waitlistPosition: null, eligibilityReviewReason: "" },
  });
  await debitBookingCredit(transaction, membership, booking.id, classInstance.date);
  const remaining = await transaction.classBooking.findMany({
    where: { classInstanceId, organizationId, status: "waitlist" },
    orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (let index = 0; index < remaining.length; index++) {
    await transaction.classBooking.update({ where: { id: remaining[index].id }, data: { waitlistPosition: index + 1 } });
  }
  const promotionNotice = await enqueueOperationalNotice(transaction, {
    organizationId,
    memberId: booking.memberId,
    key: `booking:${booking.id}:promoted`,
    kind: "promotion",
    message: "A waitlist place opened. Your booking is now confirmed and any required credit has been reserved for this class.",
  });
  // Keystone's Prisma extension can return a GraphQLError value instead of rejecting.
  // Re-throw so this transaction rolls back the seat and credit changes as well.
  if (promotionNotice instanceof Error) throw promotionNotice;
  return { promoted: true, bookingId: booking.id, message: "Member promoted from waitlist" };
}

export async function assertNoMemberServiceConflict(tx: any, memberId: string, organizationId: string, instance: any) {
  tx = guardKeystonePrismaResults(tx);
  const minutes = (value: string) => Number(value?.slice(0, 2)) * 60 + Number(value?.slice(3));
  const duration = minutes(instance.classSchedule?.endTime) - minutes(instance.classSchedule?.startTime);
  const end = instance.endsAt || new Date(instance.date.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 60) * 60000);
  const conflict = await tx.trainerAppointment.findFirst({ where: { organizationId, memberId, status: { in: ["scheduled", "confirmed", "checked_in"] }, startTime: { lt: end }, endTime: { gt: instance.date } }, select: { id: true } });
  if (conflict) throw new Error("Member has an overlapping training appointment");
  const booked = await tx.classBooking.findMany({ where: { organizationId, memberId, classInstanceId: { not: instance.id }, status: "confirmed", classInstance: { isCancelled: false, date: { lt: end, gt: new Date(instance.date.getTime() - 86400000) } } }, include: { classInstance: { include: { classSchedule: true } } }, take: 1000 });
  if (booked.length >= 1000) throw new Error("Member service calendar requires review");
  for (const booking of booked) {
    const other = booking.classInstance;
    if (!other) throw new Error("Member booking has no service occurrence; review required");
    const otherDuration = minutes(other.classSchedule?.endTime) - minutes(other.classSchedule?.startTime);
    const otherEnd = other.endsAt || new Date(other.date.getTime() + (Number.isFinite(otherDuration) && otherDuration > 0 ? otherDuration : 60) * 60000);
    if (other.date < end && otherEnd > instance.date) throw new Error("Member has an overlapping class");
  }
}
