import { requireDashboardManager } from '@/features/platform/lib/current-user'
import { ListPage } from '@/features/dashboard/screens/ListPage'

/**
 * Membership plans use the shared list and item workflow: server search, filters, sort, field selection and
 * pagination, stable item and create URLs, and the shared document and relationship editors that
 * save only changed fields. Model access, hooks and validation stay authoritative.
 */
export async function MembershipPlansPageServer({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireDashboardManager()
  return <ListPage params={Promise.resolve({ listKey: 'membership-tiers' })} searchParams={searchParams} />
}

export default MembershipPlansPageServer
