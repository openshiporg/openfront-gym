import { resolveGymTimeZone } from "../../../lib/timezone";

function rosterActor(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  const isInstructor = Boolean(session?.data?.role?.isInstructor);
  const canManageAllRecords = Boolean(session?.data?.role?.canManageAllRecords);
  if (!session?.itemId || !organizationId || !session.data?.role?.canAccessDashboard || (!isInstructor && !canManageAllRecords)) {
    throw new Error("Roster dashboard access required");
  }
  return {
    userId: session.itemId as string,
    organizationId: organizationId as string,
    instructorOnly: isInstructor && !canManageAllRecords,
  };
}

function assignmentFilter(userId: string) {
  return { OR: [
    { instructor: { user: { id: { equals: userId } } } },
    { classSchedule: { instructor: { user: { id: { equals: userId } } } } },
  ] };
}

export const ROSTER_GYM_SETTINGS_PROJECTION = "name address timezone";
export const ROSTER_ORGANIZATION_PROJECTION = "name timezone";
export const ROSTER_LOCATION_PROJECTION = "id name address";
export const ROSTER_SESSION_PROJECTION = `
  id date maxCapacity bookingsCount
  classSchedule { id name maxCapacity startTime endTime instructor { user { name } } }
  instructor { user { name } }
  bookings(where: { status: { equals: "waitlist" } }, take: 1000) { id }
`;
export const ROSTER_DETAIL_PROJECTION = `
  id date maxCapacity isCancelled cancellationReason
  classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name email } } }
  instructor { id user { name email } }
  bookings(orderBy: [{ waitlistPosition: asc }, { bookedAt: asc }], take: 1000) {
    id status bookedAt waitlistPosition memberName memberEmail memberPhone
    member { id name email phone user { id } }
  }
`;
export const ROSTER_ATTENDANCE_PROJECTION =
  "id booking { id } attended lateArrival minutesLate noShowReason markedAt";

export function rosterInstructorAccountProjection(from: string) {
  const boundedFrom = JSON.stringify(from);
  return `
    id specialties certifications
    classSchedules(take: 30) {
      id name dayOfWeek startTime endTime maxCapacity
      instances(
        where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false } }
        orderBy: [{ date: asc }]
        take: 20
      ) { id date maxCapacity instructor { id } bookings { id status waitlistPosition } }
    }
    classInstances(
      where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false } }
      orderBy: [{ date: asc }]
      take: 20
    ) {
      id date maxCapacity instructor { id }
      classSchedule { id name maxCapacity dayOfWeek startTime endTime }
      bookings { id status waitlistPosition }
    }
  `;
}

async function getRosterPresentation(context: any, organizationId: string) {
  const sudo = context.sudo();
  const [settings, organizations, locations] = await Promise.all([
    sudo.query.GymSettings.findMany({
      where: { organization: { id: { equals: organizationId } } },
      take: 1,
      query: ROSTER_GYM_SETTINGS_PROJECTION,
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: organizationId } },
      take: 1,
      query: ROSTER_ORGANIZATION_PROJECTION,
    }),
    sudo.query.Location.findMany({
      where: {
        AND: [
          { organization: { id: { equals: organizationId } } },
          { isActive: { equals: true } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
      take: 1,
      query: ROSTER_LOCATION_PROJECTION,
    }),
  ]);
  const gym = settings[0] as any;
  const organization = organizations[0] as any;
  const location = locations[0] as any;
  const locationName = location?.name || gym?.name || organization?.name || "Main studio";
  const address = location?.address || gym?.address;
  return {
    gymLocation: [locationName, address].filter(Boolean).join(" · "),
    gymTimezone: resolveGymTimeZone(gym?.timezone, organization?.timezone),
  };
}

export async function getInstructorAccount(_root: unknown, _args: unknown, context: any) {
  const actor = rosterActor(context);
  if (!(context.session as any)?.data?.role?.isInstructor) throw new Error("Instructor access required");
  const instructors = await context.sudo().query.Instructor.findMany({
    where: {
      AND: [
        { organization: { id: { equals: actor.organizationId } } },
        { user: { id: { equals: actor.userId } } },
        { isActive: { equals: true } },
      ],
    },
    take: 1,
    query: rosterInstructorAccountProjection(new Date().toISOString()),
  });
  return (instructors[0] as any) ?? null;
}

export async function getRosterSessions(_root: unknown, _args: unknown, context: any) {
  const actor = rosterActor(context);
  const tenant = { organization: { id: { equals: actor.organizationId } } };
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const where = {
    AND: [
      tenant,
      { date: { gte: recentCutoff } },
      { isCancelled: { equals: false } },
      ...(actor.instructorOnly ? [assignmentFilter(actor.userId)] : []),
    ],
  };
  const [sessions, presentation] = await Promise.all([
    context.sudo().query.ClassInstance.findMany({
      where,
      orderBy: [{ date: "asc" }],
      take: 20,
      query: ROSTER_SESSION_PROJECTION,
    }),
    getRosterPresentation(context, actor.organizationId),
  ]);
  return (sessions as any[]).map((session) => ({ ...session, ...presentation }));
}

export async function getRosterDetail(
  _root: unknown,
  { classInstanceId }: { classInstanceId: string },
  context: any,
) {
  const actor = rosterActor(context);
  const where = {
    AND: [
      { id: { equals: classInstanceId } },
      { organization: { id: { equals: actor.organizationId } } },
      ...(actor.instructorOnly ? [assignmentFilter(actor.userId)] : []),
    ],
  };
  const [instances, presentation] = await Promise.all([
    context.sudo().query.ClassInstance.findMany({
      where,
      take: 1,
      query: ROSTER_DETAIL_PROJECTION,
    }),
    getRosterPresentation(context, actor.organizationId),
  ]);
  const instance = instances[0] as any;
  if (!instance) return null;
  const bookings = instance.bookings ?? [];
  const bookingIds = bookings.map((booking: any) => booking.id).filter(Boolean);
  const attendanceByBookingId = new Map<string, any>();
  if (bookingIds.length) {
    const records = await context.sudo().query.AttendanceRecord.findMany({
      where: {
        AND: [
          { booking: { id: { in: bookingIds } } },
          { organization: { id: { equals: actor.organizationId } } },
        ],
      },
      take: Math.min(bookingIds.length, 1000),
      query: ROSTER_ATTENDANCE_PROJECTION,
    });
    for (const record of records as any[]) {
      if (!attendanceByBookingId.has(record.booking?.id)) attendanceByBookingId.set(record.booking.id, record);
    }
  }
  return {
    ...instance,
    ...presentation,
    bookings: bookings.map((booking: any) => ({
      ...booking,
      attendance: attendanceByBookingId.get(booking.id) ?? null,
    })),
  };
}
