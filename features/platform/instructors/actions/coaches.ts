"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { gymGraphql } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

export async function loadEligibleCoachAccounts(q = "", skip = 0) {
  const result = await gymGraphql<{ eligibleCoachAccounts: any }>(`query EligibleCoachAccounts($q: String, $skip: Int) { eligibleCoachAccounts(q: $q, skip: $skip) }`, { q: q.slice(0, 100), skip });
  return result.success ? { ok: true as const, data: result.data.eligibleCoachAccounts } : { ok: false as const, error: staffActionError(result, "Eligible accounts couldn't be loaded. Try again.") };
}

/** Creates a coach profile for an eligible account, then opens it for the rest of its details. */
export async function createCoachProfileAction(form: FormData): Promise<void> {
  const userId = String(form.get("userId") || "");
  const result = await gymGraphql<{ createCoachProfile: { id: string } }>(`mutation CreateCoachProfile($userId: ID!) { createCoachProfile(userId: $userId) }`, { userId });
  if (!result.success) redirect(`/dashboard/platform/instructors?coachError=${encodeURIComponent(staffActionError(result, "The coach profile couldn't be created."))}`);
  revalidatePath("/dashboard/platform/instructors");
  redirect(`/dashboard/instructors/${encodeURIComponent(result.data.createCoachProfile.id)}`);
}
