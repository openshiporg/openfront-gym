import { resolveGymTimeZone } from "../../../lib/timezone";
import { scheduleDurationMinutes } from "../lib/scheduling-time";

function schedulingActor(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  const isInstructor = Boolean(session?.data?.role?.isInstructor);
  const canManageAllRecords = Boolean(session?.data?.role?.canManageAllRecords);
  if (!session?.itemId || !organizationId || !session.data?.role?.canAccessDashboard || (!isInstructor && !canManageAllRecords)) {
    throw new Error("Scheduling dashboard access required");
  }
  return {
    userId: session.itemId as string,
    organizationId: organizationId as string,
    isInstructor,
    canManageAllRecords,
  };
}

function boundedDate(value: unknown, label: string) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date`);
  return date;
}

const EVENT_BATCH = 1000;
const EVENT_MAX = 20_000;
const OPTION_LIMIT = 500;

export async function getSchedulingWorkspace(
  _root: unknown,
  { start, end, userId }: { start: string; end: string; userId?: string | null },
  context: any,
) {
  const actor = schedulingActor(context);
  const startsAt = boundedDate(start, "start");
  const endsAt = boundedDate(end, "end");
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 370 * 24 * 60 * 60 * 1000) {
    throw new Error("Scheduling range must be positive and no longer than 370 days");
  }

  const restrictedInstructor = actor.isInstructor && !actor.canManageAllRecords;
  const effectiveUserId = restrictedInstructor ? actor.userId : userId || undefined;
  const isInstructorOnly = Boolean((restrictedInstructor || userId) && effectiveUserId);
  const sudo = context.sudo();
  const tenant = { organization: { id: { equals: actor.organizationId } } };
  const instructorFilter = { instructor: { user: { id: { equals: effectiveUserId } } } };

  const eventWhere: any = {
    AND: [tenant, { date: { gte: startsAt.toISOString(), lte: endsAt.toISOString() } }],
  };
  if (effectiveUserId) {
    eventWhere.AND.push({ OR: [
      { instructor: { user: { id: { equals: effectiveUserId } } } },
      { AND: [{ instructor: null }, { classSchedule: instructorFilter }] },
    ] });
  }

  const schedulesWhere = isInstructorOnly
    ? { AND: [tenant, instructorFilter] }
    : tenant;
  const instructorsWhere = isInstructorOnly
    ? { AND: [tenant, { isActive: { equals: true } }, { user: { id: { equals: effectiveUserId } } }] }
    : { AND: [tenant, { isActive: { equals: true } }] };
  const upcomingWhere: any = {
    AND: [tenant, { date: { gte: new Date().toISOString() } }],
  };
  if (isInstructorOnly) {
    upcomingWhere.AND.push({ OR: [
      { instructor: { user: { id: { equals: effectiveUserId } } } },
      { AND: [{ instructor: null }, { classSchedule: instructorFilter }] },
    ] });
  }

  // Every session in the requested window is read (in batches), so an empty day is a real one;
  // past the safety bound the result says the window is incomplete.
  const readEvents = async () => {
    const rows: any[] = [];
    for (let offset = 0; offset < EVENT_MAX; offset += EVENT_BATCH) {
      const batch = await sudo.query.ClassInstance.findMany({
        where: eventWhere, skip: offset, take: EVENT_BATCH, orderBy: [{ date: "asc" }, { id: "asc" }],
        query: `
          id date endsAt isCancelled maxCapacity bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) location { id name } resource { id name }
          classSchedule { id name startTime endTime maxCapacity instructor { user { name } } }
          instructor { user { name } }
        `,
      });
      rows.push(...batch);
      if (batch.length < EVENT_BATCH) return { rows, complete: true };
    }
    return { rows, complete: false };
  };
  const [eventRead, schedules, instructors, classTypes, upcomingInstances, settings, organizations, locations, resources] = await Promise.all([
    readEvents(),
    sudo.query.ClassSchedule.findMany({
      where: schedulesWhere,
      take: OPTION_LIMIT + 1,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      query: `
        id name description dayOfWeek startTime endTime maxCapacity isActive location { id name } resource { id name }
        instructor { id user { id name email } }
        classType { id name }
        instancesCount
      `,
    }),
    sudo.query.Instructor.findMany({
      where: instructorsWhere,
      take: OPTION_LIMIT + 1,
      query: "id user { id name email }",
    }),
    sudo.query.ClassType.findMany({
      where: tenant,
      take: OPTION_LIMIT + 1,
      orderBy: [{ name: "asc" }],
      query: "id name",
    }),
    sudo.query.ClassInstance.findMany({
      where: upcomingWhere,
      orderBy: [{ date: "asc" }],
      take: 30,
      query: `
        id date endsAt isCancelled cancellationReason bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) maxCapacity location { id name } resource { id name }
        classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name } } }
        instructor { id user { name } }
      `,
    }),
    sudo.query.GymSettings.findMany({
      where: tenant,
      take: 1,
      query: "timezone",
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: actor.organizationId } },
      take: 1,
      query: "timezone",
    }),
    sudo.query.Location.findMany({ where: { AND: [tenant, { isActive: { equals: true } }] }, take: OPTION_LIMIT + 1, orderBy: [{ name: "asc" }], query: "id name" }),
    sudo.query.GymResource.findMany({ where: { AND: [tenant, { isActive: { equals: true } }] }, take: OPTION_LIMIT + 1, orderBy: [{ name: "asc" }], query: "id name capacity location { id }" }),
  ]);
  const instances = eventRead.rows;
  const trim = (rows: any[]) => rows.slice(0, OPTION_LIMIT);

  const timeZone = resolveGymTimeZone((settings[0] as any)?.timezone, (organizations[0] as any)?.timezone);
  const events = (instances as any[]).map((instance) => {
    const schedule = instance.classSchedule || {};
    const startDate = new Date(instance.date);
    const endDate = instance.endsAt ? new Date(instance.endsAt) : new Date(startDate.getTime() + scheduleDurationMinutes(schedule.startTime, schedule.endTime) * 60 * 1000);
    return {
      id: instance.id,
      title: schedule.name || "Untitled Class",
      start: instance.date,
      end: endDate.toISOString(),
      instructor: instance.instructor?.user?.name || schedule.instructor?.user?.name || "TBA",
      capacity: `${instance.bookingsCount || 0}/${instance.maxCapacity || schedule.maxCapacity || 0}`,
      type: schedule.name?.toLowerCase().includes("yoga") ? "yoga" : "class",
      color: instance.isCancelled ? "zinc" : "violet",
      isCancelled: instance.isCancelled,
      rosterHref: `/dashboard/platform/rosters/${instance.id}`,
      scheduleId: schedule.id,
    };
  });

  return {
    events, eventsComplete: eventRead.complete,
    schedules: trim(schedules), instructors: trim(instructors), classTypes: trim(classTypes), upcomingInstances, timeZone,
    locations: trim(locations), resources: trim(resources),
    // Which option lists stop short; the full lists are in the catalogs.
    truncated: {
      schedules: schedules.length > OPTION_LIMIT, instructors: instructors.length > OPTION_LIMIT, classTypes: classTypes.length > OPTION_LIMIT,
      locations: locations.length > OPTION_LIMIT, resources: resources.length > OPTION_LIMIT,
    },
  };
}
