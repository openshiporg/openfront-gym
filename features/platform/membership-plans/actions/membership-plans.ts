"use server";

import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { validateMembershipPlanInput } from "./membership-plan-policy";

export async function saveMembershipPlan(data: Record<string, unknown>, id?: string | null) {
  const validatedData = validateMembershipPlanInput(data);
  if (id) {
    const response = await keystoneClient<{ updateMembershipTier: { id: string } }>(`
      mutation UpdateMembershipTier($id: ID!, $data: MembershipTierUpdateInput!) {
        updateMembershipTier(where: { id: $id }, data: $data) { id }
      }
    `, { id, data: validatedData });
    if (!response.success) throw new Error(response.error);
    return response.data.updateMembershipTier;
  }
  const response = await keystoneClient<{ createMembershipTier: { id: string } }>(`
    mutation CreateMembershipTier($data: MembershipTierCreateInput!) {
      createMembershipTier(data: $data) { id }
    }
  `, { data: validatedData });
  if (!response.success) throw new Error(response.error);
  return response.data.createMembershipTier;
}
