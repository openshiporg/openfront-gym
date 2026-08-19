import {
  getAuthenticatedUser,
  handleDashboardRoutes,
} from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { consumeAuthAttempt } from '@/lib/authRateLimit';
import {
  inspectGraphQLAuthPayload,
  readGraphQLRequestPayload,
} from '@/lib/graphqlAuthRateLimit';
import { keystoneContext } from '@/features/keystone/context';

const dashboardPath = '/dashboard';

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/graphql') {
    // Limit only credential-bearing public operations. A shared fallback bucket
    // on every GraphQL request lets ordinary traffic or one attacker deny the
    // entire application when the runtime does not expose a trusted client IP.
    if (request.method === 'POST') {
      try {
        const inspection = inspectGraphQLAuthPayload(await readGraphQLRequestPayload(request));
        if (inspection.authRootCount > 1) {
          return NextResponse.json(
            { errors: [{ message: 'Only one authentication operation is allowed per request' }] },
            { status: 400 },
          );
        }
        if (inspection.isAuth) {
          const globallyAllowed = await consumeAuthAttempt(
            keystoneContext.prisma,
            'graphql-auth:global',
            500,
            15 * 60 * 1000,
          );
          let identitiesAllowed = true;
          for (const identity of inspection.identities) {
            identitiesAllowed = identitiesAllowed && await consumeAuthAttempt(
              keystoneContext.prisma,
              `graphql-auth:${identity}`,
              20,
              15 * 60 * 1000,
            );
          }
          if (!globallyAllowed || !identitiesAllowed) {
            return NextResponse.json({ errors: [{ message: 'Too many requests' }] }, { status: 429 });
          }
        }
      } catch {
        // Let GraphQL return its normal bounded parse/validation response.
      }
    }
    return NextResponse.next();
  }
  const { user, redirectToInit } = await getAuthenticatedUser(request);

  // Match canonical openfront behavior:
  // if no initial user exists yet, all storefront traffic should redirect to dashboard/init.
  if (
    redirectToInit &&
    !request.nextUrl.pathname.startsWith(`${dashboardPath}/init`)
  ) {
    return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));
  }

  const dashboardResponse = await handleDashboardRoutes(request, user, redirectToInit);
  if (dashboardResponse) return dashboardResponse;

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/graphql',
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.svg (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.svg).*)',
  ],
};