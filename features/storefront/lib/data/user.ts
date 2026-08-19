"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { consumeAuthAttempt, normalizeAuthIdentity } from "@/lib/authRateLimit";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { keystoneContext } from "@/features/keystone/context";
import { getAuthHeaders, setAuthToken, removeAuthToken } from "./cookies";
import { safeStorefrontReturnPath } from "../return-path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type StorefrontUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
  stripeCustomerId?: string | null;
  organization?: { id: string; defaultCurrency?: string | null } | null;
  role?: {
    id: string;
    name: string;
    isInstructor: boolean;
    canAccessDashboard: boolean;
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

    const { authenticatedItem } = await gymClient.request<any>(
      gql`
        query StorefrontGetUser {
          authenticatedItem {
            ... on User {
              id
              name
              email
              phone
              createdAt
              stripeCustomerId
              organization { id defaultCurrency }
              role {
                id
                name
                isInstructor
                canAccessDashboard
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

    return authenticatedItem ?? null;
  } catch (error: any) {
    if (error?.digest === "DYNAMIC_SERVER_USAGE") {
      throw error;
    }

    console.error("getUser error:", error);
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
  if (!normalizedEmail || !(await consumeAuthAttempt(keystoneContext.prisma, "signin:global", 500, 15 * 60 * 1000)) || !(await consumeAuthAttempt(keystoneContext.prisma, `signin:${normalizedEmail}`, 10, 15 * 60 * 1000))) return "Sign in failed. Please try again later.";

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
    if (auth?.message) return auth.message;
    if (auth?.sessionToken) {
      await setAuthToken(auth.sessionToken);
    } else {
      return "Unexpected error. Please try again.";
    }
  } catch (error) {
    return error instanceof Error ? error.message : "Sign in failed.";
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
    if (auth?.message) return `Account created but sign-in failed: ${auth.message}`;
    if (auth?.sessionToken) {
      await setAuthToken(auth.sessionToken);
    } else {
      return "Account created. Please sign in.";
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("unique")) {
      return "An account with that email already exists. Please sign in.";
    }
    return msg;
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signOut() {
  await removeAuthToken();
  revalidatePath("/", "layout");
  redirect("/");
}

// ─── Profile update ─────────────────────────────────────────────────────────

/**
 * Updates the authenticated User and Member atomically through the bounded
 * updateMemberProfile application mutation.
 */
export async function updateProfile(
  _prevState: { success: boolean; error: string | null } | null,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  try {
    const headers = await getAuthHeaders();
    if (!Object.keys(headers).length) {
      return { success: false, error: "Not logged in." };
    }

    const name = formData.get("name")?.toString().trim() ?? "";
    const email = formData.get("email")?.toString().trim() ?? "";
    const phone = formData.get("phone")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString().trim() ?? "";

    if (!name || name.length > 120) {
      return { success: false, error: "Name must be between 1 and 120 characters." };
    }
    if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) {
      return { success: false, error: "Enter a valid email address." };
    }
    if (phone.length > 40) {
      return { success: false, error: "Phone number must be 40 characters or fewer." };
    }
    if (password && (password.length < 12 || password.length > 128)) {
      return { success: false, error: "Password must be between 12 and 128 characters." };
    }

    const data: Record<string, string> = { name, email, phone };
    if (password) data.password = password;
    await gymClient.request(
      gql`
        mutation StorefrontUpdateProfile($data: MemberProfileUpdateInput!) {
          updateMemberProfile(data: $data) { id name email phone }
        }
      `,
      { data },
      headers,
    );

    revalidatePath("/account", "layout");
    revalidatePath("/account/profile");
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
