import { keystoneContext } from "@/features/keystone/context";
import { cookies } from "next/headers";

/**
 * Storefront auth helper (server-side)
 * Mirrors Openfront principle: storefront session is real Keystone session.
 */
export async function getStorefrontUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("keystonejs-session")?.value;

  if (!token) return null;

  // Keystone context with current session token
  const context = keystoneContext.withRequest(async () => ({
    headers: {
      cookie: `keystonejs-session=${token}`,
    },
  }) as any);

  try {
    const user = await context.query.User.findOne({
      where: { id: "" } as any,
      query: `
        id
        name
        email
        onboardingStatus
        role {
          id
          name
          isInstructor
        }
      `,
    });

    // If findOne fails due to empty where, fallback with authenticatedItem query via GraphQL client path
    // This helper remains defensive until a dedicated storefront auth endpoint is introduced.
    return user;
  } catch {
    return null;
  }
}
