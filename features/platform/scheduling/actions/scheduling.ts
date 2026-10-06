"use server";

import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

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
  if (!response.success) throw new Error(response.error);
  return response.data.cancelClassInstance;
}

export async function saveClassSchedule(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveGymClassSchedule: { id: string } }>(`
    mutation SaveGymClassSchedule($id: ID, $data: JSON!) { saveGymClassSchedule(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) throw new Error(result.error);
  return result.data.saveGymClassSchedule;
}

export async function saveClassInstance(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveGymClassInstance: { id: string } }>(`
    mutation SaveGymClassInstance($id: ID, $data: JSON!) { saveGymClassInstance(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) throw new Error(result.error);
  return result.data.saveGymClassInstance;
}

export async function generateUpcomingInstances(weeks: number = 4) {
  const response = await keystoneClient<{
    generateUpcomingClassInstances: { success: boolean; createdCount: number };
  }>(`
    mutation GenerateUpcomingClassInstances($weeks: Int!) {
      generateUpcomingClassInstances(weeks: $weeks) { success createdCount }
    }
  `, { weeks });
  if (!response.success) throw new Error(response.error);
  return response.data.generateUpcomingClassInstances;
}
