"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders, setAuthToken, removeAuthToken } from "./cookies";

// ─── Types ─────────────────────────────────────────────────────────────────

export type StorefrontUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
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
    classCreditsRemaining: number | null;
    tier: {
      id: string;
      name: string;
      monthlyPrice: number;
      classCreditsPerMonth: number;
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
                classCreditsRemaining
                tier {
                  id
                  name
                  monthlyPrice
                  classCreditsPerMonth
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
      { email, password }
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
  redirect("/account");
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
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const phone = (formData.get("phone") as string) ?? "";
  const redirectTo = (formData.get("redirectTo") as string) || "/account";

  try {
    const { createUser } = await gymClient.request<any>(
      gql`
        mutation StorefrontCreateUser($data: UserCreateInput!) {
          createUser(data: $data) { id email }
        }
      `,
      { data: { email, password, name, ...(phone ? { phone } : {}) } }
    );

    if (!createUser?.id) return "Failed to create account. Please try again.";

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
      { email, password }
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
 * updateProfile uses updateUser(where, data) — there is no updateActiveUser mutation.
 * Resolves the caller's User.id from the session first.
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

    // Resolve session user ID
    const { authenticatedItem } = await gymClient.request<any>(
      gql`query { authenticatedItem { ... on User { id } } }`,
      {},
      headers
    );
    const userId: string | undefined = authenticatedItem?.id;
    if (!userId) return { success: false, error: "Session expired." };

    // Build update payload — only include non-empty values
    const data: Record<string, string> = {};
    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim();
    const password = (formData.get("password") as string)?.trim();
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone) data.phone = phone;
    if (password) data.password = password;

    if (!Object.keys(data).length) {
      return { success: false, error: "No changes to save." };
    }

    await gymClient.request<any>(
      gql`
        mutation StorefrontUpdateUser($id: ID!, $data: UserUpdateInput!) {
          updateUser(where: { id: $id }, data: $data) { id name email phone }
        }
      `,
      { id: userId, data },
      headers
    );

    revalidatePath("/account");
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
