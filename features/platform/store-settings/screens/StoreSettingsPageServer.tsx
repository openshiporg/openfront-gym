import { requireSettingsManager } from '@/features/platform/lib/current-user'
import { toPlainData } from '@/features/platform/lib/serialization'
import { loadGymSettingsEditor } from '../actions/store-settings'
import { StoreSettingsPage } from './StoreSettingsPage'

export async function StoreSettingsPageServer() {
  const user = await requireSettingsManager()
  // The operator's own tenant record, never the public storefront projection.
  const loaded = await loadGymSettingsEditor()
  // Terms publication has its own authority (operations policy managers); the server re-checks it.
  return <StoreSettingsPage initial={loaded.success ? toPlainData(loaded.data) : null} loadError={loaded.success ? null : loaded.error} canPublishPolicy={Boolean(user.role?.canManageAllRecords)} />
}

export default StoreSettingsPageServer
