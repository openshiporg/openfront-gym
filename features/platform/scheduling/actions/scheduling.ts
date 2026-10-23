"use server";

import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

/** Returned, not thrown: production Server Actions hide thrown messages behind a generic render error. */
export type SchedulingActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  instructor: string;
  capacity: string;
  type: string;
  color: string;
  isCancelled?: boolean;
  rosterHref?: string;
  scheduleId?: string;
};

export async function getSchedulingWorkspaceData(
  start: Date,
  end: Date,
  options?: { userId?: string; isInstructorOnly?: boolean },
) {
  const response = await keystoneClient<{ schedulingWorkspace: any }>(`
    query SchedulingWorkspace($start: DateTime!, $end: DateTime!, $userId: ID) {
      schedulingWorkspace(start: $start, end: $end, userId: $userId)
    }
  `, {
    start: start.toISOString(),
    end: end.toISOString(),
    userId: options?.userId || null,
  });
  if (!response.success) throw new Error(response.error);
  return response.data.schedulingWorkspace as {
    events: CalendarEvent[];
    schedules: any[];
    instructors: any[];
    classTypes: any[];
    locations: any[];
    resources: any[];
    upcomingInstances: any[];
    timeZone: string;
    eventsComplete: boolean;
    truncated: Partial<Record<"schedules" | "instructors" | "classTypes" | "locations" | "resources", boolean>>;
  };
}

export async function cancelClassInstanceAction(classInstanceId: string, reason: string) {
  const response = await keystoneClient<{
    cancelClassInstance: { cancelledBookings: number; refundedCredits: number; reused: boolean };
  }>(`
    mutation CancelClassInstance($classInstanceId: ID!, $reason: String!) {
      cancelClassInstance(classInstanceId: $classInstanceId, reason: $reason) {
        cancelledBookings refundedCredits reused
      }
    }
  `, { classInstanceId, reason });
  if (!response.success) return { ok: false as const, error: staffActionError(response, "The session was not cancelled. Refresh and try again.") };
  return { ok: true as const, data: response.data.cancelClassInstance };
}

export async function saveClassSchedule(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveGymClassSchedule: { id: string } }>(`
    mutation SaveGymClassSchedule($id: ID, $data: JSON!) { saveGymClassSchedule(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "The template was not saved. Check the coach, place and times, then try again.") };
  return { ok: true as const, data: result.data.saveGymClassSchedule };
}

export async function saveClassInstance(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveGymClassInstance: { id: string } }>(`
    mutation SaveGymClassInstance($id: ID, $data: JSON!) { saveGymClassInstance(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "The session was not saved. Check the coach, place, time and capacity, then try again.") };
  return { ok: true as const, data: result.data.saveGymClassInstance };
}

export async function generateUpcomingInstances(weeks: number = 4) {
  const response = await keystoneClient<{
    generateUpcomingClassInstances: { success: boolean; createdCount: number; skippedNonexistent: number };
  }>(`
    mutation GenerateUpcomingClassInstances($weeks: Int!) {
      generateUpcomingClassInstances(weeks: $weeks) { success createdCount skippedNonexistent }
    }
  `, { weeks });
  if (!response.success) return { ok: false as const, error: staffActionError(response, "Upcoming sessions were not created. Refresh and try again.") };
  return { ok: true as const, data: response.data.generateUpcomingClassInstances };
}
