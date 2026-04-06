import { requireDashboardManager } from '@/features/dashboard/lib/current-user'
import { keystoneContext } from '@/features/keystone/context'
import { MembershipPlansPage } from './MembershipPlansPage'

export async function MembershipPlansPageServer() {
  await requireDashboardManager()

  const plans = await keystoneContext.sudo().query.MembershipTier.findMany({
    orderBy: [{ monthlyPrice: 'asc' }],
    query: `
      id
      name
      description { document }
      monthlyPrice
      annualPrice
      classCreditsPerMonth
      accessHours
      guestPasses
      personalTrainingSessions
      freezeAllowed
      contractLength
      billingInterval
      features
      maxClassBookings
      hasGuestPrivileges
      stripeMonthlyPriceId
      stripeAnnualPriceId
      stripeProductId
    `,
  })

  return <MembershipPlansPage initialPlans={plans as any[]} />
}

export default MembershipPlansPageServer
