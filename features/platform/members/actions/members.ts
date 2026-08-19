"use server";

import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export type InviteMemberState = {
  status: "idle" | "sent" | "created" | "error";
  message: string | null;
  email: string | null;
};

export async function inviteMemberAction(
  _previousState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  };

  const invitation = await keystoneClient<{
    inviteMember: { email: string };
  }>(`
    mutation InviteMember($data: InviteMemberInput!) {
      inviteMember(data: $data) { userId memberId email }
    }
  `, { data });

  if (!invitation.success) {
    const normalized = invitation.error.toLowerCase();
    const message = normalized.includes("account with this email")
      ? "An account with this email already exists outside this member workflow."
      : normalized.includes("valid email")
        ? "Enter a valid member email address."
        : normalized.includes("name is required")
          ? "Enter a member name of 120 characters or fewer."
          : "The member account could not be prepared. No duplicate invitation was created; review the details and try again.";
    return {
      status: "error",
      message,
      email: data.email || null,
    };
  }

  const email = invitation.data.inviteMember.email;
  const reset = await keystoneClient<{ sendUserPasswordResetLink?: boolean | null }>(`
    mutation SendMemberInvite($email: String!) {
      sendUserPasswordResetLink(email: $email)
    }
  `, { email });
  const deliveryConfirmed = reset.success && reset.data.sendUserPasswordResetLink === true;

  revalidatePath("/dashboard/platform/members");
  return deliveryConfirmed
    ? {
        status: "sent",
        message: "Member account ready. A secure password-setup email was sent; submitting the same address again only resends setup.",
        email,
      }
    : {
        status: "created",
        message: "Member account ready, but setup email delivery was not confirmed. Ask the member to use Forgot password.",
        email,
      };
}
