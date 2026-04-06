import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneContext } from '@/features/keystone/context'
import { ClassCatalogPage } from './ClassCatalogPage'

export async function ClassCatalogPageServer() {
  await requireDashboardManager()

  const classTypes = await keystoneContext.sudo().query.ClassType.findMany({
    orderBy: [{ name: 'asc' }],
    query: `
      id
      name
      description { document }
      difficulty
      duration
      caloriesBurn
      equipmentNeeded
    `,
  })

  return <ClassCatalogPage initialClassTypes={classTypes as any[]} />
}

export default ClassCatalogPageServer
