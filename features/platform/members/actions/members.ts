"use server";

import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";
import { mailDeliveryEnabled } from "@/features/keystone/lib/mail";

export type InviteMemberState = {
  status: "idle" | "requested" | "created" | "existing" | "error";
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
    inviteMember: { email: string; created: boolean };
  }>(`
    mutation InviteMember($data: InviteMemberInput!) {
      inviteMember(data: $data) { userId memberId email created }
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

  const { email, created } = invitation.data.inviteMember;
  revalidatePath("/dashboard/platform/members");
  if (!created) {
    return {
      status: "existing",
      message: "This member already has an account. No email was sent; they can use Forgot password on the storefront to choose a new password.",
      email,
    };
  }
  if (!mailDeliveryEnabled()) {
    return {
      status: "created",
      message: "Member account ready. Email is turned off, so no setup email was sent. Once email is available, the member can use Forgot password on the storefront.",
      email,
    };
  }
  // The native request sends the setup link to the member's own mailbox; its answer is the same
  // whether or not mail goes out, so it is a request, not proof of delivery.
  const reset = await keystoneClient<{ sendUserPasswordResetLink?: boolean | null }>(`
    mutation SendMemberInvite($email: String!) {
      sendUserPasswordResetLink(email: $email)
    }
  `, { email });
  return reset.success
    ? {
        status: "requested",
        message: "Member account ready. A password-setup email was requested for this address; Gym can't confirm it reached the inbox. If it doesn't arrive, the member can use Forgot password on the storefront.",
        email,
      }
    : {
        status: "created",
        message: "Member account ready, but the setup email could not be requested. The member can use Forgot password on the storefront once email is working.",
        email,
      };
}
