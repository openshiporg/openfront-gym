import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneContext } from '@/features/keystone/context'
import { InstructorsPage } from './InstructorsPage'

export async function InstructorsPageServer() {
  await requireDashboardManager()

  const [instructors, users] = await Promise.all([
    keystoneContext.sudo().query.Instructor.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      query: `
        id
        user { id name email }
        bio { document }
        specialties
        certifications
        photo
        isActive
        classSchedules { id }
        classInstances(where: { date: { gte: "${new Date().toISOString()}" } }) { id }
      `,
    }),
    keystoneContext.sudo().query.User.findMany({
      orderBy: [{ name: 'asc' }],
      query: `
        id
        name
        email
        role { isInstructor }
      `,
    }),
  ])

  const userOptions = (users as any[]).filter((user) => user.role?.isInstructor)

  return <InstructorsPage initialInstructors={instructors as any[]} userOptions={userOptions} />
}

export default InstructorsPageServer
