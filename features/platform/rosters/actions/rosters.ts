"use server";

import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import {
  MARK_CLASS_ATTENDANCE_DOCUMENT,
  PROMOTE_FROM_WAITLIST_DOCUMENT,
  ROSTER_DETAIL_DOCUMENT,
  ROSTER_SESSIONS_DOCUMENT,
} from "../graphql";

function revalidateRosterViews(classInstanceId: string) {
  revalidatePath(`/dashboard/platform/rosters/${classInstanceId}`);
  revalidatePath("/dashboard/platform/rosters");
  revalidatePath("/account/instructor");
}

export async function getUpcomingRosterSessions() {
  const response = await keystoneClient<{ rosterSessions: any[] }>(
    ROSTER_SESSIONS_DOCUMENT,
  );
  if (!response.success) throw new Error(response.error);
  return response.data.rosterSessions;
}

export async function getRosterDetail(classInstanceId: string) {
  const response = await keystoneClient<{ rosterDetail: any | null }>(
    ROSTER_DETAIL_DOCUMENT,
    { classInstanceId },
  );
  if (!response.success) throw new Error(response.error);
  return response.data.rosterDetail;
}

export async function markRosterAttendance(formData: FormData): Promise<void> {
  const bookingId = formData.get("bookingId")?.toString();
  const memberId = formData.get("memberId")?.toString();
  const classScheduleId = formData.get("classScheduleId")?.toString();
  const classInstanceId = formData.get("classInstanceId")?.toString();
  const outcome = formData.get("outcome")?.toString() || "attended";
  const minutesLateRaw = formData.get("minutesLate")?.toString();
  const notes = formData.get("notes")?.toString().trim();
  if (!bookingId || !memberId || !classScheduleId || !classInstanceId) throw new Error("Missing attendance inputs.");

  const parsedMinutesLate = Number.parseInt(minutesLateRaw || "", 10);
  const response = await keystoneClient(MARK_CLASS_ATTENDANCE_DOCUMENT, {
    bookingId,
    outcome,
    minutesLate: Number.isFinite(parsedMinutesLate) ? parsedMinutesLate : null,
    notes: notes || null,
  });
  if (!response.success) throw new Error(response.error);
  revalidateRosterViews(classInstanceId);
}

export async function promoteWaitlistBooking(formData: FormData): Promise<void> {
  const classInstanceId = formData.get("classInstanceId")?.toString();
  if (!classInstanceId) throw new Error("Missing waitlist promotion input.");

  const response = await keystoneClient(PROMOTE_FROM_WAITLIST_DOCUMENT, {
    classInstanceId,
  });
  if (!response.success) throw new Error(response.error);
  if (!response.data?.promoteFromWaitlist?.promoted) {
    throw new Error(response.data?.promoteFromWaitlist?.message || "Waitlist promotion failed.");
  }
  revalidateRosterViews(classInstanceId);
}
