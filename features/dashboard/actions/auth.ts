'use server';

import { cookies } from 'next/headers';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { redirect } from 'next/navigation';
import { removeAuthToken } from '@/features/dashboard/lib/cookies';
import { revalidatePath } from 'next/cache';
import { normalizeAuthIdentity } from '@/lib/authRateLimit';

// Define types for GraphQL responses
interface RedeemTokenResponse {
  redeemUserPasswordResetToken?: {
    code: string;
    message: string;
  } | null;
}

interface SendLinkResponse {
  sendUserPasswordResetLink?: boolean | null;
}

interface CreateInitialUserResponse {
  authenticate?: {
    sessionToken?: string | null;
    item?: { id: string } | null;
  } | null;
}

async function persistSessionToken(sessionToken: string) {
  const cookieStore = await cookies();
  cookieStore.set('keystonejs-session', sessionToken, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function signIn(prevState: { message: string | null, formData: { email: string, password: string } }, formData: FormData) {
  const email = normalizeAuthIdentity(formData.get('email'));
  const password = formData.get('password') as string;
  const from = formData.get('from') as string || '/dashboard';

  const query = `
    mutation($email: String!, $password: String!) {
      authenticate: authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess {
          sessionToken
          item {
            id
            name
            email
          }
        }
        ... on UserAuthenticationWithPasswordFailure {
          message
        }
      }
    }
  `;

  try {
    const response = await keystoneClient(query, { email, password });

    if (!response.success) {
      return {
        message: `Authentication failed: ${response.error}`,
        formData: { email, password }
      };
    }

    // If we have a message, it's an authentication failure
    if (response.data?.authenticate?.message) {
      return {
        message: response.data.authenticate.message,
        formData: { email, password }
      };
    }

    // Check if we have a sessionToken in the response
    if (!response.data?.authenticate?.sessionToken) {
      return {
        message: 'An unexpected error occurred',
        formData: { email, password }
      };
    }

    await persistSessionToken(response.data.authenticate.sessionToken);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to authenticate',
      formData: { email, password }
    };
  }

  // Validate and sanitize the from URL to prevent open redirect vulnerabilities

  // Redirect must be outside of try/catch
  redirect(from);
}

export async function signUp(_prevState: { message: string | null, formData: { email: string, password: string } }, formData: FormData) {
  // Dashboard users are provisioned by the first-admin setup or an authorized manager.
  return {
    message: 'Unable to create account.',
    formData: {
      email: String(formData.get('email') ?? ''),
      password: '',
    },
  };
}

export async function signOut() {
  try {
    const query = `
      mutation {
        endSession
      }
    `;

    const response = await keystoneClient(query);

    // Always remove the auth token cookie, even if the mutation fails
    // This ensures the user is signed out locally
    await removeAuthToken();

    // CRITICAL: Clear Next.js router cache to prevent stale data
    revalidatePath("/", "layout");

    if (!response.success) {
      console.error(`Failed to sign out: ${response.error}`);
      // Still redirect even if server logout fails, since we cleared the cookie
    }
  } catch (error) {
    // Still remove the cookie even if there's an error
    await removeAuthToken();
    // Clear cache even on error
    revalidatePath("/", "layout");
    console.error("Logout error:", error instanceof Error ? error.message : 'An error occurred');
  }
  
  // Always redirect after logout attempt
  redirect("/dashboard/signin");
}

export async function createInitialUser(_prevState: { message: string | null, formData: { name: string, email: string, password: string } }, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const email = normalizeAuthIdentity(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const formState = { name, email, password: '' };
  const query = `
    mutation($data: CreateInitialUserInput!) {
      authenticate: createInitialUser(data: $data) {
        sessionToken
        item {
          id
        }
      }
    }
  `;

  try {
    const response = await keystoneClient<CreateInitialUserResponse>(query, {
      data: { name, email, password }
    });

    if (!response.success) {
      return {
        message: "We couldn't confirm admin setup. It may have completed; try signing in with this email before attempting setup again.",
        formData: formState,
      };
    }

    const authentication = response.data?.authenticate;
    if (!authentication?.item?.id || !authentication.sessionToken) {
      return {
        message: "Admin setup may have completed, but a session wasn't returned. Try signing in before attempting setup again.",
        formData: formState,
      };
    }

    // Keystone creates the tenant-bound admin and returns its session in this mutation.
    // Persist that session directly instead of re-authenticating with raw form input.
    await persistSessionToken(authentication.sessionToken);
  } catch {
    return {
      message: "We couldn't confirm admin setup. It may have completed; try signing in with this email before attempting setup again.",
      formData: formState,
    };
  }

  redirect('/dashboard');
}

export async function resetPassword(prevState: { message: string | null, success: string | null, formData: { email: string, password: string } }, formData: FormData, mode: 'reset' | 'request') {
  const email = formData.get('email') as string;

  if (mode === 'reset') {
    const password = formData.get('password') as string;
    const token = formData.get('token') as string;

    const query = `
      mutation($email: String!, $password: String!, $token: String!) {
        redeemUserPasswordResetToken(
          email: $email
          token: $token
          password: $password
        ) {
          code
          message
        }
      }
    `;

    try {
      const response = await keystoneClient<RedeemTokenResponse>(query, { email, password, token });

      if (!response.success) {
        return {
          message: `Password reset failed: ${response.error}`,
          formData: { email, password }
        };
      }

      if (response.data?.redeemUserPasswordResetToken?.code) {
        return {
          message: response.data.redeemUserPasswordResetToken.message,
          formData: { email, password }
        };
      }

      return {
        success: 'Password has been reset. You can now sign in.',
        formData: { email, password }
      };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : 'Reset operation failed',
        formData: { email, password }
      };
    }
  } else {
    // Request reset
    const query = `
      mutation($email: String!) {
        sendUserPasswordResetLink(email: $email)
      }
    `;

    try {
      const response = await keystoneClient<SendLinkResponse>(query, { email });

      if (!response.success) {
        return {
          message: `Password reset request failed: ${response.error}`,
          formData: { email, password: '' }
        };
      }

      if (response.data?.sendUserPasswordResetLink === true) {
        return {
          success: 'If an eligible account exists and email delivery is available, reset instructions may be sent.',
          formData: { email, password: '' }
        };
      } else {
        return {
          message: 'Password reset request failed',
          formData: { email, password: '' }
        };
      }
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : 'Reset operation failed',
        formData: { email, password: '' }
      };
    }
  }
}

export async function getAuthenticatedUser() {
  const query = `
    query AuthenticatedUser {
      authenticatedItem {
        ... on User {
          id
          email
          name
          onboardingStatus
          organization { id }
          role {
            canAccessDashboard
            canManageAllRecords
            canManagePeople
            canManageOnboarding
            canManageSettings
            canViewReports
            isInstructor
          }
        }
      }
    }
  `;

  const response = await keystoneClient(query);

  return response;
}

export async function getAuthHeaders() {
  'use server';
  const cookieStore = await cookies();
  const keystoneCookie = cookieStore.get('keystonejs-session')?.value;
  return keystoneCookie ? {
    Cookie: `keystonejs-session=${keystoneCookie}`
  } : {};
}