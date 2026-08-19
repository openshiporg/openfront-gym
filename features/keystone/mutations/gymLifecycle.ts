import {
  lockTransactionKey,
  promoteCapacityControlledWaitlistBooking,
} from "./classCapacity";
import {
  normalizeAttendanceOutcome,
  normalizeCheckInMethod,
  type AttendanceOutcome,
  type CheckInMethod,
} from "./gymLifecyclePolicy";

export type LifecycleActor = {
  userId: string;
  organizationId?: string | null;
  canManageAllRecords: boolean;
  isInstructor?: boolean;
  trustedKiosk?: boolean;
};

function assertActorOrganization(actor: LifecycleActor, organizationId?: string | null) {
  if (!organizationId || !actor.organizationId || actor.organizationId !== organizationId) {
    throw new Error("Actor is not in the record organization");
  }
}

function assertOwnerOrOperator(actor: LifecycleActor, ownerUserId?: string | null) {
  if (actor.canManageAllRecords || actor.trustedKiosk || actor.userId === ownerUserId) return;
  throw new Error("You cannot manage another member's records");
}

export async function cancelCapacityControlledBooking(
  prisma: any,
  input: { bookingId: string; actor: LifecycleActor }
) {
  const result = await prisma.$transaction(async (transaction: any) => {
    const identity = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      select: { classInstanceId: true, memberId: true },
    });
    if (!identity?.classInstanceId || !identity.memberId) throw new Error("Booking not found");

    await lockTransactionKey(transaction, `class-instance:${identity.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${identity.memberId}`);
    const booking = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      include: {
        classInstance: { select: { id: true, date: true, organizationId: true } },
        member: {
          include: {
            user: {
              include: {
                membership: {
                  include: { tier: { select: { classCreditsPerMonth: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!booking?.member?.user?.id || !booking.classInstance) {
      throw new Error("Booking owner or class instance is missing");
    }
    assertActorOrganization(input.actor, booking.classInstance.organizationId);
    assertActorOrganization(input.actor, booking.member.organizationId);
    assertOwnerOrOperator(input.actor, booking.member.user.id);

    if (booking.status === "cancelled") {
      return {
        bookingId: booking.id,
        classInstanceId: booking.classInstance.id,
        cancelled: false,
        releasedConfirmedSpot: false,
      };
    }
    if (!['confirmed', 'waitlist'].includes(booking.status)) {
      throw new Error(`Booking cannot be cancelled from ${booking.status}`);
    }
    if (booking.classInstance.date.getTime() <= Date.now()) {
      throw new Error("A class booking cannot be cancelled after the class starts");
    }

    await transaction.classBooking.update({
      where: { id: booking.id },
      data: {
        status: "cancelled",
        activeBookingKey: null,
        cancelledAt: new Date(),
        waitlistPosition: null,
      },
    });

    const membership = booking.member.user.membership;
    const allowance = membership?.tier?.classCreditsPerMonth;
    const unlimited = allowance === -1;
    if (booking.status === "confirmed" && membership && !unlimited && typeof allowance === "number") {
      const currentCredits = membership.classCreditsRemaining ?? 0;
      const nextCredits = Math.min(currentCredits + 1, Math.max(allowance, 0));
      if (nextCredits > currentCredits) {
        await transaction.membership.update({
          where: { id: membership.id },
          data: { classCreditsRemaining: nextCredits },
        });
      }
    }

    const waiting = await transaction.classBooking.findMany({
      where: {
        classInstanceId: booking.classInstance.id,
        status: "waitlist",
      },
      orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    await Promise.all(
      waiting.map((entry: { id: string }, index: number) =>
        transaction.classBooking.update({
          where: { id: entry.id },
          data: { waitlistPosition: index + 1 },
        })
      )
    );

    return {
      bookingId: booking.id,
      classInstanceId: booking.classInstance.id,
      cancelled: true,
      releasedConfirmedSpot: booking.status === "confirmed",
    };
  });

  const promotion = result.releasedConfirmedSpot
    ? await promoteCapacityControlledWaitlistBooking(prisma, result.classInstanceId, input.actor.organizationId!)
    : { promoted: false, message: "No confirmed spot was released" };
  return { ...result, promotion };
}

export async function cancelCapacityControlledClassInstance(
  prisma: any,
  input: {
    classInstanceId: string;
    reason: string;
    actor: LifecycleActor;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000) {
    throw new Error("Class cancellation reason must be between 3 and 1000 characters");
  }
  if (!input.actor.canManageAllRecords) {
    throw new Error("Class cancellation management permission required");
  }

  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    const loadClassInstance = () => transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actor.organizationId },
      include: {
        bookings: {
          where: { status: { in: ["confirmed", "waitlist"] } },
          include: {
            member: {
              include: {
                user: {
                  include: {
                    membership: {
                      include: { tier: { select: { classCreditsPerMonth: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    let classInstance = await loadClassInstance();
    if (!classInstance) throw new Error("Class instance not found");
    assertActorOrganization(input.actor, classInstance.organizationId);
    if (classInstance.date.getTime() <= Date.now()) {
      throw new Error("A class instance cannot be cancelled after it starts");
    }
    if (classInstance.isCancelled) {
      return {
        classInstanceId: classInstance.id,
        cancelledBookings: 0,
        refundedCredits: 0,
        reused: true,
      };
    }

    const memberIds = [...new Set(
      classInstance.bookings
        .map((booking: any) => booking.memberId)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    )].sort();
    for (const memberId of memberIds) {
      await lockTransactionKey(transaction, `member:${memberId}`);
    }
    // Membership balances may have changed while waiting for a member lock.
    // Reload only after every member lock is held to avoid lost credit updates.
    classInstance = await loadClassInstance();
    if (!classInstance || classInstance.isCancelled) throw new Error("Class instance changed during cancellation");

    let refundedCredits = 0;
    for (const booking of classInstance.bookings) {
      if (booking.status !== "confirmed") continue;
      const membership = booking.member?.user?.membership;
      const allowance = membership?.tier?.classCreditsPerMonth;
      const unlimited = allowance === -1;
      if (membership && !unlimited && typeof allowance === "number") {
        const currentCredits = membership.classCreditsRemaining ?? 0;
        const nextCredits = Math.min(currentCredits + 1, Math.max(allowance, 0));
        if (nextCredits > currentCredits) {
          await transaction.membership.update({
            where: { id: membership.id },
            data: { classCreditsRemaining: nextCredits },
          });
          refundedCredits += 1;
        }
      }
    }

    const cancelledAt = new Date();
    await transaction.classBooking.updateMany({
      where: {
        classInstanceId: classInstance.id,
        status: { in: ["confirmed", "waitlist"] },
      },
      data: {
        status: "cancelled",
        activeBookingKey: null,
        cancelledAt,
        waitlistPosition: null,
      },
    });
    await transaction.classInstance.update({
      where: { id: classInstance.id },
      data: { isCancelled: true, cancellationReason: reason },
    });

    return {
      classInstanceId: classInstance.id,
      cancelledBookings: classInstance.bookings.length,
      refundedCredits,
      reused: false,
    };
  });
}

export async function markCapacityControlledAttendance(
  prisma: any,
  input: {
    bookingId: string;
    outcome: AttendanceOutcome | string;
    minutesLate?: number | null;
    notes?: string | null;
    actor: LifecycleActor;
  }
) {
  const outcome = normalizeAttendanceOutcome(input.outcome);
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `attendance:${input.bookingId}`);
    const booking = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      include: {
        member: { select: { id: true, organizationId: true } },
        classInstance: {
          include: {
            instructor: { include: { user: { select: { id: true } } } },
            classSchedule: {
              include: { instructor: { include: { user: { select: { id: true } } } } },
            },
          },
        },
      },
    });
    if (!booking?.memberId || !booking.classInstance?.classScheduleId) {
      throw new Error("Attendance booking is missing its member or schedule");
    }
    assertActorOrganization(input.actor, booking.member.organizationId);
    assertActorOrganization(input.actor, booking.classInstance.organizationId);
    if (booking.status !== "confirmed") {
      throw new Error("Attendance can only be marked for a confirmed booking");
    }
    if (booking.classInstance.isCancelled) throw new Error("Attendance cannot be marked for a cancelled class");
    if (booking.classInstance.date.getTime() > Date.now()) {
      throw new Error("Attendance cannot be marked before the class starts");
    }
    const assignedInstructorIds = [
      booking.classInstance.instructor?.user?.id,
      booking.classInstance.classSchedule?.instructor?.user?.id,
    ].filter(Boolean);
    if (
      !input.actor.canManageAllRecords &&
      !(input.actor.isInstructor && assignedInstructorIds.includes(input.actor.userId))
    ) {
      throw new Error("Attendance management permission required");
    }

    const requestedMinutes = Number(input.minutesLate ?? 0);
    const minutesLate = outcome === "late"
      ? Math.min(Math.max(Number.isFinite(requestedMinutes) ? Math.floor(requestedMinutes) : 5, 1), 180)
      : null;
    const data = {
      organizationId: booking.member.organizationId,
      bookingId: booking.id,
      classScheduleId: booking.classInstance.classScheduleId,
      memberId: booking.memberId,
      markedById: input.actor.userId,
      markedAt: new Date(),
      attended: outcome !== "no-show",
      lateArrival: outcome === "late",
      minutesLate,
      noShowReason: outcome === "no-show" ? input.notes?.trim() || "Marked from roster" : "",
    };
    const existing = await transaction.attendanceRecord.findFirst({
      where: { bookingId: booking.id, organizationId: input.actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const record = existing
      ? await transaction.attendanceRecord.update({ where: { id: existing.id }, data })
      : await transaction.attendanceRecord.create({ data });
    return { id: record.id, outcome };
  });
}

export async function recordCapacityControlledMemberCheckIn(
  prisma: any,
  input: {
    memberId: string;
    locationId?: string | null;
    method: CheckInMethod | string;
    actor: LifecycleActor;
  }
) {
  const method = normalizeCheckInMethod(input.method);
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `check-in:${input.memberId}`);
    const member = await transaction.member.findFirst({
      where: { id: input.memberId, organizationId: input.actor.organizationId },
      include: {
        user: { include: { membership: { select: { status: true } } } },
        subscriptions: { where: { status: "active" }, select: { id: true } },
      },
    });
    if (!member?.user?.id) throw new Error("Member not found");
    assertActorOrganization(input.actor, member.organizationId);
    assertOwnerOrOperator(input.actor, member.user.id);
    if (member.status !== "active") throw new Error(`Member status is ${member.status}`);
    const membershipStatus = member.user.membership?.status;
    const validAccess = membershipStatus ? membershipStatus === "active" : member.subscriptions.length > 0;
    if (!validAccess) throw new Error("No active membership or subscription");

    if (input.locationId) {
      const location = await transaction.location.findFirst({
        where: { id: input.locationId, organizationId: input.actor.organizationId },
        select: { isActive: true, organizationId: true },
      });
      if (!location?.isActive) throw new Error("Check-in location is not active");
      if (location.organizationId !== member.organizationId) throw new Error("Check-in location is not in the member's organization");
    }

    const existing = await transaction.checkIn.findFirst({
      where: {
        memberId: member.id,
        organizationId: input.actor.organizationId,
        isGuest: false,
        checkOutTime: null,
      },
      orderBy: { checkInTime: "desc" },
    });
    if (existing) return { checkIn: existing, reused: true };

    if (input.actor.organizationId !== member.organizationId) throw new Error("Check-in actor organization is invalid");

    const checkIn = await transaction.checkIn.create({
      data: {
        organizationId: member.organizationId,
        memberId: member.id,
        openCheckInKey: "open",
        locationId: input.locationId || null,
        method,
        membershipValidated: true,
        validationNotes: "Validated by controlled check-in transition",
      },
    });
    return { checkIn, reused: false };
  });
}

export async function recordControlledGuestCheckIn(
  prisma: any,
  input: {
    guestName: string;
    hostMemberId?: string | null;
    organizationId: string;
    phone?: string | null;
    idempotencyKey: string;
  }
) {
  const guestName = input.guestName.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!guestName) throw new Error("Guest name is required");
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("Guest check-in idempotency key is required");
  const host = input.hostMemberId
    ? await prisma.member.findFirst({
        where: { id: input.hostMemberId, organizationId: input.organizationId },
        select: { organizationId: true },
      })
    : null;
  if (input.hostMemberId && !host) throw new Error("Host member not found");
  const organizationId = input.organizationId;
  if (!organizationId || (host && host.organizationId !== organizationId)) {
    throw new Error("Guest check-in organization is invalid");
  }
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `guest-check-in:${organizationId}:${idempotencyKey}`);
    const marker = `[request:${idempotencyKey}]`;
    const existing = await transaction.checkIn.findFirst({
      where: { organizationId, isGuest: true, validationNotes: { contains: marker } },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
    return transaction.checkIn.create({
      data: {
        organizationId,
        memberId: input.hostMemberId || null,
        isGuest: true,
        guestName,
        method: "manual",
        membershipValidated: false,
        validationNotes: `${marker}${input.phone?.trim() ? ` Guest phone: ${input.phone.trim()}.` : ""}${input.hostMemberId ? " Invited by member." : ""}`,
      },
    });
  });
}

export async function checkOutControlledMember(
  prisma: any,
  input: { checkInId: string; actor: LifecycleActor }
) {
  return prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `check-out:${input.checkInId}`);
    const checkIn = await transaction.checkIn.findFirst({
      where: { id: input.checkInId, organizationId: input.actor.organizationId },
      include: { member: { include: { user: { select: { id: true } } } } },
    });
    if (!checkIn) throw new Error("Check-in not found");
    assertActorOrganization(input.actor, checkIn.organizationId);
    assertOwnerOrOperator(input.actor, checkIn.member?.user?.id);
    if (checkIn.checkOutTime) return { checkIn, reused: true };
    const updated = await transaction.checkIn.update({
      where: { id: checkIn.id },
      data: { checkOutTime: new Date(), openCheckInKey: null },
    });
    return { checkIn: updated, reused: false };
  });
}
