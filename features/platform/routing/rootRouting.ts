export const DASHBOARD_ROOT = '/dashboard';

/**
 * Root-only platform extension for the fresh-install entry point. Dashboard
 * and other public-route lifecycle decisions remain owned by proxy ordering.
 */
export function getFreshInstallRootRedirect(
  pathname: string,
  redirectToInit: boolean,
): '/dashboard' | null {
  return redirectToInit && pathname === '/' ? DASHBOARD_ROOT : null;
}
