import { refreshMemberEntitlement } from '../lib/membership-credits';
import { guardKeystonePrismaResults } from '../lib/prisma-result';
export async function refreshMyEntitlement(_root: unknown, _args: unknown, context: any) {
  const userId = context.session?.itemId;
  const organizationId = context.session?.data?.organization?.id;
  if (!userId || !organizationId) throw new Error('Authentication required');
  const result = await refreshMemberEntitlement(context, organizationId, userId);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const membership = await prisma.membership.findFirst({ where: { memberId: userId, organizationId }, select: {
    id: true, status: true, classCreditsRemaining: true, agreementSnapshot: true, billingCycle: true,
    startDate: true, nextBillingDate: true, cancelledAt: true, autoRenew: true, stripeSubscriptionId: true,
    freezeStartDate: true, freezeEndDate: true, tier: { select: { id: true, name: true, monthlyPrice: true, classCreditsPerMonth: true, freezeAllowed: true } },
  } });
  return { ...result, membership };
}
