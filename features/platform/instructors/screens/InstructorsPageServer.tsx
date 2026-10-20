import { requireDashboardManager } from '@/features/platform/lib/current-user'
import { ListPage } from '@/features/dashboard/screens/ListPage'
import { AddCoachPanel } from '../components/AddCoachPanel'

/**
 * Coach profiles use the shared list and item workflow: server search, filters, sort, field selection and
 * pagination, stable item and create URLs, and the shared document and relationship editors that
 * save only changed fields. Model access, hooks and validation stay authoritative.
 */
export async function InstructorsPageServer({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireDashboardManager()
  const params = await searchParams
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''
  return (
    <>
      <ListPage params={Promise.resolve({ listKey: 'instructors' })} searchParams={Promise.resolve(params)} />
      <div className="px-4 pb-6 md:px-6">
        <AddCoachPanel q={first(params.coachQuery).slice(0, 100)} skip={Number(first(params.coachSkip)) || 0} error={first(params.coachError).slice(0, 300) || undefined} />
      </div>
    </>
  )
}

export default InstructorsPageServer
