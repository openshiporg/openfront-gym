"use server";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function saveGymSettings(data: Record<string, unknown>) {
  const response = await keystoneClient<{ upsertGymSettings: { id: string } }>(`
    mutation UpsertGymSettings($data: GymSettingsUpdateInput!) {
      upsertGymSettings(data: $data) { id }
    }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.upsertGymSettings;
}
