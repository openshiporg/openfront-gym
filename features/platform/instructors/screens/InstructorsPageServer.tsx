import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { InstructorsPage } from './InstructorsPage'

export async function InstructorsPageServer() {
  await requireDashboardManager()
  const now = new Date().toISOString()
  const response = await keystoneClient<{ instructors: any[]; users: any[] }>(`
    query InstructorWorkspace($now: DateTime!) {
      instructors(orderBy: [{ updatedAt: desc }], take: 500) {
        id user { id name email } bio { document } specialties certifications photo isActive
        classSchedules { id }
        classInstances(where: { date: { gte: $now } }, take: 500) { id }
      }
      users(orderBy: [{ name: asc }], take: 1000) { id name email role { isInstructor } }
    }
  `, { now })
  if (!response.success) throw new Error(response.error)
  return (
    <InstructorsPage
      initialInstructors={response.data.instructors}
      userOptions={response.data.users.filter((user) => user.role?.isInstructor)}
    />
  )
}

export default InstructorsPageServer
