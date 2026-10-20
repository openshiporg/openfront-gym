"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { budgetKey, normalizeAuthIdentity, releaseAuthAttempt, reserveAuthAttempt } from "@/lib/authRateLimit";
import { clientSourceFromHeaders, isKnownSource } from "@/lib/clientSource";
import { customerErrorMessage } from "@/features/storefront/lib/customer-error";
import { headers as requestHeaders } from "next/headers";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { keystoneContext } from "@/features/keystone/context";
import { getAuthHeaders, setAuthToken, removeAuthToken } from "./cookies";
import { safeStorefrontReturnPath } from "../return-path";
import { recordParticipationAcceptance } from "./participation";

// ─── Types ─────────────────────────────────────────────────────────────────

export type StorefrontUser = {
  id: string;
  name: string;
  email: string;
  /** A requested sign-in email waiting for its confirmation link to be opened. */
  pendingEmail?: string | null;
  phone?: string | null;
  createdAt?: string;
  stripeCustomerId?: string | null;
  organization?: { id: string; defaultCurrency?: string | null } | null;
  role?: {
    id: string;
    name: string;
    isInstructor: boolean;
    canAccessDashboard: boolean;
    canManageAllRecords?: boolean;
    canViewReports?: boolean;
  } | null;
  membership?: {
    id: string;
    status: string;
    startDate: string | null;
    cancelledAt: string | null;
    nextBillingDate: string | null;
    autoRenew: boolean;
    billingCycle: string;
    classCreditsRemaining: number | null;
    creditPeriodStart?: string | null;
    creditPeriodEnd?: string | null;
    agreementSnapshot?: { tierName?: string; amount?: number; currencyCode?: string; classCreditsPerMonth?: number; accessHours?: string; freezeAllowed?: boolean } | null;
    stripeSubscriptionId?: string | null;
    freezeStartDate?: string | null;
    freezeEndDate?: string | null;
    tier: {
      id: string;
      name: string;
      monthlyPrice: number;
      classCreditsPerMonth: number;
      freezeAllowed?: boolean | null;
    } | null;
  } | null;
};

// ─── Read ───────────────────────────────────────────────────────────────────

export async function getUser(): Promise<StorefrontUser | null> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) return null;

    const { authenticatedItem, storefrontOrganization } = await gymClient.request<any>(
      gql`
        query StorefrontGetUser {
          storefrontOrganization
          authenticatedItem {
            ... on User {
              id
              name
              email
              pendingEmail
              phone
              createdAt
              stripeCustomerId
              organization { id defaultCurrency }
              role {
                id
                name
                isInstructor
                canAccessDashboard
                canManageAllRecords
                canViewReports
              }
              membership {
                id
                status
                startDate
                cancelledAt
                nextBillingDate
                autoRenew
                billingCycle
                classCreditsRemaining
                creditPeriodStart
                creditPeriodEnd
                agreementSnapshot
                stripeSubscriptionId
                freezeStartDate
                freezeEndDate
                tier {
                  id
                  name
                  monthlyPrice
                  classCreditsPerMonth
                  freezeAllowed
                }
              }
            }
          }
        }
      `,
      {},
      headers
    );

    // A session from another club's account is not signed in to this storefront.
    if (authenticatedItem && authenticatedItem.organization?.id !== storefrontOrganization) return null;
    return authenticatedItem ?? null;
  } catch (error: any) {
    if (error?.digest === "DYNAMIC_SERVER_USAGE") {
      throw error;
    }

    console.error("getUser failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return null;
  }
}

// ─── Auth mutations ─────────────────────────────────────────────────────────

/**
 * Sign-in action for useActionState.
 * Returns an error string on failure, redirects to /account on success.
 */
export async function login(
  _currentState: string | null,
  formData: FormData
): Promise<string | null> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const normalizedEmail = normalizeAuthIdentity(email);
  const redirectTo = safeStorefrontReturnPath(formData.get("redirectTo"));
  if (!normalizedEmail) return "Enter your email and password.";
  // Failed attempts are budgeted per account AND source, and per source: a stranger guessing at
  // someone's email from elsewhere never locks that member (or anyone else) out.
  const source = clientSourceFromHeaders(await requestHeaders());
  const accountBudget = budgetKey("signin-fail", normalizedEmail, source), sourceBudget = budgetKey("signin-fail-source", source);
  // Each attempt is reserved before the password is checked, then released if it succeeds, so
  // parallel failures cannot exceed the budget.
  const sourceKnown = isKnownSource(source);
  const reservedAccount = await reserveAuthAttempt(keystoneContext.prisma, accountBudget, 10, 15 * 60 * 1000);
  const reservedSource = reservedAccount && (!sourceKnown || await reserveAuthAttempt(keystoneContext.prisma, sourceBudget, 50, 15 * 60 * 1000));
  if (!reservedAccount || !reservedSource) {
    if (reservedAccount) await releaseAuthAttempt(keystoneContext.prisma, accountBudget);
    return "Too many failed sign-in attempts from this device. Wait 15 minutes, or reset your password.";
  }
  // A failed password keeps its reservation; anything else gives it back.
  const releaseReservation = async () => {
    await releaseAuthAttempt(keystoneContext.prisma, accountBudget);
    if (sourceKnown) await releaseAuthAttempt(keystoneContext.prisma, sourceBudget);
  };

  try {
    const result = await gymClient.request<any>(
      gql`
        mutation StorefrontLogin($email: String!, $password: String!) {
          authenticateUserWithPassword(email: $email, password: $password) {
            ... on UserAuthenticationWithPasswordSuccess {
              sessionToken
              item { id }
            }
            ... on UserAuthenticationWithPasswordFailure {
              message
            }
          }
        }
      `,
      { email: normalizedEmail, password }
    );

    const auth = result.authenticateUserWithPassword;
    if (auth?.message) {
      return "That email and password don’t match. Try again, or reset your password.";
    }
    if (auth?.sessionToken) {
      await releaseReservation();
      // Accounts belong to one club: only this storefront's members sign in here.
      const owner = await gymClient.request<any>(gql`
        query StorefrontSignInOrganization { storefrontOrganization authenticatedItem { ... on User { organization { id } } } }
      `, {}, { authorization: `Bearer ${auth.sessionToken}` });
      if (owner.authenticatedItem?.organization?.id !== owner.storefrontOrganization) {
        return "This account belongs to a different club. Sign in on that club’s website, or contact this club for an account.";
      }
      await setAuthToken(auth.sessionToken);
    } else {
      await releaseReservation();
      return "Unexpected error. Please try again.";
    }
  } catch {
    // A transport failure is not a wrong password.
    await releaseReservation();
    return "Sign in failed. Try again.";
  }

  // redirect() must be called outside try/catch
  revalidatePath("/", "layout");
  redirect(redirectTo);
}

/**
 * Sign-up action for useActionState.
 * Creates a user account, auto-signs in, redirects to /account.
 * Accepts optional hidden `redirectTo` field in formData.
 */
export async function signUp(
  _currentState: string | null,
  formData: FormData
): Promise<string | null> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const normalizedEmail = normalizeAuthIdentity(email);
  if (!normalizedEmail || password.length < 12 || password.length > 128 || !name.trim() || name.trim().length > 120 || phone.length > 40) {
    return "Unable to create account. Check the details or try again later.";
  }
  const redirectTo = safeStorefrontReturnPath(formData.get("redirectTo"));
  // Published participation terms are accepted with the new account.
  const termsPolicyId = String(formData.get("termsPolicyId") ?? "").slice(0, 200);
  if (termsPolicyId && formData.get("acceptTerms") !== "on") return "Accept the participation terms to create an account.";

  try {
    const { registerMember } = await gymClient.request<any>(
      gql`
        mutation StorefrontRegisterMember($data: RegisterMemberInput!) {
          registerMember(data: $data) { id email }
        }
      `,
      { data: { email: normalizedEmail, password, name, ...(phone ? { phone } : {}) } }
    );

    if (!registerMember?.id) return "Failed to create account. Please try again.";

    // Auto sign-in
    const authResult = await gymClient.request<any>(
      gql`
        mutation StorefrontAutoSignIn($email: String!, $password: String!) {
          authenticateUserWithPassword(email: $email, password: $password) {
            ... on UserAuthenticationWithPasswordSuccess { sessionToken }
            ... on UserAuthenticationWithPasswordFailure { message }
          }
        }
      `,
      { email: normalizedEmail, password }
    );

    const auth = authResult.authenticateUserWithPassword;
    if (auth?.message) return "Account created. Sign in to continue.";
    if (auth?.sessionToken) {
      await setAuthToken(auth.sessionToken);
      // If this fails, the booking sheet and Account → Participation ask again.
      if (termsPolicyId) await recordParticipationAcceptance(termsPolicyId, { authorization: `Bearer ${auth.sessionToken}` }).catch(() => undefined);
    } else {
      return "Account created. Please sign in.";
    }
  } catch (error: any) {
    // Read the GraphQL error itself: the client error message also embeds the request.
    return signUpFailure(error?.response?.errors?.[0]?.message ?? (error instanceof Error ? error.message : String(error)));
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

/** Customer wording for registerMember failures; server detail never reaches the page. */
function signUpFailure(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already exists") || normalized.includes("unique constraint") || normalized.includes("email_unique")) return "An account with that email already exists. Sign in instead, or reset your password if you’ve forgotten it.";
  if (normalized.includes("too many")) return "Too many attempts. Try again in an hour.";
  if (normalized.includes("valid email")) return "Enter a valid email address.";
  if (normalized.includes("name must be")) return "Enter your name (up to 120 characters).";
  if (normalized.includes("password must be")) return "Use a password of 12 to 128 characters.";
  if (normalized.includes("too common")) return "That password is too common. Choose a different one.";
  if (normalized.includes("phone number")) return "Phone number must be 40 characters or fewer.";
  if (normalized.includes("signup")) return "Online sign-up is unavailable right now. Contact the club to open an account.";
  return "Your account could not be created. Try again, or contact the club.";
}

export async function signOut() {
  await removeAuthToken();
  revalidatePath("/", "layout");
  redirect("/");
}

// ─── Profile update ─────────────────────────────────────────────────────────

/**
 * Updates the authenticated member's name and phone through the bounded updateMemberProfile
 * mutation. The sign-in email changes only through requestEmailChange (confirmed from the new
 * inbox) and the password only through changePassword.
 */
export async function updateProfile(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) {
      return { success: false, error: "Sign in again to update your profile." };
    }

    const name = formData.get("name")?.toString().trim() ?? "";
    const phone = formData.get("phone")?.toString().trim() ?? "";

    if (!name || name.length > 120) {
      return { success: false, error: "Name must be between 1 and 120 characters." };
    }
    if (phone.length > 40) {
      return { success: false, error: "Phone number must be 40 characters or fewer." };
    }

    await gymClient.request(
      gql`
        mutation StorefrontUpdateProfile($data: MemberProfileUpdateInput!) {
          updateMemberProfile(data: $data) { id name email phone }
        }
      `,
      { data: { name, phone } },
      headers,
    );

    revalidatePath("/account", "layout");
    revalidatePath("/account/profile");
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: customerErrorMessage(error, "Your profile couldn’t be saved. Try again.") };
  }
}

/** Own-account password change: current password and confirmation, kept byte-for-byte. */
export async function changePassword(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) return { success: false, error: "Sign in again to change your password." };
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!currentPassword) return { success: false, error: "Enter your current password." };
  if (newPassword.length < 12 || newPassword.length > 128) return { success: false, error: "Use a new password of 12 to 128 characters." };
  if (newPassword !== confirmPassword) return { success: false, error: "The new passwords don’t match." };
  try {
    await gymClient.request(gql`
      mutation StorefrontChangePassword($currentPassword: String!, $newPassword: String!, $confirmPassword: String!) {
        changeMemberPassword(currentPassword: $currentPassword, newPassword: $newPassword, confirmPassword: $confirmPassword)
      }
    `, { currentPassword, newPassword, confirmPassword }, headers);
    return { success: true, error: null };
  } catch (error) {
    const detail = String((error as any)?.response?.errors?.[0]?.message || "");
    if (/current password is incorrect/i.test(detail)) return { success: false, error: "Your current password is incorrect." };
    if (/too many/i.test(detail)) return { success: false, error: "Too many attempts. Wait 15 minutes and try again." };
    if (/common/i.test(detail)) return { success: false, error: "That password is too common. Choose a different one." };
    return { success: false, error: customerErrorMessage(error, "Your password couldn’t be changed. Try again.") };
  }
}

export type EmailChangeState = { status: "idle" | "requested" | "error"; message: string | null };

/** Asks for a sign-in email change: current password, then a link to the new inbox confirms it. */
export async function requestEmailChangeAction(_prev: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) return { status: "error", message: "Sign in again to change your email." };
  const newEmail = String(formData.get("newEmail") ?? "").trim();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(newEmail) || newEmail.length > 254) return { status: "error", message: "Enter a valid email address." };
  if (!currentPassword) return { status: "error", message: "Enter your current password." };
  try {
    const result = await gymClient.request<{ requestEmailChange: { pendingEmail: string; mail: string } }>(gql`
      mutation StorefrontRequestEmailChange($newEmail: String!, $currentPassword: String!) {
        requestEmailChange(newEmail: $newEmail, currentPassword: $currentPassword, surface: "storefront") { pendingEmail mail }
      }
    `, { newEmail, currentPassword }, headers);
    const { pendingEmail, mail } = result.requestEmailChange;
    revalidatePath("/account/profile");
    if (mail === "rejected" || mail === "failed") return { status: "error", message: `The confirmation email to ${pendingEmail} couldn’t be sent. Check the address and try again.` };
    return { status: "requested", message: `Open the link we sent to ${pendingEmail} while signed in here. Your sign-in email stays the same until you do.` };
  } catch (error) {
    const detail = String((error as any)?.response?.errors?.[0]?.message || "");
    if (/current password is incorrect/i.test(detail)) return { status: "error", message: "Your current password is incorrect." };
    if (/too many/i.test(detail)) return { status: "error", message: "Too many attempts. Wait 15 minutes and try again." };
    return { status: "error", message: customerErrorMessage(error, "Your email change couldn’t be started. Try again.") };
  }
}

export type EmailConfirmState = { status: "idle" | "error"; message: string | null };

/** Confirms the pending sign-in email for the signed-in holder from the link sent to the new inbox. */
export async function confirmEmailChangeAction(_prev: EmailConfirmState, formData: FormData): Promise<EmailConfirmState> {
  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) return { status: "error", message: "Sign in to confirm your new email." };
  const token = String(formData.get("token") ?? "");
  try {
    await gymClient.request(gql`
      mutation StorefrontConfirmEmailChange($token: String!) { confirmEmailChange(token: $token) }
    `, { token }, headers);
  } catch (error) {
    return { status: "error", message: customerErrorMessage(error, "This confirmation link couldn’t be used. Request the change again from your profile.") };
  }
  revalidatePath("/", "layout");
  redirect("/account/profile?emailChanged=1");
}

