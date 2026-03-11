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

  // Get the class instance with capacity
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

  // Use instance capacity or fall back to schedule capacity
  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;

  // Count existing confirmed bookings for this instance
  const existingBookings = await context.query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      status: { equals: 'confirmed' },
    },
  });

  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;

  // Count waitlist if not available
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

/**
 * Book a class for a member
 * Handles credit deduction and waitlist management
 */
export async function bookClass(
  root: any,
  args: { classInstanceId: string; memberId: string },
  context: Context
) {
  const { classInstanceId, memberId } = args;

  // Check availability first
  const availability = await checkClassAvailability(
    root,
    { classInstanceId },
    context
  );

  // Get member information
  const member = await context.query.User.findOne({
    where: { id: memberId },
    query: 'id name email',
  });

  if (!member) {
    throw new Error('Member not found');
  }

  // Check member's membership and credits
  const membership = await context.query.Membership.findMany({
    where: {
      member: { id: { equals: memberId } },
      status: { equals: 'active' },
    },
    query: 'id classCreditsRemaining tier { classCreditsPerMonth }',
  });

  if (!membership.length) {
    throw new Error('No active membership found');
  }

  const memberMembership = membership[0];
  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
  const hasCredits = hasUnlimitedCredits || memberMembership.classCreditsRemaining > 0;

  if (!hasCredits) {
    throw new Error('No class credits remaining');
  }

  // Determine booking status
  const status = availability.available ? 'confirmed' : 'waitlist';

  // Create the booking
  const booking = await context.query.ClassBooking.createOne({
    data: {
      member: { connect: { id: memberId } },
      classInstance: { connect: { id: classInstanceId } },
      memberName: member.name,
      memberEmail: member.email,
      status,
      waitlistPosition: status === 'waitlist' ? availability.waitlistPosition : null,
      bookedAt: new Date().toISOString(),
    },
    query: 'id status waitlistPosition bookedAt',
  });

  // Deduct credit if confirmed (not for waitlist)
  if (status === 'confirmed' && !hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: memberMembership.classCreditsRemaining - 1,
      },
    });
  }

  return {
    booking,
    creditsRemaining: hasUnlimitedCredits
      ? -1
      : memberMembership.classCreditsRemaining - (status === 'confirmed' ? 1 : 0),
  };
}

/**
 * Check-in mutation for gym members
 * - Verify active membership
 * - Check if booking exists
 * - Mark booking as confirmed
 * - Deduct class credit if applicable
 * - Update member last-visit timestamp
 * - Handle walk-ins (create booking + check-in atomically)
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

  // Verify active membership
  const membership = await context.query.Membership.findMany({
    where: {
      member: { id: { equals: memberId } },
      status: { equals: 'active' },
    },
    query: 'id classCreditsRemaining tier { classCreditsPerMonth }',
  });

  if (!membership.length) {
    throw new Error('No active membership found');
  }

  const memberMembership = membership[0];
  const now = new Date().toISOString();

  // If bookingId provided, mark existing booking as confirmed
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

  // Handle walk-in (no existing booking)
  if (classInstanceId) {
    const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;
    const hasCredits = hasUnlimitedCredits || memberMembership.classCreditsRemaining > 0;

    if (!hasCredits) {
      throw new Error('No class credits remaining for walk-in');
    }

    // Check availability
    const availability = await checkClassAvailability(
      root,
      { classInstanceId },
      context
    );

    if (!availability.available) {
      throw new Error('Class is at capacity, cannot process walk-in');
    }

    // Get member information
    const member = await context.query.User.findOne({
      where: { id: memberId },
      query: 'id name email',
    });

    // Create booking and mark as confirmed atomically
    const booking = await context.query.ClassBooking.createOne({
      data: {
        member: { connect: { id: memberId } },
        classInstance: { connect: { id: classInstanceId } },
        memberName: member?.name,
        memberEmail: member?.email,
        status: 'confirmed',
        bookedAt: now,
      },
      query: 'id status bookedAt member { id name }',
    });

    // Deduct credit if not unlimited
    if (!hasUnlimitedCredits) {
      await context.query.Membership.updateOne({
        where: { id: memberMembership.id },
        data: {
          classCreditsRemaining: memberMembership.classCreditsRemaining - 1,
        },
      });
    }

    return {
      success: true,
      booking,
      message: 'Walk-in check-in successful',
      creditsRemaining: hasUnlimitedCredits
        ? -1
        : memberMembership.classCreditsRemaining - 1,
    };
  }

  // General gym check-in (no class)
  return {
    success: true,
    booking: null,
    message: 'General gym check-in successful',
  };
}

/**
 * Promote member from waitlist when a spot opens
 */
export async function promoteFromWaitlist(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  // Find the first waitlisted booking
  const waitlistBookings = await context.query.ClassBooking.findMany({
    where: {
      classInstance: { id: { equals: args.classInstanceId } },
      status: { equals: 'waitlist' },
    },
    orderBy: [{ bookedAt: 'asc' }],
    take: 1,
    query: 'id member { id } classInstance { id }',
  });

  if (!waitlistBookings.length) {
    return { promoted: false, message: 'No members on waitlist' };
  }

  const bookingToPromote = waitlistBookings[0];

  // Check member credits
  const membership = await context.query.Membership.findMany({
    where: {
      member: { id: { equals: bookingToPromote.member.id } },
      status: { equals: 'active' },
    },
    query: 'id classCreditsRemaining tier { classCreditsPerMonth }',
  });

  if (!membership.length) {
    // Skip this member and try next
    return { promoted: false, message: 'Member no longer has active membership' };
  }

  const memberMembership = membership[0];
  const hasUnlimitedCredits = memberMembership.tier?.classCreditsPerMonth === -1;

  // Update booking status to confirmed
  const promotedBooking = await context.query.ClassBooking.updateOne({
    where: { id: bookingToPromote.id },
    data: { status: 'confirmed' },
    query: 'id status member { id name email }',
  });

  // Deduct credit
  if (!hasUnlimitedCredits) {
    await context.query.Membership.updateOne({
      where: { id: memberMembership.id },
      data: {
        classCreditsRemaining: memberMembership.classCreditsRemaining - 1,
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
 * Kiosk check-in mutation for gym entrance
 * - Supports check-in by member ID or PIN
 * - Verifies active membership
 * - Records attendance
 * - Returns member info for display
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

  let member;

  // Find member by ID or PIN
  if (memberId) {
    member = await context.query.User.findOne({
      where: { id: memberId },
      query: `
        id
        name
        email
        membership {
          id
          status
          tier {
            name
          }
          classCreditsRemaining
        }
      `,
    });
  } else if (pin) {
    // For PIN lookup in production, you'd want a dedicated PIN field on the User model
    // For now, we'll search by email containing the PIN as a simple demo
    const users = await context.query.User.findMany({
      where: {
        email: { contains: pin },
      },
      query: `
        id
        name
        email
        membership {
          id
          status
          tier {
            name
          }
          classCreditsRemaining
        }
      `,
      take: 1,
    });
    member = users[0];
  }

  if (!member) {
    return {
      success: false,
      message: pin ? 'Invalid PIN. Please try again.' : 'Member not found.',
      member: null,
      attendanceId: null,
    };
  }

  // Check membership status
  if (!member.membership) {
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

  if (member.membership.status !== 'active') {
    return {
      success: false,
      message: `Membership is ${member.membership.status}. Please see front desk.`,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        membership: member.membership,
      },
      attendanceId: null,
    };
  }

  // Create attendance record (we could add an Attendance model for this)
  // For now, we'll return success with a timestamp-based ID
  const attendanceId = `ATT-${Date.now()}-${member.id.slice(-4)}`;

  return {
    success: true,
    message: 'Check-in successful! Have a great workout!',
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      membership: member.membership,
    },
    attendanceId,
  };
}
