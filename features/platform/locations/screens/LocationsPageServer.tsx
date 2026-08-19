import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { LocationsPage } from './LocationsPage'

export async function LocationsPageServer() {
  await requireDashboardManager()
  const response = await keystoneClient<{ locations: any[] }>(`
    query LocationWorkspace {
      locations(orderBy: [{ name: asc }], take: 500) { id name address phone isActive }
    }
  `)
  if (!response.success) throw new Error(response.error)
  return <LocationsPage initialLocations={response.data.locations} />
}

export default LocationsPageServer
