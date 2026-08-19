import { Context } from '.keystone/types';
import {
  createCapacityControlledBooking,
  promoteCapacityControlledWaitlistBooking,
} from './classCapacity';

/**
 * Check class availability and handle booking logic
 * - Count existing bookings for class instance
 * - If at capacity, add to waitlist
 * - Auto-promote from waitlist when spot opens
 * - Check member credit balance (class pack vs unlimited)
 */
export async function checkClassAvailability(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  const { classInstanceId } = args;

  const session = context.session as any;
  if (!session?.itemId || !session.data?.organization?.id) throw new Error('Authentication required');
  const organizationId = session.data.organization.id;
  const [classInstance] = await context.sudo().query.ClassInstance.findMany({
    where: {
      AND: [
        { id: { equals: classInstanceId } },
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: 'id date maxCapacity isCancelled organization { id } classSchedule { maxCapacity }',
  });

  if (!classInstance) {
    throw new Error('Class instance not found');
  }

  if (classInstance.isCancelled || new Date(classInstance.date).getTime() <= Date.now()) {
    return {
      available: false,
      spotsRemaining: 0,
      waitlistPosition: null,
      reason: classInstance.isCancelled ? 'Class has been cancelled' : 'Class has already started',
    };
  }

  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;

  const existingBookings = await context.sudo().query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      organization: { id: { equals: organizationId } },
      status: { equals: 'confirmed' },
    },
  });

  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;

  let waitlistPosition = null;
  if (!available) {
    const waitlistCount = await context.sudo().query.ClassBooking.count({
      where: {
        classInstance: { id: { equals: classInstanceId } },
        organization: { id: { equals: organizationId } },
        status: { equals: 'waitlist' },
      },
    });
    waitlistPosition = waitlistCount + 1;
  }

  return {
    available,
    spotsRemaining: Math.max(0, spotsRemaining),
    waitlistPosition,
    reason: available ? null : 'Class is at capacity',
  };
}

function assertOperatorSession(context: Context) {
  const session = context.session as any;
  if (!session?.itemId) throw new Error('Authentication required');
  if (session.data?.role?.canManageAllRecords) return;
  throw new Error('Operator access required');
}

/**
 * Book a class for a member.
 * memberId is the Member record ID, not the User ID.
 */
export async function bookClass(
  root: any,
  args: { classInstanceId: string; memberId: string },
  context: Context
) {
  if (!(context.session as any)?.itemId) throw new Error('Authentication required');
  const { classInstanceId, memberId } = args;
  const session = context.session as any;
  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error('Organization context required');
  const result = await createCapacityControlledBooking(context.prisma, {
    classInstanceId,
    memberId,
    actorUserId: session.itemId,
    actorOrganizationId: organizationId,
    actorCanManageAllRecords: Boolean(session.data?.role?.canManageAllRecords),
    capacityMode: 'waitlist',
  });
  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: 'id status waitlistPosition bookedAt',
  });

  return { booking, creditsRemaining: result.creditsRemaining };
}

export async function promoteFromWaitlist(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  assertOperatorSession(context);
  const organizationId = (context.session as any)?.data?.organization?.id;
  if (!organizationId) throw new Error('Organization context required');
  const result = await promoteCapacityControlledWaitlistBooking(
    context.prisma,
    args.classInstanceId,
    organizationId
  );
  if (!result.promoted || !result.bookingId) return result;

  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: 'id status member { id name email }',
  });
  return { ...result, booking };
}
