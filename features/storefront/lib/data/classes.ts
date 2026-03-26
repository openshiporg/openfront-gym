import { keystoneContext } from "@/features/keystone/context";

export type ClassTypeData = {
  id: string;
  name: string;
  description: any;
  difficulty: string;
  duration: number;
  caloriesBurn: number | null;
  equipmentNeeded: string[] | null;
};

export type ClassScheduleData = {
  id: string;
  name: string;
  description: string | null;
  instructor: {
    id: string;
    user: {
      name: string;
    };
  } | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  isActive: boolean;
};

export async function getClassTypes(): Promise<ClassTypeData[]> {
  const context = keystoneContext.sudo();

  const classTypes = await context.query.ClassType.findMany({
    query: `
      id
      name
      description { document }
      difficulty
      duration
      caloriesBurn
      equipmentNeeded
    `,
  });

  return classTypes as ClassTypeData[];
}

export async function getClassSchedules(): Promise<ClassScheduleData[]> {
  const context = keystoneContext.sudo();

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      dayOfWeek
      startTime
      endTime
      maxCapacity
      isActive
    `,
  });

  return schedules as ClassScheduleData[];
}

export async function getClassScheduleById(id: string): Promise<ClassScheduleData | null> {
  const context = keystoneContext.sudo();

  const schedule = await context.query.ClassSchedule.findOne({
    where: { id },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      dayOfWeek
      startTime
      endTime
      maxCapacity
      isActive
    `,
  });

  return schedule as ClassScheduleData | null;
}

export async function getClassSchedulesByDay(dayCode: string): Promise<ClassScheduleData[]> {
  const context = keystoneContext.sudo();

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      dayOfWeek: { equals: dayCode },
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      dayOfWeek
      startTime
      endTime
      maxCapacity
      isActive
    `,
  });

  return schedules as ClassScheduleData[];
}

// Get booking count for a class instance
export async function getBookingCount(instanceId: string): Promise<number> {
  const context = keystoneContext.sudo();

  const count = await context.query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: instanceId } },
      status: { in: ["confirmed", "waitlisted"] },
    },
  });

  return count;
}

// Get available spots for a schedule
export async function getAvailableSpots(scheduleId: string): Promise<{ available: number; total: number }> {
  const context = keystoneContext.sudo();

  const schedule = await context.query.ClassSchedule.findOne({
    where: { id: scheduleId },
    query: `maxCapacity`,
  });

  if (!schedule) {
    return { available: 0, total: 0 };
  }

  const bookedCount = await getBookingCount(scheduleId);
  const capacity = schedule.maxCapacity as number;

  return {
    available: Math.max(0, capacity - bookedCount),
    total: capacity,
  };
}

// Get class schedules with availability info, including next upcoming instance ID
export async function getSchedulesWithAvailability() {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      dayOfWeek
      startTime
      endTime
      maxCapacity
      isActive
      instances(
        where: { date: { gte: "${now}" }, isCancelled: { equals: false } }
        orderBy: [{ date: asc }]
        take: 1
      ) {
        id
        date
      }
    `,
  });

  // Calculate availability for each schedule using next instance booking count
  const schedulesWithAvailability = await Promise.all(
    schedules.map(async (schedule: any) => {
      const nextInstance = schedule.instances?.[0] ?? null;
      const { available, total } = await getAvailableSpots(schedule.id);
      return {
        ...schedule,
        spotsAvailable: available,
        totalCapacity: total,
        nextInstanceId: nextInstance?.id ?? null,
        nextInstanceDate: nextInstance?.date ?? null,
      };
    })
  );

  return schedulesWithAvailability;
}


// Get class type by ID with full details
export async function getClassTypeById(id: string) {
  const context = keystoneContext.sudo();

  const classType = await context.query.ClassType.findOne({
    where: { id },
    query: `
      id
      name
      description { document }
      difficulty
      duration
      equipmentNeeded
      caloriesBurn
    `,
  });

  return classType;
}

// Get schedules for a specific class type
// Note: ClassSchedule doesn't have a classType relationship in the current schema
// This function returns empty array as schedules have their own names, not a classType reference
export async function getSchedulesByClassType(classTypeId: string) {
  // ClassSchedule model doesn't reference ClassType in current schema
  // Return empty array - schema may need refinement to link these models
  return [];
}

// Get all schedules (for listing)
export async function getAllSchedules() {
  const context = keystoneContext.sudo();

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      dayOfWeek
      startTime
      endTime
      maxCapacity
      isActive
    `,
  });

  // Calculate availability for each schedule
  const schedulesWithAvailability = await Promise.all(
    schedules.map(async (schedule: any) => {
      const { available, total } = await getAvailableSpots(schedule.id);
      return {
        ...schedule,
        spotsAvailable: available,
        totalCapacity: total,
      };
    })
  );

  return schedulesWithAvailability;
}

// Get today's classes
export async function getTodaysClasses() {
  const context = keystoneContext.sudo();

  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const today = new Date();
  const dayOfWeek = today.getDay();

  // Map to day codes used in ClassSchedule
  const dayMap: { [key: number]: string } = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday'
  };

  const todayCode = dayMap[dayOfWeek];

  const schedules = await context.query.ClassSchedule.findMany({
    where: {
      dayOfWeek: { equals: todayCode },
      isActive: { equals: true },
    },
    query: `
      id
      name
      description
      instructor {
        id
        user {
          name
        }
      }
      startTime
      endTime
      maxCapacity
    `,
  });

  // Day boundaries for counting today's bookings
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Calculate current capacity by counting confirmed bookings on today's class instances
  const classesWithDetails = await Promise.all(
    schedules.map(async (schedule: any) => {
      const bookedCount = await context.query.ClassBooking.count({
        where: {
          status: { in: ['confirmed', 'waitlist'] },
          classInstance: {
            classSchedule: { id: { equals: schedule.id } },
            date: {
              gte: startOfDay.toISOString(),
              lte: endOfDay.toISOString(),
            },
          },
        },
      });

      return {
        ...schedule,
        classType: {
          // UI compatibility fallback (TodaysSchedule expects classType)
          name: schedule.name,
          duration: estimateDurationFromTimes(schedule.startTime, schedule.endTime),
        },
        instructor: {
          ...schedule.instructor,
          name: schedule.instructor?.user?.name || 'TBA',
        },
        currentCapacity: bookedCount,
      };
    })
  );

  // Sort by start time
  return classesWithDetails.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
}

function estimateDurationFromTimes(startTime?: string, endTime?: string): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 60;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const diff = end - start;
  return diff > 0 ? diff : 60;
}
