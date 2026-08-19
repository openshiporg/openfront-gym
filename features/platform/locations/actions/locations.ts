"use server";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function saveLocation(data: Record<string, unknown>, id?: string | null) {
  if (id) {
    const response = await keystoneClient<{ updateLocation: { id: string } }>(`
      mutation UpdateLocation($id: ID!, $data: LocationUpdateInput!) {
        updateLocation(where: { id: $id }, data: $data) { id }
      }
    `, { id, data });
    if (!response.success) throw new Error(response.error);
    return response.data.updateLocation;
  }
  const response = await keystoneClient<{ createLocation: { id: string } }>(`
    mutation CreateLocation($data: LocationCreateInput!) { createLocation(data: $data) { id } }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.createLocation;
}
