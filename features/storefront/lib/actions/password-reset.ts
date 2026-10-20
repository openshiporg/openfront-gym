"use server";

import { gql } from "graphql-request";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeAuthIdentity } from "@/lib/authRateLimit";
import { gymClient } from "@/features/storefront/lib/config";
import { setAuthToken } from "@/features/storefront/lib/data/cookies";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";
import { customerErrorMessage } from "@/features/storefront/lib/customer-error";

export type PasswordResetState = {
  status: "idle" | "sent" | "error";
  message: string | null;
};

// The storefront page a customer was heading to when they asked for a reset link. It is only a
// safe relative path in this browser, never part of the emailed link or the native token.
const RESET_RETURN_COOKIE = "gym-reset-return";

/** Requests a Keystone reset link. The reply never says whether an account exists for the email. */
export async function requestPasswordResetAction(
  _previousState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const email = normalizeAuthIdentity(String(formData.get("email") || ""));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const returnTo = safeStorefrontReturnPath(formData.get("returnTo"), "");
  const jar = await cookies();
  if (returnTo) jar.set(RESET_RETURN_COOKIE, returnTo, { maxAge: 60 * 60, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  else jar.delete(RESET_RETURN_COOKIE);
  try {
    await gymClient.request(gql`
      mutation StorefrontPasswordReset($email: String!) {
        sendUserPasswordResetLink(email: $email)
      }
    `, { email });
  } catch {
    return { status: "error", message: "The reset email could not be sent. Try again, or ask the club for help." };
  }
  return { status: "sent", message: "If an account uses that email, a reset link is on its way." };
}

export type PasswordRedeemState = { status: "idle" | "error"; message: string | null };

/**
 * Completes a reset/setup link on the storefront: redeems the one-use token for that email,
 * signs the customer in with the password they just chose, and returns them to where they were.
 */
export async function redeemPasswordResetAction(
  _previousState: PasswordRedeemState,
  formData: FormData,
): Promise<PasswordRedeemState> {
  const email = normalizeAuthIdentity(String(formData.get("email") || ""));
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const jar = await cookies();
  const next = safeStorefrontReturnPath(formData.get("next") || jar.get(RESET_RETURN_COOKIE)?.value);
  if (!email || !token || token.length > 200) return { status: "error", message: "This link is incomplete. Request a new one from Reset password." };
  if (password.length < 12 || password.length > 128) return { status: "error", message: "Use a password of 12 to 128 characters." };
  if (password !== confirm) return { status: "error", message: "The two passwords don’t match." };
  let sessionToken: string | null = null;
  let otherClub = false;
  try {
    const result = await gymClient.request<{ redeemUserPasswordResetToken: { code: string; message: string } | null }>(gql`
      mutation StorefrontRedeemReset($email: String!, $token: String!, $password: String!) {
        redeemUserPasswordResetToken(email: $email, token: $token, password: $password) { code message }
      }
    `, { email, token, password });
    const failure = result.redeemUserPasswordResetToken;
    if (failure) {
      if (failure.code === "TOKEN_EXPIRED") return { status: "error", message: "This link has expired. Request a new one from Reset password." };
      if (failure.code === "TOKEN_REDEEMED") return { status: "error", message: "This link was already used. Sign in, or request a new link." };
      return { status: "error", message: "This link isn’t valid for that account. Request a new one from Reset password." };
    }
    const auth = await gymClient.request<any>(gql`
      mutation StorefrontSignInAfterReset($email: String!, $password: String!) {
        authenticateUserWithPassword(email: $email, password: $password) {
          ... on UserAuthenticationWithPasswordSuccess { sessionToken }
          ... on UserAuthenticationWithPasswordFailure { message }
        }
      }
    `, { email, password });
    const candidate = auth.authenticateUserWithPassword?.sessionToken || null;
    if (candidate) {
      // Same rule as normal sign-in: only this storefront's tenant gets a storefront session here.
      const owner = await gymClient.request<any>(gql`
        query StorefrontResetOrganization { storefrontOrganization authenticatedItem { ... on User { organization { id } } } }
      `, {}, { authorization: `Bearer ${candidate}` });
      if (owner.authenticatedItem?.organization?.id === owner.storefrontOrganization) sessionToken = candidate;
      else otherClub = true;
    }
  } catch (error) {
    const detail = String((error as any)?.response?.errors?.[0]?.message || "").toLowerCase();
    if (detail.includes("common")) return { status: "error", message: "That password is too common. Choose a different one." };
    return { status: "error", message: customerErrorMessage(error, "Your password couldn’t be changed. Try again, or request a new link.") };
  }
  jar.delete(RESET_RETURN_COOKIE);
  if (otherClub) return { status: "error", message: "Your password was changed. This account is for a different club, so sign in on that club’s website." };
  if (sessionToken) await setAuthToken(sessionToken);
  revalidatePath("/", "layout");
  redirect(sessionToken ? next : `/account?returnTo=${encodeURIComponent(next)}`);
}
