"use server";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

/** The signed-in operator's own tenant settings, as stored, and the current participation policy. */
export async function loadGymSettingsEditor() {
  const response = await keystoneClient<{ gymSettingsEditor: { settings: any; participationPolicy: any } }>(`query GymSettingsEditor { gymSettingsEditor }`);
  if (!response.success) return { success: false as const, error: staffActionError(response, "Settings could not be loaded. Reload the page.") };
  return { success: true as const, data: response.data.gymSettingsEditor };
}

export async function saveGymSettings(data: Record<string, unknown>, expectedUpdatedAt: string | null) {
  const response = await keystoneClient<{ upsertGymSettings: { id: string } }>(`
    mutation UpsertGymSettings($data: GymSettingsUpdateInput!, $expectedUpdatedAt: String) {
      upsertGymSettings(data: $data, expectedUpdatedAt: $expectedUpdatedAt) { id }
    }
  `, { data, expectedUpdatedAt });
  // Returned, not thrown: production Server Actions hide thrown messages.
  if (!response.success) return { success: false as const, error: staffActionError(response, "Settings were not saved. Check the highlighted values and try again.") };
  return { success: true as const, id: response.data.upsertGymSettings.id };
}

export async function publishParticipationTerms(text: string, expectedPolicyId: string | null) {
  const response = await keystoneClient<{ publishGymParticipationTerms: any }>(`
    mutation PublishParticipationTerms($text: String!, $expectedPolicyId: ID) {
      publishGymParticipationTerms(text: $text, expectedPolicyId: $expectedPolicyId)
    }
  `, { text, expectedPolicyId });
  if (!response.success) return { success: false as const, error: staffActionError(response, "Terms were not published. Reload and try again.") };
  return { success: true as const, policy: response.data.publishGymParticipationTerms };
}
