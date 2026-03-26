"use server";

import { revalidatePath } from "next/cache";
import { keystoneContext } from "@/features/keystone/context";

export async function getUpcomingRosterSessions() {
  const ctx = keystoneContext.sudo();
  const now = new Date().toISOString();

  const sessions = await ctx.query.ClassInstance.findMany({
    where: {
      date: { gte: now },
      isCancelled: { equals: false },
    },
    orderBy: [{ date: "asc" }],
    take: 20,
    query: `
      id
      date
      bookingsCount
      classSchedule {
        id
        name
        maxCapacity
        startTime
        endTime
      }
      instructor {
        user { name }
      }
    `,
  });

  return sessions as any[];
}

export async function getRosterDetail(classInstanceId: string) {
  const ctx = keystoneContext.sudo();

  const instance = await ctx.query.ClassInstance.findOne({
    where: { id: classInstanceId },
    query: `
      id
      date
      isCancelled
      cancellationReason
      classSchedule {
        id
        name
        dayOfWeek
        startTime
        endTime
        maxCapacity
      }
      instructor {
        id
        user { name email }
      }
      bookings(orderBy: [{ bookedAt: asc }]) {
        id
        status
        bookedAt
        waitlistPosition
        memberName
        memberEmail
        memberPhone
        member {
          id
          name
          email
          phone
        }
      }
    `,
  });

  if (!instance) return null;

  const bookings = (instance as any).bookings ?? [];
  const attendanceByBookingId = new Map<string, any>();

  for (const booking of bookings) {
    const records = await ctx.query.AttendanceRecord.findMany({
      where: { booking: { id: { equals: booking.id } } },
      take: 1,
      query: `
        id
        attended
        lateArrival
        minutesLate
        noShowReason
        markedAt
      `,
    });
    if (records.length) attendanceByBookingId.set(booking.id, records[0]);
  }

  return {
    ...(instance as any),
    bookings: bookings.map((booking: any) => ({
      ...booking,
      attendance: attendanceByBookingId.get(booking.id) ?? null,
    })),
  };
}

export async function markRosterAttendance(formData: FormData): Promise<void> {
  const bookingId = formData.get("bookingId")?.toString();
  const memberId = formData.get("memberId")?.toString();
  const classScheduleId = formData.get("classScheduleId")?.toString();
  const classInstanceId = formData.get("classInstanceId")?.toString();
  const outcome = formData.get("outcome")?.toString() || "attended";

  if (!bookingId || !memberId || !classScheduleId || !classInstanceId) {
    throw new Error("Missing attendance inputs.");
  }

  const ctx = keystoneContext.sudo();
  const existing = await ctx.query.AttendanceRecord.findMany({
    where: { booking: { id: { equals: bookingId } } },
    take: 1,
    query: "id",
  });

  const data: Record<string, any> = {
    booking: { connect: { id: bookingId } },
    classSchedule: { connect: { id: classScheduleId } },
    member: { connect: { id: memberId } },
    markedAt: new Date().toISOString(),
    attended: outcome === "attended" || outcome === "late",
    lateArrival: outcome === "late",
    minutesLate: outcome === "late" ? 5 : null,
    noShowReason: outcome === "no-show" ? "Marked from roster" : null,
  };

  if (existing.length) {
    await ctx.query.AttendanceRecord.updateOne({
      where: { id: existing[0].id },
      data,
      query: "id",
    });
  } else {
    await ctx.query.AttendanceRecord.createOne({
      data,
      query: "id",
    });
  }

  revalidatePath(`/dashboard/platform/rosters/${classInstanceId}`);
  revalidatePath("/dashboard/platform/rosters");
}
