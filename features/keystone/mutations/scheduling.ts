import { futureLocalOccurrence, localWeekdayAtOffset, resolveGymTimeZone } from "../../../lib/timezone";
import {
  updateCapacityControlledClassInstance,
  updateCapacityControlledClassSchedule,
} from "./classCapacity";

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function schedulingManager(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManageAllRecords) {
    throw new Error("Scheduling management permission required");
  }
  return { userId: session.itemId as string, organizationId: organizationId as string };
}

export async function updateClassScheduleCapacity(
  _root: unknown,
  { classScheduleId, maxCapacity }: { classScheduleId: string; maxCapacity: number },
  context: any,
) {
  const { organizationId } = schedulingManager(context);
  return updateCapacityControlledClassSchedule(context.prisma, {
    classScheduleId,
    maxCapacity,
    organizationId,
  });
}

export async function updateClassInstanceCapacity(
  _root: unknown,
  { classInstanceId, maxCapacity }: { classInstanceId: string; maxCapacity: number | null },
  context: any,
) {
  const { organizationId } = schedulingManager(context);
  return updateCapacityControlledClassInstance(context.prisma, {
    classInstanceId,
    maxCapacity,
    organizationId,
  });
}

export async function generateUpcomingClassInstances(
  _root: unknown,
  { weeks }: { weeks: number },
  context: any,
) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
    throw new Error("weeks must be an integer from 1 to 12");
  }
  const { organizationId } = schedulingManager(context);
  const sudo = context.sudo();
  const [settings, organization] = await Promise.all([
    context.prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { timezone: true },
    }),
    context.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    }),
  ]);
  const timeZone = resolveGymTimeZone(settings?.timezone, organization?.timezone);
  const schedules = await sudo.query.ClassSchedule.findMany({
    where: {
      AND: [
        { organization: { id: { equals: organizationId } } },
        { isActive: { equals: true } },
      ],
    },
    take: 500,
    query: "id dayOfWeek startTime maxCapacity organization { id } instructor { id organization { id } }",
  });
  const now = new Date();
  let createdCount = 0;

  for (const schedule of schedules as any[]) {
    if (schedule.organization?.id !== organizationId) throw new Error("Schedule tenant mismatch");
    const targetDay = DAY_MAP[schedule.dayOfWeek];
    if (targetDay === undefined) continue;
    const [hours, minutes] = String(schedule.startTime).split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) throw new Error("Schedule time is invalid");

    for (let offset = 0; offset <= weeks * 7; offset += 1) {
      if (localWeekdayAtOffset(now, timeZone, offset) !== targetDay) continue;
      const date = futureLocalOccurrence(now, timeZone, offset, hours, minutes);
      if (date <= now) continue;

      const iso = date.toISOString();
      try {
        await sudo.query.ClassInstance.createOne({
          data: {
            organization: { connect: { id: organizationId } },
            classSchedule: { connect: { id: schedule.id } },
            ...(schedule.instructor?.id ? { instructor: { connect: { id: schedule.instructor.id } } } : {}),
            date: iso,
            maxCapacity: schedule.maxCapacity,
            isCancelled: false,
          },
          query: "id",
        });
        createdCount += 1;
      } catch (error: any) {
        if (error?.code === "P2002" || /unique|already exists/i.test(error?.message || "")) continue;
        throw error;
      }
    }
  }

  return { success: true, createdCount };
}
