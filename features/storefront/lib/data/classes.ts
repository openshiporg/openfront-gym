import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { PUBLIC_PAGE_SIZE, collectPublicPages, publicCatalogPage } from "./pages";

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
  instructor: { id: string; user: { name: string }; name?: string } | null;
  classType?: { id: string; name: string; duration?: number } | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  isActive: boolean;
};

const CLASS_TYPE_FIELDS = gql`
  fragment StorefrontClassType on PublicGymClassType {
    id name description difficulty duration caloriesBurn equipmentNeeded
  }
`;
const INSTRUCTOR_FIELDS = gql`
  fragment StorefrontScheduleInstructor on PublicGymInstructor { id name }
`;
const SCHEDULE_FIELDS = gql`
  fragment StorefrontSchedule on PublicGymSchedule {
    id name description dayOfWeek startTime endTime maxCapacity
    classType { ...StorefrontClassType }
    instructor { ...StorefrontScheduleInstructor }
  }
`;

type PublicSchedule = {
  id: string;
  name: string;
  description?: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  classType?: ClassTypeData | null;
  instructor?: { id: string; name: string } | null;
};

function scheduleShape(schedule: PublicSchedule): ClassScheduleData {
  return {
    ...schedule,
    description: schedule.description ?? null,
    isActive: true,
    instructor: schedule.instructor
      ? { id: schedule.instructor.id, name: schedule.instructor.name, user: { name: schedule.instructor.name } }
      : null,
  };
}

async function schedules(args?: { dayOfWeek?: string; instructorId?: string; limit?: number }) {
  const result = await gymClient.request<{ publicGymSchedules: PublicSchedule[] }>(gql`
    ${CLASS_TYPE_FIELDS}
    ${INSTRUCTOR_FIELDS}
    ${SCHEDULE_FIELDS}
    query StorefrontSchedules($dayOfWeek: String, $instructorId: ID, $limit: Int) {
      publicGymSchedules(dayOfWeek: $dayOfWeek, instructorId: $instructorId, limit: $limit) { ...StorefrontSchedule }
    }
  `, { dayOfWeek: args?.dayOfWeek, instructorId: args?.instructorId, limit: args?.limit ?? 500 });
  return result.publicGymSchedules.map(scheduleShape);
}

export async function getClassTypes(): Promise<ClassTypeData[]> {
  const { items } = await collectPublicPages(async (skip) => (await gymClient.request<{ publicGymClassTypes: ClassTypeData[] }>(gql`
    ${CLASS_TYPE_FIELDS}
    query StorefrontClassTypes($skip: Int, $limit: Int) { publicGymClassTypes(limit: $limit, skip: $skip) { ...StorefrontClassType } }
  `, { skip, limit: PUBLIC_PAGE_SIZE })).publicGymClassTypes);
  return items;
}

/** One page of class formats matching search, level and length, filtered by the server. */
export async function getClassTypePage(filters: { q?: string; difficulty?: string; duration?: string; after?: string }) {
  return publicCatalogPage(async (limit) => (await gymClient.request<{ publicGymClassTypes: ClassTypeData[] }>(gql`
    ${CLASS_TYPE_FIELDS}
    query StorefrontClassTypePage($limit: Int, $after: ID, $q: String, $difficulty: String, $duration: String) {
      publicGymClassTypes(limit: $limit, after: $after, q: $q, difficulty: $difficulty, duration: $duration) { ...StorefrontClassType }
    }
  `, { limit, after: filters.after || null, q: filters.q || null, difficulty: filters.difficulty || null, duration: filters.duration || null })).publicGymClassTypes);
}

export async function getClassSchedules(): Promise<ClassScheduleData[]> {
  return schedules();
}

export async function getClassScheduleById(id: string): Promise<ClassScheduleData | null> {
  const result = await gymClient.request<{ publicGymSchedule: PublicSchedule | null }>(gql`
    ${CLASS_TYPE_FIELDS}
    ${INSTRUCTOR_FIELDS}
    ${SCHEDULE_FIELDS}
    query StorefrontSchedule($id: ID!) { publicGymSchedule(id: $id) { ...StorefrontSchedule } }
  `, { id });
  return result.publicGymSchedule ? scheduleShape(result.publicGymSchedule) : null;
}

export async function getClassSchedulesByDay(dayCode: string): Promise<ClassScheduleData[]> {
  return schedules({ dayOfWeek: dayCode });
}

type PublicInstance = {
  id: string;
  startsAt: string;
  location?: { id: string; name: string; address?: string | null } | null;
  schedule?: PublicSchedule | null;
  instructor?: { id: string; name: string } | null;
  availability: {
    maxCapacity: number;
    confirmedBookings: number;
    waitlistCount: number;
    spotsRemaining: number;
    state: string;
  };
};

export type ClassOccurrenceData = {
  id: string;
  startsAt: string;
  scheduleId: string;
  name: string;
  description: string | null;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  classType: ClassTypeData | null;
  instructor: { id: string; name: string } | null;
  location: { id: string; name: string; address: string | null } | null;
  availability: PublicInstance["availability"];
};

async function instancePage(
  filters: { from: string; to?: string; scheduleId?: string; instructorId?: string; classTypeId?: string; locationId?: string; search?: string },
  skip: number,
) {
  const result = await gymClient.request<{ publicGymClassInstances: PublicInstance[] }>(gql`
    ${CLASS_TYPE_FIELDS}
    ${INSTRUCTOR_FIELDS}
    ${SCHEDULE_FIELDS}
    query StorefrontInstances(
      $from: DateTime
      $to: DateTime
      $scheduleId: ID
      $instructorId: ID
      $classTypeId: ID
      $locationId: ID
      $search: String
      $skip: Int
      $limit: Int
    ) {
      publicGymClassInstances(
        from: $from
        to: $to
        scheduleId: $scheduleId
        instructorId: $instructorId
        classTypeId: $classTypeId
        locationId: $locationId
        search: $search
        skip: $skip
        limit: $limit
      ) {
        id
        startsAt
        schedule { ...StorefrontSchedule }
        instructor { ...StorefrontScheduleInstructor }
        location { id name address }
        availability { maxCapacity confirmedBookings waitlistCount spotsRemaining state }
      }
    }
  `, { ...filters, skip, limit: PUBLIC_PAGE_SIZE });
  return result.publicGymClassInstances;
}

/**
 * Upcoming sessions with class, coach, site and search filters applied by the server before
 * paging. When the bounded read stops before the end of the window, `loadedThrough` is the
 * last session it reached, so a caller can continue from there instead of showing false gaps.
 */
export async function getUpcomingClassOccurrencePage(options?: {
  days?: number;
  from?: string;
  classTypeId?: string;
  instructorId?: string;
  locationId?: string;
  search?: string;
  limit?: number;
}): Promise<{ occurrences: ClassOccurrenceData[]; truncated: boolean; loadedThrough: string | null }> {
  const now = new Date();
  const requested = options?.from ? new Date(options.from) : now;
  const start = Number.isFinite(requested.getTime()) && requested > now ? requested : now;
  const days = Math.min(Math.max(Math.trunc(options?.days ?? 7), 1), 90);
  const to = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const maxItems = Math.min(Math.max(options?.limit ?? 1000, 1), 1000);
  const { items, truncated } = await collectPublicPages(
    (skip) => instancePage({ from: start.toISOString(), to: to.toISOString(), instructorId: options?.instructorId, classTypeId: options?.classTypeId, locationId: options?.locationId, search: options?.search }, skip),
    maxItems,
  );
  const cut = truncated || (items.length >= maxItems && maxItems < 1000);
  return { occurrences: items.filter((instance) => instance.schedule).map(occurrenceShape), truncated: cut, loadedThrough: cut ? items.at(-1)?.startsAt ?? null : null };
}

export async function getUpcomingClassOccurrences(options?: {
  days?: number;
  classTypeId?: string;
  instructorId?: string;
  locationId?: string;
  limit?: number;
}): Promise<ClassOccurrenceData[]> {
  return (await getUpcomingClassOccurrencePage(options)).occurrences;
}

function occurrenceShape(instance: PublicInstance): ClassOccurrenceData {
  const schedule = instance.schedule!;
  const instructor = instance.instructor ?? schedule.instructor ?? null;
  return {
    id: instance.id,
    startsAt: instance.startsAt,
    scheduleId: schedule.id,
    name: schedule.name,
    description: schedule.description ?? null,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    maxCapacity: instance.availability.maxCapacity,
    classType: schedule.classType ?? null,
    instructor: instructor
      ? { id: instructor.id, name: instructor.name }
      : null,
    location: instance.location ? { id: instance.location.id, name: instance.location.name, address: instance.location.address ?? null } : null,
    availability: instance.availability,
  };
}

export async function getBookingCount(instanceId: string): Promise<number> {
  const result = await gymClient.request<{ publicGymClassInstance: PublicInstance | null }>(gql`
    query StorefrontInstance($id: ID!) {
      publicGymClassInstance(id: $id) { id availability { confirmedBookings } }
    }
  `, { id: instanceId });
  return result.publicGymClassInstance?.availability.confirmedBookings ?? 0;
}

export async function getAvailableSpots(instanceId: string | null, capacity: number) {
  if (!instanceId || capacity <= 0) return { available: Math.max(0, capacity), total: Math.max(0, capacity) };
  const result = await gymClient.request<{ publicGymClassInstance: PublicInstance | null }>(gql`
    query StorefrontAvailability($id: ID!) {
      publicGymClassInstance(id: $id) { id availability { maxCapacity spotsRemaining } }
    }
  `, { id: instanceId });
  const availability = result.publicGymClassInstance?.availability;
  return { available: availability?.spotsRemaining ?? 0, total: availability?.maxCapacity ?? capacity };
}

export async function getSchedulesWithAvailability() {
  const [allSchedules, upcoming] = await Promise.all([schedules(), instancePage({ from: new Date().toISOString() }, 0)]);
  return allSchedules.map((schedule) => {
    const next = upcoming.find((instance) => instance.schedule?.id === schedule.id);
    return {
      ...schedule,
      spotsAvailable: next?.availability.spotsRemaining ?? schedule.maxCapacity,
      totalCapacity: next?.availability.maxCapacity ?? schedule.maxCapacity,
      nextInstanceId: next?.id ?? null,
      nextInstanceDate: next?.startsAt ?? null,
    };
  });
}

export async function getClassTypeById(id: string) {
  const result = await gymClient.request<{ publicGymClassType: ClassTypeData | null }>(gql`
    ${CLASS_TYPE_FIELDS}
    query StorefrontClassType($id: ID!) { publicGymClassType(id: $id) { ...StorefrontClassType } }
  `, { id });
  return result.publicGymClassType;
}

export async function getSchedulesByClassType(classTypeId: string): Promise<ClassScheduleData[]> {
  return (await schedules()).filter((schedule) => schedule.classType?.id === classTypeId);
}

export async function getAllSchedules() {
  return (await schedules()).map((schedule) => ({
    ...schedule,
    spotsAvailable: schedule.maxCapacity,
    totalCapacity: schedule.maxCapacity,
  }));
}

export async function getTodaysClasses() {
  const today = new Date();
  const dayCodes = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  const [todaySchedules, todayInstances] = await Promise.all([
    schedules({ dayOfWeek: dayCodes[today.getDay()] }),
    collectPublicPages((skip) => instancePage({ from: start.toISOString(), to: end.toISOString() }, skip)).then((page) => page.items),
  ]);
  return todaySchedules.map((schedule) => {
    const concrete = todayInstances.find((instance) => instance.schedule?.id === schedule.id);
    return {
      ...schedule,
      classType: schedule.classType ?? { name: schedule.name, duration: estimateDurationFromTimes(schedule.startTime, schedule.endTime) },
      instructor: schedule.instructor ? { ...schedule.instructor, name: schedule.instructor.user.name } : null,
      currentCapacity: concrete ? concrete.availability.confirmedBookings + concrete.availability.waitlistCount : 0,
    };
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function estimateDurationFromTimes(startTime?: string, endTime?: string): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 60;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 60;
}

/** Resolve an explicit booking link independently of the bounded timetable window. */
export async function getClassOccurrenceById(id: string): Promise<ClassOccurrenceData | null> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return null;
  const result = await gymClient.request<{ publicGymClassInstance: PublicInstance | null }>(gql`
    ${CLASS_TYPE_FIELDS}
    ${INSTRUCTOR_FIELDS}
    ${SCHEDULE_FIELDS}
    query StorefrontSelectedOccurrence($id: ID!) {
      publicGymClassInstance(id: $id) {
        id startsAt schedule { ...StorefrontSchedule } instructor { ...StorefrontScheduleInstructor } location { id name address }
        availability { maxCapacity confirmedBookings waitlistCount spotsRemaining state }
      }
    }
  `, { id });
  return result.publicGymClassInstance?.schedule ? occurrenceShape(result.publicGymClassInstance) : null;
}
