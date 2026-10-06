"use server";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export async function prepareInstructorClaim(instructorId: string, email: string): Promise<
  | { success: true; data: { email: string } }
  | { success: false; error: string }
> {
  const prepared = await keystoneClient<{
    prepareInstructorAccount: { email: string };
  }>(`
    mutation PrepareInstructorAccount($instructorId: ID!, $email: String!) {
      prepareInstructorAccount(instructorId: $instructorId, email: $email) { userId email }
    }
  `, { instructorId, email });
  if (!prepared.success) {
    return { success: false, error: "The instructor account could not be prepared. Verify the coach email and try again." };
  }

  const normalizedEmail = prepared.data.prepareInstructorAccount.email;
  const reset = await keystoneClient(`
    mutation SendInstructorClaim($email: String!) {
      sendUserPasswordResetLink(email: $email)
    }
  `, { email: normalizedEmail });
  if (!reset.success) {
    return { success: false, error: "The coach email was saved, but the claim link could not be sent. Retry after email delivery is configured." };
  }
  return { success: true, data: prepared.data.prepareInstructorAccount };
}

export async function saveInstructor(data: Record<string, unknown>, id?: string | null) {
  if (id) {
    const response = await keystoneClient<{ updateInstructor: { id: string } }>(`
      mutation UpdateInstructor($id: ID!, $data: InstructorUpdateInput!) {
        updateInstructor(where: { id: $id }, data: $data) { id }
      }
    `, { id, data });
    if (!response.success) throw new Error(response.error);
    return response.data.updateInstructor;
  }
  const response = await keystoneClient<{ createInstructor: { id: string } }>(`
    mutation CreateInstructor($data: InstructorCreateInput!) { createInstructor(data: $data) { id } }
  `, { data });
  if (!response.success) throw new Error(response.error);
  return response.data.createInstructor;
}
