import { keystoneContext } from "@/features/keystone/context";

export type BookingData = {
  id: string;
  classInstance: {
    id: string;
    date: string;
    classSchedule: {
      name: string;
      startTime: string;
      endTime: string;
    };
    instructor: {
      user: {
        name: string;
      };
    } | null;
  };
  status: string;
  waitlistPosition: number | null;
  bookedAt: string;
  cancelledAt: string | null;
};

export async function getUserBookings(userId: string): Promise<BookingData[]> {
  const context = keystoneContext.sudo();

  const bookings = await context.query.ClassBooking.findMany({
    where: {
      member: { id: { equals: userId } },
    },
    orderBy: [{ bookedAt: 'desc' }],
    query: `
      id
      classInstance {
        id
        date
        classSchedule {
          name
          startTime
          endTime
        }
        instructor {
          user {
            name
          }
        }
      }
      status
      waitlistPosition
      bookedAt
      cancelledAt
    `,
  });

  return bookings as BookingData[];
}

export async function getUpcomingBookings(userId: string): Promise<BookingData[]> {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  const bookings = await context.query.ClassBooking.findMany({
    where: {
      member: { id: { equals: userId } },
      status: { in: ['confirmed', 'waitlist'] },
      classInstance: {
        date: { gte: now },
      },
    },
    orderBy: [{ bookedAt: 'asc' }],
    query: `
      id
      classInstance {
        id
        date
        classSchedule {
          name
          startTime
          endTime
        }
        instructor {
          user {
            name
          }
        }
      }
      status
      waitlistPosition
      bookedAt
      cancelledAt
    `,
  });

  return bookings as BookingData[];
}

export async function getBookingHistory(userId: string): Promise<BookingData[]> {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  const bookings = await context.query.ClassBooking.findMany({
    where: {
      member: { id: { equals: userId } },
      OR: [
        { status: { equals: 'cancelled' } },
        {
          classInstance: {
            date: { lt: now },
          },
        },
      ],
    },
    orderBy: [{ bookedAt: 'desc' }],
    take: 20,
    query: `
      id
      classInstance {
        id
        date
        classSchedule {
          name
          startTime
          endTime
        }
        instructor {
          user {
            name
          }
        }
      }
      status
      waitlistPosition
      bookedAt
      cancelledAt
    `,
  });

  return bookings as BookingData[];
}

export async function cancelBooking(bookingId: string): Promise<boolean> {
  const context = keystoneContext.sudo();

  try {
    await context.query.ClassBooking.updateOne({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      },
    });

    return true;
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return false;
  }
}
