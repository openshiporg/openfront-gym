import { requireSettingsManager } from '@/features/dashboard/lib/current-user'
import { getGymSettings } from '@/features/storefront/lib/data/gym-settings'
import { StoreSettingsPage } from './StoreSettingsPage'

export async function StoreSettingsPageServer() {
  await requireSettingsManager()

  const initialSettings = await getGymSettings()
  return <StoreSettingsPage initialSettings={initialSettings} />
}

export default StoreSettingsPageServer
