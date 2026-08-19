import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { MembershipPlansPage } from './MembershipPlansPage'

export async function MembershipPlansPageServer() {
  await requireDashboardManager()
  const response = await keystoneClient<{
    membershipTiers: any[];
    gymSettings: Array<{ currencyCode?: string | null }>;
    paymentProviders: Array<{ isInstalled: boolean }>;
  }>(`
    query MembershipPlanWorkspace {
      membershipTiers(orderBy: [{ monthlyPrice: asc }], take: 200) {
        id name description { document } monthlyPrice annualPrice classCreditsPerMonth
        accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
        billingInterval features maxClassBookings hasGuestPrivileges
        stripeMonthlyPriceId stripeAnnualPriceId stripeProductId
      }
      gymSettings: gymSettingsItems(take: 1) { currencyCode }
      paymentProviders(where: { code: { equals: "pp_stripe" } }, take: 1) { isInstalled }
    }
  `)
  if (!response.success) throw new Error(response.error)
  return (
    <MembershipPlansPage
      initialPlans={response.data.membershipTiers}
      currencyCode={response.data.gymSettings[0]?.currencyCode || 'USD'}
      stripeProviderInstalled={Boolean(response.data.paymentProviders[0]?.isInstalled)}
    />
  )
}

export default MembershipPlansPageServer
