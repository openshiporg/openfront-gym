import { keystoneContext } from "@/features/keystone/context";

const BOOKING_QUERY = `
  id
  status
  waitlistPosition
  bookedAt
  cancelledAt
  classInstance {
    id
    date
    classSchedule {
      name
      startTime
      endTime
    }
    instructor {
      user { name }
    }
  }
`;

/**
 * Upcoming bookings for a user (by User.id).
 * ClassBooking.member → Member → user relation.
 */
export async function getUpcomingBookings(userId: string) {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  return context.query.ClassBooking.findMany({
    where: {
      member: { user: { id: { equals: userId } } },
      status: { in: ["confirmed", "waitlist"] },
      classInstance: { date: { gte: now } },
    },
    orderBy: [{ bookedAt: "asc" }],
    query: BOOKING_QUERY,
  });
}

/** Past / cancelled bookings. */
export async function getBookingHistory(userId: string) {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  return context.query.ClassBooking.findMany({
    where: {
      member: { user: { id: { equals: userId } } },
      OR: [
        { status: { equals: "cancelled" } },
        { classInstance: { date: { lt: now } } },
      ],
    },
    orderBy: [{ bookedAt: "desc" }],
    take: 20,
    query: BOOKING_QUERY,
  });
}

/** All bookings (upcoming + past). */
export async function getUserBookings(userId: string) {
  const context = keystoneContext.sudo();

  return context.query.ClassBooking.findMany({
    where: {
      member: { user: { id: { equals: userId } } },
    },
    orderBy: [{ bookedAt: "desc" }],
    query: BOOKING_QUERY,
  });
}

export async function cancelBooking(bookingId: string): Promise<boolean> {
  try {
    const context = keystoneContext.sudo();
    await context.query.ClassBooking.updateOne({
      where: { id: bookingId },
      data: { status: "cancelled", cancelledAt: new Date().toISOString() },
    });
    return true;
  } catch {
    return false;
  }
}
