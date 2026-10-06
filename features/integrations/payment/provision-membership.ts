import { getAdapterForProvider } from "../../keystone/utils/paymentProviderAdapter";
import { lockTransactionKey } from "../../keystone/mutations/classCapacity";
import type { BillingCycle } from "./types";
import { mapStripeStatusToMembership } from "./lifecycle";
import { ensureMonthlyCreditGrant } from "../../keystone/lib/membership-credits";
import { assertCheckoutCorrelation } from "./commercial-agreement";
import { guardKeystonePrismaResults } from "../../keystone/lib/prisma-result";

/** Provider calls are outside the transaction; all local activation records commit together. */
export async function provisionMembershipFromCheckoutSession(providerSessionId: string, expectedOrganizationId: string | undefined, context: any) {
  const ctx = context.sudo();
  const known = await ctx.query.PaymentSession.findMany({ where: { providerSessionId: { equals: providerSessionId } }, take: 2, query: "id organization { id }" });
  if (known.length > 1) throw new Error("Provider session is ambiguously assigned");
  const organizationId = expectedOrganizationId || known[0]?.organization?.id;
  if (!organizationId || (known[0] && known[0].organization.id !== organizationId)) throw new Error("Provider session organization does not match");
  const { provider, adapter } = await getAdapterForProvider(ctx, "pp_stripe", organizationId);
  const session = await adapter.retrieveMembershipCheckout(providerSessionId);
  if (session.id !== providerSessionId) throw new Error("Provider returned a different checkout session");
  const key = session.metadata?.paymentSessionKey;
  if (!key) throw new Error("Checkout metadata is missing payment session key");
  // Accept the original broken deployment's exact persisted attempt evidence,
  // without accepting arbitrary prefixes or a different provider session.
  const legacyKey = key.replace(/:attempt:\d+$/, "");
  const locals = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ organization: { id: { equals: organizationId } } }, { OR: [{ idempotencyKey: { equals: key } }, { idempotencyKey: { equals: legacyKey } }] }] },
    take: 2, query: "id idempotencyKey providerSessionId status amount currencyCode billingCycle data organization { id } user { id } membershipTier { id name }",
  });
  const local = locals.find((entry: any) => entry.idempotencyKey === key) || locals[0];
  assertCheckoutCorrelation(local, session, organizationId);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) throw new Error("Checkout subscription is missing");
  const subscription = await adapter.retrieveSubscription(subscriptionId);
  if (subscription.id !== subscriptionId) throw new Error("Provider returned a different subscription");
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionCustomer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId || subscriptionCustomer !== customerId) throw new Error("Subscription customer does not match checkout");
  const billingCycle: BillingCycle = local.billingCycle === "annual" ? "annual" : "monthly";
  const providerStatus = mapStripeStatusToMembership(subscription.status, Boolean(subscription.pause_collection));
  const initialEntitlementStatus = providerStatus === "cancelled" || providerStatus === "frozen" ? providerStatus : "past-due";
  const startDate = new Date(subscription.current_period_start * 1000);
  const nextBillingDate = new Date(subscription.current_period_end * 1000);
  if (!Number.isFinite(startDate.getTime()) || nextBillingDate <= startDate) throw new Error("Subscription service period is invalid");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const membershipId = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `stripe-subscription:${organizationId}:${subscriptionId}`);
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${local.user.id}`);
    const currentSession = await tx.paymentSession.findFirst({ where: { id: local.id, organizationId } });
    if (!currentSession || (currentSession.providerSessionId && currentSession.providerSessionId !== session.id)) throw new Error("Checkout attempt changed during reconciliation");
    const user = await tx.user.findFirst({ where: { id: local.user.id, organizationId } });
    if (!user || (user.stripeCustomerId && user.stripeCustomerId !== customerId)) throw new Error("Checkout customer does not match user");
    const member = await tx.member.findFirst({ where: { userId: user.id, organizationId } });
    if (!member) throw new Error("Checkout member profile is not available; retry reconciliation");
    await lockTransactionKey(tx, `member:${member.id}`);
    const existing = await tx.membership.findFirst({ where: { memberId: user.id, organizationId } });
    const replacingEndedAgreement = existing && existing.stripeSubscriptionId !== subscriptionId &&
      ["cancelled", "expired"].includes(existing.status) &&
      new Date(currentSession.data?.agreementSnapshot?.acceptedAt || 0) > new Date(existing.agreementSnapshot?.acceptedAt || 0);
    if (existing && existing.stripeSubscriptionId !== subscriptionId && !replacingEndedAgreement) throw new Error("Another subscription already owns this membership; reconciliation required");
    if (currentSession.status === "completed" && existing) return existing.id;
    const snapshot = currentSession.data?.agreementSnapshot;
    if (!snapshot?.version) throw new Error("Checkout agreement snapshot is missing; operator reconciliation required");
    const data = {
      organizationId, memberId: user.id, tierId: local.membershipTier.id, status: initialEntitlementStatus, billingCycle,
      startDate, nextBillingDate, autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
      stripeSubscriptionId: subscriptionId,
      agreementSnapshot: !replacingEndedAgreement && existing?.agreementSnapshot?.version ? existing.agreementSnapshot : snapshot,
      creditPeriodStart: !replacingEndedAgreement && existing ? existing.creditPeriodStart : null,
      creditPeriodEnd: !replacingEndedAgreement && existing ? existing.creditPeriodEnd : null,
      ...(existing && !replacingEndedAgreement ? {} : { classCreditsRemaining: 0, creditPeriodStart: null, creditPeriodEnd: null }),
    };
    // A subscription callback may have already created/advanced membership state.
    // Never reset its spent credits or overwrite a later lifecycle observation.
    const membership = existing
      ? await tx.membership.update({ where: { id: existing.id }, data: replacingEndedAgreement ? { ...data, agreementHistory: [...(existing.agreementHistory || []), existing.agreementSnapshot] } : { agreementSnapshot: data.agreementSnapshot, creditPeriodStart: data.creditPeriodStart, creditPeriodEnd: data.creditPeriodEnd } })
      : await tx.membership.create({ data });
    if (membership.status === "active" && new Date(membership.creditPeriodStart) <= new Date() && new Date(membership.creditPeriodEnd) > new Date()) await ensureMonthlyCreditGrant(tx, membership, new Date());
    await tx.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    await tx.member.update({ where: { id: member.id }, data: { membershipTierId: membership.tierId } });
    const projection = await tx.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
    if (projection && projection.organizationId !== organizationId) throw new Error("Subscription projection organization mismatch");
    if (!projection) await tx.subscription.create({ data: {
      organizationId, memberId: member.id, membershipTierId: membership.tierId, stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId, startDate, nextBillingDate,
      status: providerStatus === "active" ? "active" : providerStatus === "frozen" ? "paused" : providerStatus === "past-due" ? "past_due" : "cancelled",
    } });
    await tx.paymentSession.update({ where: { id: local.id }, data: {
      status: "completed", provisioningLockedUntil: null, completedAt: new Date(), providerSessionId: session.id,
      providerCustomerId: customerId, providerSubscriptionId: subscriptionId,
      data: { ...currentSession.data, providerSubscriptionId: subscriptionId, paymentStatus: session.payment_status },
    } });
    return membership.id;
  });
  return { membershipId, paymentProviderId: provider.id, paymentSessionId: local.id, subscriptionId, tierName: local.data?.agreementSnapshot?.tierName || local.membershipTier.name, billingCycle };
}
