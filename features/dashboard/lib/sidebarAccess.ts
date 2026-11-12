/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type SidebarRole = {
  canAccessDashboard?: boolean | null
  canManageAllRecords?: boolean | null
  isInstructor?: boolean | null
  [capability: string]: boolean | null | undefined
}
type SidebarUser = { role?: SidebarRole | null } | null | undefined

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * The capabilities each platform page's own guard accepts besides full record management
 * (an empty list means operators only). Pages not listed are open to every dashboard role.
 */
export const PLATFORM_PAGE_CAPABILITIES: Record<string, string[]> = {
  operations: [],
  billing: [],
  locations: [],
  instructors: [],
  'membership-plans': [],
  'class-catalog': [],
  scheduling: ['isInstructor'],
  rosters: ['isInstructor'],
  retail: ['canManageRetail'],
  'check-in': ['canManageCheckIns', 'canManageFacilities'],
  imports: ['canManagePeople'],
  members: ['canManagePeople', 'canSeeOtherPeople', 'canEditOtherPeople'],
  reports: ['canViewReports'],
  'store-settings': ['canManageSettings'],
}

export function canOpenPlatformPage(slug: string, role: SidebarRole) {
  const accepted = PLATFORM_PAGE_CAPABILITIES[slug]
  if (!accepted || role.canManageAllRecords === true) return true
  return accepted.some((capability) => role[capability] === true)
}

/**
 * A platform page follows its own guard for the session's role, and a page whose slug is a list
 * path also follows that list's visibility. Unknown users stay with the middleware.
 */
export function visiblePlatformItems<T extends { href: string }>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  const hiddenPaths = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  return items.filter((item) => {
    const path = item.href.split(/[?#]/)[0]
    const slug = path.includes('/platform/') ? path.split('/platform/')[1]?.split('/')[0] : path.split('/').filter(Boolean).pop()
    if (!slug) return true
    if (hiddenPaths.has(slug)) return false
    return !user?.role || canOpenPlatformPage(slug, user.role)
  })
}
