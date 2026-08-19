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
  if (id) {
    const { maxCapacity, ...scheduleData } = data;
    if (maxCapacity !== undefined) {
      const capacity = await keystoneClient<{ updateClassScheduleCapacity: { id: string } }>(`
        mutation UpdateClassScheduleCapacity($id: ID!, $maxCapacity: Int!) {
          updateClassScheduleCapacity(classScheduleId: $id, maxCapacity: $maxCapacity) { id }
        }
      `, { id, maxCapacity });
      if (!capacity.success) throw new Error(capacity.error);
    }
    const response = await keystoneClient<{ updateClassSchedule: { id: string } }>(`
      mutation UpdateClassSchedule($id: ID!, $data: ClassScheduleUpdateInput!) {
        updateClassSchedule(where: { id: $id }, data: $data) { id }
      }
    `, { id, data: scheduleData });
    if (!response.success) throw new Error(response.error);
    return response.data.updateClassSchedule;
  }
  const response = await keystoneClient<{ createClassSchedule: { id: string } }>(`
    mutation CreateClassSchedule($data: ClassScheduleCreateInput!) { createClassSchedule(data: $data) { id } }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.createClassSchedule;
}

export async function saveClassInstance(data: Record<string, unknown>, id?: string | null) {
  if (id) {
    const { maxCapacity, ...instanceData } = data;
    if (maxCapacity !== undefined) {
      const capacity = await keystoneClient<{ updateClassInstanceCapacity: { id: string } }>(`
        mutation UpdateClassInstanceCapacity($id: ID!, $maxCapacity: Int) {
          updateClassInstanceCapacity(classInstanceId: $id, maxCapacity: $maxCapacity) { id }
        }
      `, { id, maxCapacity });
      if (!capacity.success) throw new Error(capacity.error);
    }
    const response = await keystoneClient<{ updateClassInstance: { id: string } }>(`
      mutation UpdateClassInstance($id: ID!, $data: ClassInstanceUpdateInput!) {
        updateClassInstance(where: { id: $id }, data: $data) { id }
      }
    `, { id, data: instanceData });
    if (!response.success) throw new Error(response.error);
    return response.data.updateClassInstance;
  }
  const response = await keystoneClient<{ createClassInstance: { id: string } }>(`
    mutation CreateClassInstance($data: ClassInstanceCreateInput!) { createClassInstance(data: $data) { id } }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.createClassInstance;
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
