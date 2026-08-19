import { localDateParts, localTimeToUtc, resolveGymTimeZone } from "../../../lib/timezone";

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
      { classSchedule: instructorFilter },
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
      { classSchedule: instructorFilter },
    ] });
  }

  const [instances, schedules, instructors, upcomingInstances, settings, organizations] = await Promise.all([
    sudo.query.ClassInstance.findMany({
      where: eventWhere,
      take: 1000,
      orderBy: [{ date: "asc" }],
      query: `
        id date isCancelled maxCapacity bookingsCount
        classSchedule { id name startTime endTime maxCapacity instructor { user { name } } }
        instructor { user { name } }
      `,
    }),
    sudo.query.ClassSchedule.findMany({
      where: schedulesWhere,
      take: 500,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      query: `
        id name description dayOfWeek startTime endTime maxCapacity isActive
        instructor { id user { id name email } }
      `,
    }),
    sudo.query.Instructor.findMany({
      where: instructorsWhere,
      take: 500,
      query: "id user { id name email }",
    }),
    sudo.query.ClassInstance.findMany({
      where: upcomingWhere,
      orderBy: [{ date: "asc" }],
      take: 30,
      query: `
        id date isCancelled cancellationReason bookingsCount maxCapacity
        classSchedule { id name dayOfWeek startTime endTime maxCapacity }
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
  ]);

  const timeZone = resolveGymTimeZone((settings[0] as any)?.timezone, (organizations[0] as any)?.timezone);
  const events = (instances as any[]).map((instance) => {
    const schedule = instance.classSchedule || {};
    const startDate = new Date(instance.date);
    const endDate = schedule.endTime
      ? (() => {
          const [hours, minutes] = String(schedule.endTime).split(":").map(Number);
          const local = localDateParts(startDate, timeZone);
          let value = localTimeToUtc({ ...local, hour: hours, minute: minutes, second: 0 }, timeZone);
          if (value <= startDate) {
            const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
            value = localTimeToUtc({
              year: nextDay.getUTCFullYear(),
              month: nextDay.getUTCMonth() + 1,
              day: nextDay.getUTCDate(),
              hour: hours,
              minute: minutes,
              second: 0,
            }, timeZone);
          }
          return value;
        })()
      : new Date(startDate.getTime() + 60 * 60 * 1000);
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

  return { events, schedules, instructors, upcomingInstances, timeZone };
}
