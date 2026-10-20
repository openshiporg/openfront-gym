"use server";

import { revalidatePath } from "next/cache";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";
import { recordParticipationAcceptance } from "@/features/storefront/lib/data/participation";

/** Accepts the current participation terms from the booking sheet. */
export async function acceptParticipationTermsAction(policyId: string): Promise<{ success: boolean; error?: string }> {
  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) return { success: false, error: "Sign in to accept the participation terms." };
  if (typeof policyId !== "string" || !policyId || policyId.length > 200) return { success: false, error: "These terms are no longer current. Refresh and try again." };
  try {
    await recordParticipationAcceptance(policyId, headers);
  } catch (error: any) {
    const message = String(error?.response?.errors?.[0]?.message || "");
    return { success: false, error: /current participation policy/i.test(message) ? "The terms changed. Refresh to read the current version." : "Your acceptance wasn't saved. Try again, or accept under Account → Participation." };
  }
  revalidatePath("/account/participation");
  return { success: true };
}
