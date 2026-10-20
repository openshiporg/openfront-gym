"use server";

import { redirect } from "next/navigation";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

export type AccountFormState = { status: "idle" | "done" | "error"; message: string | null };

/** Own password only: current password, confirmation, bytes kept exactly as typed. */
export async function changeOwnPasswordAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!currentPassword) return { status: "error", message: "Enter your current password." };
  if (newPassword.length < 12 || newPassword.length > 128) return { status: "error", message: "Use a new password of 12 to 128 characters." };
  if (newPassword !== confirmPassword) return { status: "error", message: "The new passwords don't match." };
  const response = await keystoneClient(`
    mutation ChangeOwnPassword($currentPassword: String!, $newPassword: String!, $confirmPassword: String!) {
      changeMemberPassword(currentPassword: $currentPassword, newPassword: $newPassword, confirmPassword: $confirmPassword)
    }
  `, { currentPassword, newPassword, confirmPassword });
  if (!response.success) return { status: "error", message: staffActionError(response, "Your password couldn't be changed. Try again.") };
  return { status: "done", message: "Password changed." };
}

/** Own sign-in email: current password now, then the link sent to the new inbox confirms it. */
export async function requestOwnEmailChangeAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const newEmail = String(formData.get("newEmail") ?? "").trim();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(newEmail) || newEmail.length > 254) return { status: "error", message: "Enter a valid email address." };
  if (!currentPassword) return { status: "error", message: "Enter your current password." };
  const response = await keystoneClient<{ requestEmailChange: { pendingEmail: string; mail: string } }>(`
    mutation RequestOwnEmailChange($newEmail: String!, $currentPassword: String!) {
      requestEmailChange(newEmail: $newEmail, currentPassword: $currentPassword, surface: "dashboard") { pendingEmail mail }
    }
  `, { newEmail, currentPassword });
  if (!response.success) return { status: "error", message: staffActionError(response, "Your email change couldn't be started. Try again.") };
  const { pendingEmail, mail } = response.data.requestEmailChange;
  if (mail === "rejected" || mail === "failed") return { status: "error", message: `The confirmation email to ${pendingEmail} couldn't be sent. Check the address and try again.` };
  return { status: "done", message: `Open the link sent to ${pendingEmail} while signed in. Your sign-in email stays the same until you do.` };
}

export async function confirmOwnEmailChangeAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const token = String(formData.get("token") ?? "");
  const response = await keystoneClient(`mutation ConfirmOwnEmailChange($token: String!) { confirmEmailChange(token: $token) }`, { token });
  if (!response.success) return { status: "error", message: staffActionError(response, "This confirmation link couldn't be used. Request the change again.") };
  redirect("/dashboard/platform/account?emailChanged=1");
}
