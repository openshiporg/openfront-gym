import type { Context } from ".keystone/types";
import { currentCheckInActor } from "../access/currentCheckInActor";
import { currentRoleActor } from "../access/currentRoleActor";
import {
  cancelCapacityControlledBooking,
  cancelCapacityControlledClassInstance,
  checkOutControlledMember,
  markCapacityControlledAttendance,
  recordCapacityControlledMemberCheckIn,
  type LifecycleActor,
} from "./gymLifecycle";

async function actorFromContext(context: Context): Promise<LifecycleActor> {
  return currentRoleActor(context);
}

export async function cancelClassBooking(
  root: unknown,
  { bookingId }: { bookingId: string },
  context: Context
) {
  const result = await cancelCapacityControlledBooking(context.prisma, {
    bookingId,
    actor: await actorFromContext(context),
  });
  const booking = await context.db.ClassBooking.findOne({ where: { id: result.bookingId } });
  return {
    booking,
    promoted: result.promotion.promoted,
    message: result.cancelled ? "Booking cancelled" : "Booking was already cancelled",
  };
}

export async function cancelClassInstance(
  _root: unknown,
  args: { classInstanceId: string; reason: string },
  context: Context,
) {
  return cancelCapacityControlledClassInstance(context.prisma, {
    ...args,
    actor: await actorFromContext(context),
  });
}

export async function markClassAttendance(
  root: unknown,
  args: {
    bookingId: string;
    outcome: string;
    minutesLate?: number | null;
    notes?: string | null;
  },
  context: Context
) {
  const result = await markCapacityControlledAttendance(context.prisma, {
    ...args,
    actor: await actorFromContext(context),
  });
  return context.db.AttendanceRecord.findOne({ where: { id: result.id } });
}

export async function recordMemberCheckIn(
  root: unknown,
  args: { memberId: string; locationId?: string | null; method: string },
  context: Context
) {
  const result = await recordCapacityControlledMemberCheckIn(context.prisma, {
    ...args,
    actor: await currentCheckInActor(context),
  });
  return {
    checkIn: await context.db.CheckIn.findOne({ where: { id: result.checkIn.id } }),
    reused: result.reused,
  };
}

export async function checkOutMember(
  root: unknown,
  { checkInId }: { checkInId: string },
  context: Context
) {
  const result = await checkOutControlledMember(context.prisma, {
    checkInId,
    actor: await currentCheckInActor(context),
  });
  return {
    checkIn: await context.db.CheckIn.findOne({ where: { id: result.checkIn.id } }),
    reused: result.reused,
  };
}
