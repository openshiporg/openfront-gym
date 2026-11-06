import { assertFacilityAccessHours } from "../lib/membership-access-hours";
import { assertInstructorQualifications } from "./trainerQualifications";
import { assertNoPendingMembershipFreeze, restoreBookingCredit, assertMembershipServiceEligibility } from "../lib/membership-credits";
import { assertParticipationAllowed, lockParticipationPolicy } from "../lib/operational-policy";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import {
  isDropInBooking,
  lockTransactionKey,
  promoteCapacityControlledWaitlistBookingInTransaction,
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
  canManageCheckIns?: boolean;
  canManageFacilities?: boolean;
};

function assertFacilityStaff(actor: LifecycleActor) {
  if (actor.canManageAllRecords || actor.canManageCheckIns || actor.canManageFacilities || actor.trustedKiosk) return;
  throw new Error("Facility check-in management permission required");
}

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
  input: { bookingId: string; actor: LifecycleActor; pastBookingReason?: string }
) {
  prisma = guardKeystonePrismaResults(prisma);
  // Staff correction for a confirmed booking on a class that already started and was never
  // marked: same locks, credit handling and member notice as a normal cancel, plus a reason.
  const past = input.pastBookingReason !== undefined;
  const reason = (input.pastBookingReason ?? "").trim();
  if (past) {
    if (reason.length < 3 || reason.length > 1000) throw new Error("A reason between 3 and 1000 characters is required");
    if (!input.actor.canManageAllRecords) throw new Error("Booking management permission required");
  }
  const result = await prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
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
        classInstance: { select: { id: true, date: true, organizationId: true, isCancelled: true } },
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
        promotion: { promoted: false, message: "No confirmed spot was released" },
      };
    }
    if (!['confirmed', 'waitlist'].includes(booking.status)) {
      throw new Error(`Booking cannot be cancelled from ${booking.status}`);
    }
    if (past) {
      if (booking.status !== "confirmed") throw new Error("Only a confirmed booking can be cancelled after the class");
      if (booking.classInstance.isCancelled) throw new Error("This class was cancelled; its bookings are already closed");
      if (booking.classInstance.date.getTime() > Date.now()) throw new Error("This class hasn't started; use the normal cancel");
      const marked = await transaction.attendanceRecord.findFirst({ where: { bookingId: booking.id, organizationId: input.actor.organizationId }, select: { id: true } });
      if (marked) throw new Error("This booking has an attendance mark; undo the check-in first");
    } else if (booking.classInstance.date.getTime() <= Date.now()) {
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

    if (booking.status === "confirmed" && !isDropInBooking(booking)) await restoreBookingCredit(transaction, booking.id);
    await enqueueOperationalNotice(transaction, { organizationId: input.actor.organizationId!, memberId: booking.memberId,
      key: `booking:${booking.id}:cancelled`, kind: "cancellation", message: "Your class booking has been cancelled. Any restorable credit returns to its original service month.",
      ...(past ? { history: [{ action: "past_booking_cancelled", at: new Date().toISOString(), actorId: input.actor.userId, note: reason }] } : {}) });

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

    const releasedConfirmedSpot = booking.status === "confirmed";
    // A class that already started never promotes from its waitlist.
    const promotion = releasedConfirmedSpot && !past
      ? await promoteCapacityControlledWaitlistBookingInTransaction(
          transaction,
          booking.classInstance.id,
          input.actor.organizationId!,
          true,
        )
      : { promoted: false, message: "No confirmed spot was released" };

    return {
      bookingId: booking.id,
      classInstanceId: booking.classInstance.id,
      cancelled: true,
      releasedConfirmedSpot,
      promotion,
    };
  });

  return result;
}

export async function cancelCapacityControlledClassInstance(
  prisma: any,
  input: {
    classInstanceId: string;
    reason: string;
    actor: LifecycleActor;
  },
) {
  prisma = guardKeystonePrismaResults(prisma);
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000) {
    throw new Error("Class cancellation reason must be between 3 and 1000 characters");
  }
  if (!input.actor.canManageAllRecords) {
    throw new Error("Class cancellation management permission required");
  }

  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
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
      if (booking.status !== "confirmed" || isDropInBooking(booking)) continue;
      if (await restoreBookingCredit(transaction, booking.id)) refundedCredits += 1;
    }
    for (const booking of classInstance.bookings) await enqueueOperationalNotice(transaction, { organizationId: input.actor.organizationId!, memberId: booking.memberId,
      key: `booking:${booking.id}:class-cancelled`, kind: "cancellation", message: `Your class has been cancelled: ${reason}` });

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

/**
 * Loads a booking for a staff attendance change under its attendance lock and applies the
 * shared rules: same organization, confirmed booking, class not cancelled and already
 * started, and the actor is an operator or the session's current active coach. Marking and
 * undoing attendance both go through here.
 */
async function loadStaffAttendanceBooking(transaction: any, bookingId: string, actor: LifecycleActor) {
  await lockTransactionKey(transaction, `attendance:${bookingId}`);
  const booking = await transaction.classBooking.findFirst({
    where: { id: bookingId, organizationId: actor.organizationId },
    include: {
      member: { include: { user: { include: { membership: true } } } },
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
  assertActorOrganization(actor, booking.member.organizationId);
  assertActorOrganization(actor, booking.classInstance.organizationId);
  if (booking.status !== "confirmed") {
    throw new Error("Attendance can only be marked for a confirmed booking");
  }
  if (booking.classInstance.isCancelled) throw new Error("Attendance cannot be marked for a cancelled class");
  if (booking.classInstance.date.getTime() > Date.now()) {
    throw new Error("Attendance cannot be marked before the class starts");
  }
  // Only the session's current, active coach (or an operator) records attendance; a retired
  // coach keeps no operational authority over past assignments.
  const effectiveInstructor = booking.classInstance.instructor ?? booking.classInstance.classSchedule?.instructor ?? null;
  const assignedToActor = Boolean(effectiveInstructor?.isActive && effectiveInstructor?.user?.id === actor.userId);
  if (!actor.canManageAllRecords && !(actor.isInstructor && assignedToActor)) {
    throw new Error("Attendance management permission required");
  }
  return booking;
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
  prisma = guardKeystonePrismaResults(prisma);
  const outcome = normalizeAttendanceOutcome(input.outcome);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
    const booking = await loadStaffAttendanceBooking(transaction, input.bookingId, input.actor);

    if (outcome !== "no-show") {
      await lockTransactionKey(transaction, `member:${booking.memberId}`);
      const currentMember = await transaction.member.findFirst({ where: { id: booking.memberId, organizationId: input.actor.organizationId }, include: { user: { include: { membership: true } } } });
      assertInstructorQualifications(booking.classInstance.instructor ?? booking.classInstance.classSchedule?.instructor ?? {}, new Date());
      if (currentMember?.status !== "active") throw new Error("Member account is not active");
      // A paid drop-in is its own entitlement for this one class.
      if (!isDropInBooking(booking)) try {
        assertMembershipServiceEligibility(currentMember.user?.membership, booking.classInstance.date);
      } catch (error) {
        // An operator may record yesterday's attendance after a monthly renewal.
        // The immutable debit lot proves that historical service was paid; it
        // never grants access to a suspended/frozen member or an unfunded date.
        const debit = await transaction.membershipCreditEntry.findUnique({ where: { key: `${booking.id}:debit` }, include: { grant: true } });
        const membership = currentMember.user?.membership;
        if (membership?.status !== "active" || !(error instanceof Error) || error.message !== "Service is outside the paid membership period" || debit?.grant?.membershipId !== membership.id || booking.classInstance.date < debit.grant.periodStart || booking.classInstance.date >= debit.grant.periodEnd) throw error;
      }
      await assertParticipationAllowed(transaction, input.actor.organizationId!, booking.memberId, booking.classInstance.date, booking.classInstance.locationId);
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

/**
 * Staff correction for a mistaken check-in or attendance mark: the booking goes back to
 * Unmarked by removing its attendance record. Same permissions and session rules as
 * marking. Credits are untouched (they are debited at booking, not at attendance).
 */
export async function undoCapacityControlledAttendance(
  prisma: any,
  input: { bookingId: string; actor: LifecycleActor }
) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
    const booking = await loadStaffAttendanceBooking(transaction, input.bookingId, input.actor);
    const removed = await transaction.attendanceRecord.deleteMany({
      where: { bookingId: booking.id, organizationId: input.actor.organizationId },
    });
    return { bookingId: booking.id, removed: removed.count as number };
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
  prisma = guardKeystonePrismaResults(prisma);
  assertFacilityStaff(input.actor);
  const method = normalizeCheckInMethod(input.method);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
    await lockTransactionKey(transaction, `check-in:${input.memberId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);
    const member = await transaction.member.findFirst({
      where: { id: input.memberId, organizationId: input.actor.organizationId },
      include: {
        user: { include: { membership: true } },
        subscriptions: { where: { status: "active" }, select: { id: true } },
      },
    });
    if (!member?.user?.id) throw new Error("Member not found");
    assertActorOrganization(input.actor, member.organizationId);
    if (member.status !== "active") throw new Error(`Member status is ${member.status}`);
    if (member.user.membership?.id) await assertNoPendingMembershipFreeze(transaction, input.actor.organizationId!, member.user.membership.id);
    assertMembershipServiceEligibility(member.user.membership, new Date());
    await assertFacilityAccessHours(transaction, input.actor.organizationId!, member.user.membership, new Date());
    await assertParticipationAllowed(transaction, input.actor.organizationId!, member.id, new Date(), input.locationId);

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
  prisma = guardKeystonePrismaResults(prisma);
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
    await lockParticipationPolicy(transaction, input.organizationId);
    await assertFacilityAccessHours(transaction, organizationId, null, new Date());
    await assertParticipationAllowed(transaction, organizationId, null, new Date());
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
  prisma = guardKeystonePrismaResults(prisma);
  assertFacilityStaff(input.actor);
  return prisma.$transaction(async (transaction: any) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId!);
    await lockTransactionKey(transaction, `check-out:${input.checkInId}`);
    const checkIn = await transaction.checkIn.findFirst({
      where: { id: input.checkInId, organizationId: input.actor.organizationId },
      include: { member: { include: { user: { select: { id: true } } } } },
    });
    if (!checkIn) throw new Error("Check-in not found");
    assertActorOrganization(input.actor, checkIn.organizationId);
    if (checkIn.checkOutTime) return { checkIn, reused: true };
    const updated = await transaction.checkIn.update({
      where: { id: checkIn.id },
      data: { checkOutTime: new Date(), openCheckInKey: null },
    });
    return { checkIn: updated, reused: false };
  });
}

/**
 * A membership that has ended gives up its future classes, the way Mindbody removes a cancelled
 * client from upcoming visits: every confirmed or waitlisted booking for a class that hasn't started
 * is cancelled through the normal path, so credits, waitlist promotion and the member notice all apply.
 */
export async function releaseFutureBookingsForEndedMembership(
  prisma: any,
  input: { organizationId: string; userId: string; actorUserId: string },
) {
  prisma = guardKeystonePrismaResults(prisma);
  const member = await prisma.member.findFirst({
    where: { organizationId: input.organizationId, userId: input.userId },
    select: { id: true },
  });
  if (!member) return { released: 0, failed: 0 };
  const bookings = await prisma.classBooking.findMany({
    where: {
      organizationId: input.organizationId,
      memberId: member.id,
      status: { in: ["confirmed", "waitlist"] },
      classInstance: { date: { gt: new Date() }, isCancelled: false },
    },
    select: { id: true },
    orderBy: { bookedAt: "asc" },
  });
  const actor: LifecycleActor = { userId: input.actorUserId, organizationId: input.organizationId, canManageAllRecords: true };
  let released = 0;
  let failed = 0;
  for (const booking of bookings) {
    try {
      const result = await cancelCapacityControlledBooking(prisma, { bookingId: booking.id, actor });
      if (result.cancelled) released += 1;
    } catch (error) {
      failed += 1;
      console.error("Releasing a booking for an ended membership failed", { bookingId: booking.id, name: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return { released, failed };
}

