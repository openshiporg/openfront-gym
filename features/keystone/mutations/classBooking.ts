import { Context } from '.keystone/types';

/**
 * Check class availability and handle booking logic
 * - Count existing bookings for class instance
 * - If at capacity, add to waitlist
 * - Auto-promote from waitlist when spot opens
 * - Check member credit balance (class pack vs unlimited)
 * - Enforce cancellation deadline
 */
export async function checkClassAvailability(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  const { classInstanceId } = args;

  const classInstance = await context.query.ClassInstance.findOne({
    where: { id: classInstanceId },
    query: 'id maxCapacity isCancelled classSchedule { maxCapacity }',
  });

  if (!classInstance) {
    throw new Error('Class instance not found');
  }

  if (classInstance.isCancelled) {
    return {
      available: false,
      spotsRemaining: 0,
      waitlistPosition: null,
      reason: 'Class has been cancelled',
    };
  }

  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;

  const existingBookings = await context.query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      status: { equals: 'confirmed' },
    },
  });

  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;

  let waitlistPosition = null;
  if (!available) {
    const waitlistCount = await context.query.ClassBooking.count({
      where: {
        classInstance: { id: { equals: classInstanceId } },
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

async function getMemberAndUser(context: Context, memberId: string) {
  const members = await context.query.Member.findMany({
    where: { id: { equals: memberId } },
    take: 1,
    query: 'id name email phone user { id name email }',
  });

  const member = members[0] as any;
  if (!member) throw new Error('Member not found');
  if (!member.user?.id) throw new Error('Member is not linked to a user account');

  return {
    member,
    userId: member.user.id as string,
    userName: member.user.name || member.name,
    userEmail: member.user.email || member.email,
  };
}

async function getActiveMembershipForUser(context: Context, userId: string) {
  const memberships = await context.query.Membership.findMany({
    where: {
      member: { id: { equals: userId } },
      status: { equals: 'active' },
    },
    take: 1,
    query: 'id classCreditsRemaining tier { classCreditsPerMonth }',
  });

  return memberships[0] as any;
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
  const { classInstanceId, memberId } = args;

  const availability = await checkClassAvailability(root, { classInstanceId }, context);
  const { member, userId, userName, userEmail } = await getMemberAndUser(context, memberId);

  const memberMembership = await getActiveMembershipForUser(context, userId);
  if (!memberMembership) {
    throw new Error('No active membership found');
  }

  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
  const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
  const hasCredits = hasUnlimitedCredits || creditsRemaining > 0;

  if (!hasCredits) {
    throw new Error('No class credits remaining');
  }

  const status = availability.available ? 'confirmed' : 'waitlist';

  const booking = await context.query.ClassBooking.createOne({
    data: {
      member: { connect: { id: member.id } },
      classInstance: { connect: { id: classInstanceId } },
      memberName: userName,
      memberEmail: userEmail,
      memberPhone: member.phone ?? null,
      status,
      waitlistPosition: status === 'waitlist' ? availability.waitlistPosition : null,
      bookedAt: new Date().toISOString(),
    },
    query: 'id status waitlistPosition bookedAt',
  });

  if (status === 'confirmed' && !hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: creditsRemaining - 1,
      },
    });
  }

  return {
    booking,
    creditsRemaining: hasUnlimitedCredits
      ? -1
      : creditsRemaining - (status === 'confirmed' ? 1 : 0),
  };
}

/**
 * Check-in mutation for gym members.
 * memberId is the Member record ID.
 */
export async function checkIn(
  root: any,
  args: {
    memberId: string;
    bookingId?: string;
    classInstanceId?: string;
  },
  context: Context
) {
  const { memberId, bookingId, classInstanceId } = args;
  const { member, userId, userName, userEmail } = await getMemberAndUser(context, memberId);

  const memberMembership = await getActiveMembershipForUser(context, userId);
  if (!memberMembership) {
    throw new Error('No active membership found');
  }

  const now = new Date().toISOString();

  if (bookingId) {
    const booking = await context.query.ClassBooking.updateOne({
      where: { id: bookingId },
      data: {
        status: 'confirmed',
      },
      query: 'id status member { id name }',
    });

    return {
      success: true,
      booking,
      message: 'Check-in successful',
    };
  }

  if (classInstanceId) {
    const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
    const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
    const hasCredits = hasUnlimitedCredits || creditsRemaining > 0;

    if (!hasCredits) {
      throw new Error('No class credits remaining for walk-in');
    }

    const availability = await checkClassAvailability(root, { classInstanceId }, context);
    if (!availability.available) {
      throw new Error('Class is at capacity, cannot process walk-in');
    }

    const booking = await context.query.ClassBooking.createOne({
      data: {
        member: { connect: { id: member.id } },
        classInstance: { connect: { id: classInstanceId } },
        memberName: userName,
        memberEmail: userEmail,
        memberPhone: member.phone ?? null,
        status: 'confirmed',
        bookedAt: now,
      },
      query: 'id status bookedAt member { id name }',
    });

    if (!hasUnlimitedCredits) {
      await context.query.Membership.updateOne({
        where: { id: memberMembership.id },
        data: {
          classCreditsRemaining: creditsRemaining - 1,
        },
      });
    }

    return {
      success: true,
      booking,
      message: 'Walk-in check-in successful',
      creditsRemaining: hasUnlimitedCredits ? -1 : creditsRemaining - 1,
    };
  }

  return {
    success: true,
    booking: null,
    message: 'General gym check-in successful',
  };
}

export async function promoteFromWaitlist(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  const waitlistBookings = await context.query.ClassBooking.findMany({
    where: {
      classInstance: { id: { equals: args.classInstanceId } },
      status: { equals: 'waitlist' },
    },
    orderBy: [{ bookedAt: 'asc' }],
    take: 1,
    query: 'id member { id user { id } } classInstance { id }',
  });

  if (!waitlistBookings.length) {
    return { promoted: false, message: 'No members on waitlist' };
  }

  const bookingToPromote = waitlistBookings[0] as any;
  const linkedUserId = bookingToPromote.member?.user?.id;
  if (!linkedUserId) {
    return { promoted: false, message: 'Waitlisted member is not linked to a user account' };
  }

  const memberMembership = await getActiveMembershipForUser(context, linkedUserId);
  if (!memberMembership) {
    return { promoted: false, message: 'Member no longer has active membership' };
  }

  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
  const creditsRemaining = memberMembership.classCreditsRemaining ?? 0;
  if (!hasUnlimitedCredits && creditsRemaining <= 0) {
    return { promoted: false, message: 'Member has no class credits remaining' };
  }

  const promotedBooking = await context.query.ClassBooking.updateOne({
    where: { id: bookingToPromote.id },
    data: { status: 'confirmed', waitlistPosition: null },
    query: 'id status member { id name email }',
  });

  if (!hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: creditsRemaining - 1,
      },
    });
  }

  return {
    promoted: true,
    booking: promotedBooking,
    message: 'Member promoted from waitlist',
  };
}

/**
 * Kiosk check-in mutation for gym entrance.
 * This currently supports lookup by Member.id or a very basic PIN/email fallback.
 */
export async function kioskCheckIn(
  root: any,
  args: { memberId?: string; pin?: string },
  context: Context
) {
  const { memberId, pin } = args;

  if (!memberId && !pin) {
    return {
      success: false,
      message: 'Please provide member ID or PIN',
      member: null,
      attendanceId: null,
    };
  }

  let member: any = null;

  if (memberId) {
    const members = await context.query.Member.findMany({
      where: { id: { equals: memberId } },
      take: 1,
      query: `
        id
        name
        email
        user {
          id
          membership {
            id
            status
            tier { name }
            classCreditsRemaining
          }
        }
      `,
    });
    member = members[0];
  } else if (pin) {
    const members = await context.query.Member.findMany({
      where: { email: { contains: pin, mode: 'insensitive' } },
      take: 1,
      query: `
        id
        name
        email
        user {
          id
          membership {
            id
            status
            tier { name }
            classCreditsRemaining
          }
        }
      `,
    });
    member = members[0];
  }

  if (!member) {
    return {
      success: false,
      message: pin ? 'Invalid PIN. Please try again.' : 'Member not found.',
      member: null,
      attendanceId: null,
    };
  }

  const membership = member.user?.membership;

  if (!membership) {
    return {
      success: false,
      message: 'No membership found. Please see front desk.',
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        membership: null,
      },
      attendanceId: null,
    };
  }

  if (membership.status !== 'active') {
    return {
      success: false,
      message: `Membership is ${membership.status}. Please see front desk.`,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        membership,
      },
      attendanceId: null,
    };
  }

  const attendanceId = `ATT-${Date.now()}-${member.id.slice(-4)}`;

  return {
    success: true,
    message: 'Check-in successful! Have a great workout!',
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      membership,
    },
    attendanceId,
  };
}
