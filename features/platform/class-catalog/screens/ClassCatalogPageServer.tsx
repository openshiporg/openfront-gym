import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { ClassCatalogPage } from './ClassCatalogPage'

export async function ClassCatalogPageServer() {
  await requireDashboardManager()
  const response = await keystoneClient<{ classTypes: any[] }>(`
    query ClassCatalogWorkspace {
      classTypes(orderBy: [{ name: asc }], take: 500) {
        id name description { document } difficulty duration caloriesBurn equipmentNeeded
      }
    }
  `)
  if (!response.success) throw new Error(response.error)
  return <ClassCatalogPage initialClassTypes={response.data.classTypes} />
}

export default ClassCatalogPageServer
