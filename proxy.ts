import { handleDashboardRoutes, getAuthenticatedUser } from '@/features/dashboard/middleware';
import { NextRequest, NextResponse } from 'next/server';

const dashboardPath = '/dashboard';

export async function proxy(request: NextRequest) {
  const { user, redirectToInit } = await getAuthenticatedUser(request);

  // Match canonical openfront behavior:
  // if no initial user exists yet, all storefront traffic should redirect to dashboard/init.
  if (redirectToInit && !request.nextUrl.pathname.startsWith(`${dashboardPath}/init`)) {
    return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));
  }

  const dashboardResponse = await handleDashboardRoutes(request, user, redirectToInit);
  if (dashboardResponse) return dashboardResponse;

  return NextResponse.next();
}

export const config = {
  matcher: [
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