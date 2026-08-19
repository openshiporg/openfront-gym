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
  await transaction.$queryRaw`
    SELECT true AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired
  `;
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
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    const instance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.organizationId },
      include: { classSchedule: { select: { maxCapacity: true } } },
    });
    if (!instance || instance.organizationId !== input.organizationId) {
      throw new Error("Class instance was not found in this organization");
    }
    const requested = boundedCapacity(input.maxCapacity, true);
    const effectiveCapacity = requested ?? instance.classSchedule?.maxCapacity;
    if (typeof effectiveCapacity !== "number") throw new Error("Class instance capacity is unavailable");
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

export async function updateCapacityControlledClassSchedule(
  prisma: any,
  input: { classScheduleId: string; maxCapacity: number; organizationId: string },
) {
  const maxCapacity = boundedCapacity(input.maxCapacity) as number;
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `class-schedule:${input.classScheduleId}`);
    const schedule = await transaction.classSchedule.findFirst({
      where: { id: input.classScheduleId, organizationId: input.organizationId },
    });
    if (!schedule || schedule.organizationId !== input.organizationId) {
      throw new Error("Class schedule was not found in this organization");
    }
    const inheritedInstances = await transaction.classInstance.findMany({
      where: { classScheduleId: schedule.id, organizationId: input.organizationId, maxCapacity: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const instance of inheritedInstances) {
      await lockTransactionKey(transaction, `class-instance:${instance.id}`);
    }
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
  });
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
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);

    const classInstance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actorOrganizationId },
      include: { classSchedule: { select: { maxCapacity: true } } },
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
      include: { tier: { select: { classCreditsPerMonth: true } } },
    });
    if (!membership) throw new Error("No active membership found");

    const unlimited = membership.tier?.classCreditsPerMonth === -1;
    const currentCredits = membership.classCreditsRemaining ?? 0;
    if (!unlimited && currentCredits <= 0) {
      throw new Error("No class credits remaining");
    }

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

    if (status === "confirmed" && !unlimited) {
      await transaction.membership.update({
        where: { id: membership.id },
        data: { classCreditsRemaining: currentCredits - 1 },
      });
    }

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
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `class-instance:${classInstanceId}`);

    const classInstance = await transaction.classInstance.findFirst({
      where: { id: classInstanceId, organizationId },
      include: { classSchedule: { select: { maxCapacity: true } } },
    });
    if (!classInstance) throw new Error("Class instance not found");
    if (classInstance.organizationId !== organizationId) throw new Error("Class is not in the requested organization");
    if (classInstance.isCancelled) {
      return { promoted: false, message: "Class has been cancelled" };
    }
    if (classInstance.date.getTime() <= Date.now()) {
      return { promoted: false, message: "Past classes cannot promote a waitlist" };
    }

    const capacity =
      classInstance.maxCapacity ?? classInstance.classSchedule?.maxCapacity ?? 20;
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
    let unlimited = false;
    let credits = 0;
    for (const candidate of candidates) {
      if (candidate.member?.organizationId !== organizationId) {
        throw new Error("Waitlisted member is not in the class organization");
      }
      if (candidate.member?.status !== "active" || !candidate.member?.user?.id) continue;
      const candidateMembership = await transaction.membership.findFirst({
        where: { memberId: candidate.member.user.id, organizationId, status: "active" },
        include: { tier: { select: { classCreditsPerMonth: true } } },
      });
      if (!candidateMembership) continue;
      const appearsUnlimited = candidateMembership.tier?.classCreditsPerMonth === -1;
      if (!appearsUnlimited && (candidateMembership.classCreditsRemaining ?? 0) <= 0) continue;

      await lockTransactionKey(transaction, `member:${candidate.memberId}`);
      const lockedMembership = await transaction.membership.findFirst({
        where: { id: candidateMembership.id, organizationId, status: "active" },
        include: { tier: { select: { classCreditsPerMonth: true } } },
      });
      const lockedUnlimited = lockedMembership?.tier?.classCreditsPerMonth === -1;
      const lockedCredits = lockedMembership?.classCreditsRemaining ?? 0;
      if (!lockedMembership || (!lockedUnlimited && lockedCredits <= 0)) {
        return { promoted: false, message: "Waitlist eligibility changed; retry promotion" };
      }
      booking = candidate;
      membership = lockedMembership;
      unlimited = lockedUnlimited;
      credits = lockedCredits;
      break;
    }
    if (!booking || !membership) {
      return { promoted: false, message: "No eligible members on waitlist" };
    }

    await transaction.classBooking.update({
      where: { id: booking.id },
      data: { status: "confirmed", waitlistPosition: null },
    });
    if (!unlimited) {
      await transaction.membership.update({
        where: { id: membership.id },
        data: { classCreditsRemaining: credits - 1 },
      });
    }
    return { promoted: true, bookingId: booking.id, message: "Member promoted from waitlist" };
  });
}
