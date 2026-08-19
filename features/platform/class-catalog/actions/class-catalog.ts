"use server";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function saveClassType(data: Record<string, unknown>, id?: string | null) {
  if (id) {
    const response = await keystoneClient<{ updateClassType: { id: string } }>(`
      mutation UpdateClassType($id: ID!, $data: ClassTypeUpdateInput!) {
        updateClassType(where: { id: $id }, data: $data) { id }
      }
    `, { id, data });
    if (!response.success) throw new Error(response.error);
    return response.data.updateClassType;
  }
  const response = await keystoneClient<{ createClassType: { id: string } }>(`
    mutation CreateClassType($data: ClassTypeCreateInput!) { createClassType(data: $data) { id } }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.createClassType;
}
