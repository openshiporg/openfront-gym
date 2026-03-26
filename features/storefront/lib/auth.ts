import { cookies } from "next/headers";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

/**
 * Storefront auth helper (server-side)
 * Uses the dashboard keystoneClient with the session cookie, matching
 * the same pattern used in dashboard/actions/auth.ts.
 */
export async function getStorefrontUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("keystonejs-session")?.value;

  if (!token) return null;

  const query = `
    query StorefrontAuthenticatedUser {
      authenticatedItem {
        ... on User {
          id
          name
          email
          onboardingStatus
          role {
            id
            name
            isInstructor
            canManageOnboarding
            canAccessDashboard
          }
        }
      }
    }
  `;

  try {
    const response = await keystoneClient(query, {});
    if (!response.success) return null;
    return response.data?.authenticatedItem ?? null;
  } catch {
    return null;
  }
}
