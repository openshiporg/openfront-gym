import type Stripe from "stripe";
import { getAdapterForProvider } from "../../keystone/utils/paymentProviderAdapter";
import type { BillingCycle } from "./types";
import { mapStripeStatusToMembership } from "./lifecycle";

const PROVIDER_CODE = "pp_stripe";

function mapSubscriptionStatus(status: string, collectionPaused = false) {
  if (collectionPaused) return "paused";
  if (status === "active" || status === "trialing") return "active";
  if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(status)) return "past_due";
  if (status === "paused") return "paused";
  return "cancelled";
}

async function ensureMemberProfile(
  context: any,
  user: { id: string; name: string; email: string; phone?: string | null; organization: { id: string } },
  tierId: string
) {
  const ctx = context.sudo();
  const members = await ctx.query.Member.findMany({
    where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization.id } } }] },
    take: 1,
    query: "id membershipTier { id }",
  });
  const member = members[0] as any;
  if (member) {
    if (member.membershipTier?.id !== tierId) {
      await ctx.query.Member.updateOne({
        where: { id: member.id },
        data: { membershipTier: { connect: { id: tierId } } },
        query: "id",
      });
    }
    return member.id as string;
  }

  const created = await ctx.query.Member.createOne({
    data: {
      name: user.name,
      email: user.email,
      ...(user.phone ? { phone: user.phone } : {}),
      status: "active",
      joinDate: new Date().toISOString(),
      organization: { connect: { id: user.organization.id } },
      user: { connect: { id: user.id } },
      membershipTier: { connect: { id: tierId } },
    },
    query: "id",
  });
  return (created as any).id as string;
}

export async function provisionMembershipFromCheckoutSession(
  providerSessionId: string,
  expectedOrganizationId: string | undefined,
  context: any,
) {
  const ctx = context.sudo();
  const knownSessions = await ctx.query.PaymentSession.findMany({
    where: { providerSessionId: { equals: providerSessionId } },
    take: 2,
    query: "id organization { id } paymentProvider { id organization { id } }",
  });
  if (knownSessions.length > 1) throw new Error("Provider session is ambiguously assigned.");
  const knownOrganizationId = (knownSessions[0] as any)?.organization?.id;
  const organizationId = expectedOrganizationId || knownOrganizationId;
  if (!organizationId) throw new Error("Provider session organization is required.");
  if (knownOrganizationId && knownOrganizationId !== organizationId) throw new Error("Provider session belongs to a different organization.");
  const { provider, adapter } = await getAdapterForProvider(ctx as any, PROVIDER_CODE, organizationId);
  if (provider.organization?.id !== organizationId) throw new Error("Payment provider is not assigned to the checkout organization.");
  const session = await adapter.retrieveMembershipCheckout(providerSessionId);
  if (!session.metadata?.userId || !session.metadata?.tierId || !session.metadata?.paymentSessionKey) {
    throw new Error("Checkout session is missing required Gym metadata.");
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("Checkout session has not completed payment yet.");
  }

  const localSessions = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ idempotencyKey: { equals: session.metadata.paymentSessionKey } }, { organization: { id: { equals: provider.organization?.id } } }] },
    take: 1,
    query: "id status amount currencyCode billingCycle organization { id } user { id } membershipTier { id name }",
  });
  const localSession = localSessions[0] as any;
  if (!localSession) throw new Error("Local payment session not found.");
  if (localSession.organization?.id !== organizationId) throw new Error("Payment session belongs to a different organization.");
  if (localSession.user?.id !== session.metadata.userId || localSession.membershipTier?.id !== session.metadata.tierId) {
    throw new Error("Checkout session ownership metadata does not match the local payment session.");
  }
  if (localSession.status === "completed") {
    return { membershipId: "already-completed", paymentProviderId: provider.id, paymentSessionId: localSession.id, subscriptionId: session.subscription && typeof session.subscription === "object" ? session.subscription.id : String(session.subscription ?? ""), tierName: localSession.membershipTier?.name ?? "Membership", billingCycle: (localSession.billingCycle === "annual" ? "annual" : "monthly") as BillingCycle };
  }
  const claim = await ctx.prisma.$transaction(async (transaction: any) => transaction.paymentSession.updateMany({
    where: { id: localSession.id, OR: [{ status: { not: "processing" } }, { provisioningLockedUntil: null }, { provisioningLockedUntil: { lt: new Date() } }] },
    data: { status: "processing", provisioningLockedUntil: new Date(Date.now() + 5 * 60 * 1000) },
  }));
  if (!claim.count) throw new Error("Membership provisioning is already in progress; retry shortly.");

  const checkoutSubscription = session.subscription as Stripe.Subscription | null;
  const customer = session.customer as Stripe.Customer | Stripe.DeletedCustomer | string | null;
  if (!checkoutSubscription?.id) throw new Error("Stripe subscription was not created.");
  // Checkout and subscription webhooks can be delivered out of order. Always
  // provision from current provider truth rather than an expanded checkout
  // snapshot that may predate a cancellation, pause, or tier change.
  const subscription = await adapter.retrieveSubscription(checkoutSubscription.id);
  if (subscription.id !== checkoutSubscription.id) {
    throw new Error("Payment provider returned a different checkout subscription.");
  }

  const users = await ctx.query.User.findMany({
    where: { AND: [{ id: { equals: session.metadata.userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id name email phone stripeCustomerId organization { id } membership { id stripeSubscriptionId status }",
  });
  const user = users[0] as any;
  if (!user) throw new Error("User not found for checkout session.");
  if (!user.organization?.id || organizationId !== user.organization.id) {
    throw new Error("Checkout provider and user belong to different organizations.");
  }
  const tiers = await ctx.query.MembershipTier.findMany({
    where: { AND: [{ id: { equals: session.metadata.tierId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id name classCreditsPerMonth organization { id }",
  });
  const tier = tiers[0] as any;
  if (!tier) throw new Error("Membership tier not found.");
  if (tier.organization?.id !== user.organization.id) throw new Error("Membership tier is not in the user's organization.");

  const customerId = typeof customer === "string" ? customer : customer?.id;
  const memberId = await ensureMemberProfile(context, user as any, tier.id);
  if (!user.stripeCustomerId && customerId) {
    await ctx.query.User.updateOne({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
      query: "id",
    });
  }

  const billingCycle: BillingCycle = session.metadata.billingCycle === "annual" ? "annual" : "monthly";
  const nextBillingDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const startDate = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : new Date().toISOString();

  let membershipId = (user as any).membership?.id as string | undefined;
  const membershipStatus = mapStripeStatusToMembership(
    subscription.status,
    Boolean(subscription.pause_collection),
  );
  const membershipData = {
    tier: { connect: { id: tier.id } },
    status: membershipStatus,
    billingCycle,
    startDate,
    nextBillingDate,
    autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
    classCreditsRemaining: membershipStatus === "active" ? tier.classCreditsPerMonth : 0,
    stripeSubscriptionId: subscription.id,
    cancelledAt: membershipStatus === "cancelled" ? new Date().toISOString() : null,
    ...(membershipStatus === "cancelled" ? {} : { cancelReason: "" }),
  };
  if (membershipId) {
    await ctx.query.Membership.updateOne({
      where: { id: membershipId },
      data: membershipData,
      query: "id",
    });
  } else {
    const membership = await ctx.query.Membership.createOne({
      data: {
        organization: { connect: { id: user.organization.id } },
        member: { connect: { id: user.id } },
        ...membershipData,
      },
      query: "id",
    });
    membershipId = (membership as any).id;
  }

  const subscriptions = await ctx.query.Subscription.findMany({
    where: { AND: [{ stripeSubscriptionId: { equals: subscription.id } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id",
  });
  const subscriptionData = {
    member: { connect: { id: memberId } },
    membershipTier: { connect: { id: tier.id } },
    status: mapSubscriptionStatus(subscription.status, Boolean(subscription.pause_collection)),
    startDate,
    nextBillingDate,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId ?? user.stripeCustomerId,
  };
  if (subscriptions[0]) {
    await ctx.query.Subscription.updateOne({
      where: { id: (subscriptions[0] as any).id },
      data: subscriptionData,
      query: "id",
    });
  } else {
    await ctx.query.Subscription.createOne({
      data: {
        organization: { connect: { id: user.organization.id } },
        ...subscriptionData,
      },
      query: "id",
    });
  }

  if (localSession.status !== "completed") {
    await ctx.query.PaymentSession.updateOne({
      where: { id: localSession.id },
      data: {
        status: "completed",
        provisioningLockedUntil: null,
        completedAt: new Date().toISOString(),
        providerSessionId: session.id,
        providerCustomerId: customerId,
        providerSubscriptionId: subscription.id,
        data: {
          providerSubscriptionId: subscription.id,
          paymentStatus: session.payment_status,
        },
      },
      query: "id",
    });
  }

  return {
    membershipId,
    paymentProviderId: provider.id,
    paymentSessionId: localSession.id,
    subscriptionId: subscription.id,
    tierName: tier.name,
    billingCycle,
  };
}
