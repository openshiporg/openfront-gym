import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneContext } from '@/features/keystone/context'
import { LocationsPage } from './LocationsPage'

export async function LocationsPageServer() {
  await requireDashboardManager()

  const locations = await keystoneContext.sudo().query.Location.findMany({
    orderBy: [{ name: 'asc' }],
    query: `
      id
      name
      address
      phone
      isActive
    `,
  })

  return <LocationsPage initialLocations={locations as any[]} />
}

export default LocationsPageServer
