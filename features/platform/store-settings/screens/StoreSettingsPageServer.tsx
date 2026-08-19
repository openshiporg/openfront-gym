import { requireSettingsManager } from '@/features/dashboard/lib/current-user'
import { getGymSettings } from '@/features/storefront/lib/data/gym-settings'
import { toPlainData } from '@/features/platform/lib/serialization'
import { StoreSettingsPage } from './StoreSettingsPage'

export async function StoreSettingsPageServer() {
  await requireSettingsManager()

  const initialSettings = await getGymSettings()
  return <StoreSettingsPage initialSettings={toPlainData(initialSettings)} />
}

export default StoreSettingsPageServer
