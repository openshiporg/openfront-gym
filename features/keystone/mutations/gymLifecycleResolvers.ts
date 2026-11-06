import type { Context } from ".keystone/types";
import { currentCheckInActor } from "../access/currentCheckInActor";
import { currentRoleActor } from "../access/currentRoleActor";
import { refundCancelledDropIns } from "./dropIn";
import {
  cancelCapacityControlledBooking,
  cancelCapacityControlledClassInstance,
  checkOutControlledMember,
  markCapacityControlledAttendance,
  undoCapacityControlledAttendance,
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
  const actor = await actorFromContext(context);
  const result = await cancelCapacityControlledBooking(context.prisma, {
    bookingId,
    actor,
  });
  const late = Boolean((result as { lateCancelled?: boolean }).lateCancelled);
  if (result.cancelled && !late) await refundCancelledDropIns(context, actor.organizationId!, [result.bookingId]);
  const booking = await context.db.ClassBooking.findOne({ where: { id: result.bookingId } });
  return {
    booking,
    promoted: result.promotion.promoted,
    message: !result.cancelled ? "Booking was already cancelled" : late ? "Booking cancelled inside the late-cancel window; the credit isn't returned" : "Booking cancelled",
  };
}

export async function cancelClassInstance(
  _root: unknown,
  args: { classInstanceId: string; reason: string },
  context: Context,
) {
  const actor = await actorFromContext(context);
  const result = await cancelCapacityControlledClassInstance(context.prisma, { ...args, actor });
  const cancelled = await context.prisma.classBooking.findMany({ where: { organizationId: actor.organizationId!, classInstanceId: args.classInstanceId, status: "cancelled" }, select: { id: true } });
  await refundCancelledDropIns(context, actor.organizationId!, cancelled.map((row: { id: string }) => row.id));
  return result;
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

/** Staff correction: close a confirmed booking on a class that started and was never marked. */
export async function cancelPastClassBooking(root: unknown, args: { bookingId: string; reason: string }, context: Context) {
  const result = await cancelCapacityControlledBooking(context.prisma, {
    bookingId: args.bookingId,
    pastBookingReason: args.reason ?? "",
    actor: await actorFromContext(context),
  });
  return { bookingId: result.bookingId, classInstanceId: result.classInstanceId, cancelled: result.cancelled };
}

/** Staff correction: return a booking to Unmarked after a mistaken check-in. */
export async function undoClassAttendance(root: unknown, args: { bookingId: string }, context: Context) {
  return undoCapacityControlledAttendance(context.prisma, { bookingId: args.bookingId, actor: await actorFromContext(context) });
}

/**
 * The visit this authorized front-desk transition just wrote, re-read by its verified id within
 * the actor's tenant. Staff with check-in authority need this result even when ordinary member
 * visibility rules would hide another member's visits.
 */
async function authorizedCheckInResult(context: Context, checkInId: string) {
  const organizationId = (context.session as any)?.data?.organization?.id;
  const rows = await context.sudo().db.CheckIn.findMany({ where: { AND: [{ id: { equals: checkInId } }, { organization: { id: { equals: organizationId } } }] }, take: 1 });
  if (!rows[0]) throw new Error("The check-in was recorded but could not be read back; refresh the front desk");
  return rows[0];
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
  return { checkIn: await authorizedCheckInResult(context, result.checkIn.id), reused: result.reused };
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
  return { checkIn: await authorizedCheckInResult(context, result.checkIn.id), reused: result.reused };
}
