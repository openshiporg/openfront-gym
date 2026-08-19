import type { Context } from ".keystone/types";
import type { BillingCycle } from "./types";
import { createMembershipCheckoutIdempotencyKey } from "./lifecycle";
import { getAdapterForProvider } from "../../keystone/utils/paymentProviderAdapter";

const PROVIDER_CODE = "pp_stripe";
const REUSABLE_SESSION_STATUSES = new Set(["pending", "requires_action"]);

function tierPriceId(tier: any, billingCycle: BillingCycle) {
  const configured = billingCycle === "annual" ? tier.stripeAnnualPriceId : tier.stripeMonthlyPriceId;
  if (configured) return configured;
  if (process.env.PAYMENT_TEST_MODE === "true") return `test_price_${tier.id}_${billingCycle}`;
  throw new Error(`Payment provider price is not configured for the ${billingCycle} plan on ${tier.name}.`);
}

function tierAmount(tier: any, billingCycle: BillingCycle) {
  const amount = billingCycle === "annual" ? tier.annualPrice : tier.monthlyPrice;
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Membership tier has an invalid price.");
  return Math.round(amount * 100);
}

async function ensureMemberProfile(context: Context, user: any) {
  const ctx = context.sudo();
  const existing = await ctx.query.Member.findMany({
    where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization.id } } }] },
    take: 1,
    query: "id status",
  });
  if (existing[0]) {
    if ((existing[0] as any).status !== "active") {
      throw new Error("Member profile must be active before membership checkout.");
    }
    return (existing[0] as any).id as string;
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
    },
    query: "id",
  });
  return (created as any).id as string;
}

export async function initiateMembershipCheckoutForUser(input: {
  context: Context;
  userId: string;
  tierId: string;
  billingCycle: BillingCycle;
  baseUrl: string;
}) {
  const ctx = input.context.sudo();
  const user = await ctx.query.User.findOne({
    where: { id: input.userId },
    query: "id name email phone stripeCustomerId organization { id }",
  });
  if (!user) throw new Error("User account not found.");
  const tier = await ctx.query.MembershipTier.findOne({
    where: { id: input.tierId },
    query: "id name monthlyPrice annualPrice stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }",
  });
  if (!tier) throw new Error("Membership tier not found.");
  if (!user.organization?.id) throw new Error("User account is not assigned to an organization.");
  if (tier.organization?.id !== user.organization.id) throw new Error("Membership tier is not in the user's organization.");

  const [currentMemberships, legacySubscriptions] = await Promise.all([
    ctx.query.Membership.findMany({
      where: {
        AND: [
          { member: { id: { equals: user.id } } },
          { organization: { id: { equals: user.organization.id } } },
          { status: { in: ["active", "frozen", "past-due"] } },
        ],
      },
      take: 1,
      query: "id status",
    }),
    ctx.query.Subscription.findMany({
      where: {
        AND: [
          { member: { user: { id: { equals: user.id } } } },
          { organization: { id: { equals: user.organization.id } } },
          { status: { in: ["active", "past_due", "paused"] } },
        ],
      },
      take: 1,
      query: "id status",
    }),
  ]);
  if (currentMemberships[0] || legacySubscriptions[0]) {
    throw new Error("This account already has a current membership. Contact the front desk for plan changes.");
  }

  const settings = await ctx.query.GymSettings.findMany({
    where: { organization: { id: { equals: user.organization.id } } },
    take: 1,
    query: "id currencyCode",
  });
  const currencyCode = String((settings[0] as any)?.currencyCode || "USD").toUpperCase();
  if (currencyCode !== "USD") {
    throw new Error("This initial launch supports Stripe membership checkout in USD only.");
  }

  const { provider, adapter } = await getAdapterForProvider(input.context, PROVIDER_CODE, user.organization.id);
  const amount = tierAmount(tier, input.billingCycle);
  const priceId = tierPriceId(tier, input.billingCycle);
  await adapter.validateMembershipPrice({
    priceId,
    productId: tier.stripeProductId,
    amount,
    currencyCode,
    billingCycle: input.billingCycle,
  });

  const idempotencyKey = createMembershipCheckoutIdempotencyKey({
    userId: user.id,
    tierId: tier.id,
    billingCycle: input.billingCycle,
  });
  const existing = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ idempotencyKey: { equals: idempotencyKey } }, { organization: { id: { equals: user.organization.id } } }] },
    take: 1,
    query: "id status checkoutUrl expiresAt billingCycle amount currencyCode data provisioningLockedUntil membershipTier { id }",
  });
  const existingSession = existing[0] as any;
  const existingMatchesRequest =
    existingSession?.membershipTier?.id === tier.id &&
    existingSession?.billingCycle === input.billingCycle &&
    existingSession?.amount === amount &&
    existingSession?.currencyCode === currencyCode &&
    existingSession?.data?.priceId === priceId &&
    existingSession?.data?.productId === tier.stripeProductId;
  const checkoutLeaseIsActive =
    existingSession?.status === "processing" &&
    existingSession?.provisioningLockedUntil &&
    new Date(existingSession.provisioningLockedUntil).getTime() > Date.now();
  if (checkoutLeaseIsActive) {
    throw new Error("Membership checkout is already being prepared for this account.");
  }
  const existingIsLive =
    existingSession &&
    REUSABLE_SESSION_STATUSES.has(existingSession.status) &&
    (!existingSession.expiresAt || new Date(existingSession.expiresAt).getTime() > Date.now());
  if (existingIsLive && !existingMatchesRequest) {
    throw new Error("A different membership checkout is already in progress for this account.");
  }
  if (existingIsLive && existingSession.checkoutUrl) {
    return {
      id: existingSession.id,
      status: existingSession.status,
      checkoutUrl: existingSession.checkoutUrl,
      reused: true,
    };
  }

  if (existingSession?.expiresAt && new Date(existingSession.expiresAt).getTime() <= Date.now()) {
    await ctx.query.PaymentSession.updateOne({
      where: { id: existingSession.id },
      data: { status: "expired" },
      query: "id",
    });
  }

  // A valid provider mapping is required before the checkout workflow creates
  // the customer's member profile. Misconfigured plans therefore have no
  // partially-created customer side effect.
  await ensureMemberProfile(input.context, user);
  const previousAttempt = Number(existingSession?.data?.checkoutAttempt) || 0;
  const reuseProviderAttempt =
    existingMatchesRequest &&
    ["pending", "processing", "failed"].includes(existingSession?.status);
  const checkoutAttempt = reuseProviderAttempt
    ? Math.max(previousAttempt, 1)
    : previousAttempt + 1;
  const providerIdempotencyKey = `${idempotencyKey}:attempt:${checkoutAttempt}`;
  const checkoutLeaseUntil = new Date(Date.now() + 10 * 60 * 1000);
  if (existingSession) {
    const claim = await input.context.prisma.paymentSession.updateMany({
      where: {
        id: existingSession.id,
        OR: [
          { provisioningLockedUntil: null },
          { provisioningLockedUntil: { lt: new Date() } },
        ],
      },
      data: { status: "processing", provisioningLockedUntil: checkoutLeaseUntil },
    });
    if (!claim.count) throw new Error("Membership checkout is already being prepared for this account.");
  }
  const paymentSession = existingSession
    ? await ctx.query.PaymentSession.updateOne({
        where: { id: existingSession.id },
        data: {
          user: { connect: { id: user.id } },
          membershipTier: { connect: { id: tier.id } },
          paymentProvider: { connect: { id: provider.id } },
          status: "processing",
          provisioningLockedUntil: checkoutLeaseUntil.toISOString(),
          billingCycle: input.billingCycle,
          amount,
          currencyCode,
          providerSessionId: null,
          providerCustomerId: "",
          providerSubscriptionId: null,
          checkoutUrl: null,
          expiresAt: null,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          lastError: "",
          data: { checkoutAttempt, priceId, productId: tier.stripeProductId },
        },
        query: "id",
      })
    : await ctx.query.PaymentSession.createOne({
        data: {
          organization: { connect: { id: user.organization.id } },
          user: { connect: { id: user.id } },
          membershipTier: { connect: { id: tier.id } },
          paymentProvider: { connect: { id: provider.id } },
          status: "processing",
          provisioningLockedUntil: checkoutLeaseUntil.toISOString(),
          billingCycle: input.billingCycle,
          amount,
          currencyCode,
          idempotencyKey,
          data: { checkoutAttempt, priceId, productId: tier.stripeProductId },
        },
        query: "id",
      });

  try {
    const providerSession = await adapter.createMembershipCheckout({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      tierId: tier.id,
      billingCycle: input.billingCycle,
      amount,
      currencyCode,
      priceId,
      customerId: user.stripeCustomerId,
      successUrl: `${input.baseUrl}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${input.baseUrl}/join/cancelled?tier=${tier.id}`,
      idempotencyKey: providerIdempotencyKey,
    });

    if (!user.stripeCustomerId) {
      await ctx.query.User.updateOne({
        where: { id: user.id },
        data: { stripeCustomerId: providerSession.providerCustomerId },
        query: "id",
      });
    }
    await ctx.query.PaymentSession.updateOne({
      where: { id: (paymentSession as any).id },
      data: {
        status: "requires_action",
        providerSessionId: providerSession.providerSessionId,
        providerCustomerId: providerSession.providerCustomerId,
        checkoutUrl: providerSession.checkoutUrl,
        expiresAt: providerSession.expiresAt,
        provisioningLockedUntil: null,
      },
      query: "id",
    });
    return {
      id: (paymentSession as any).id,
      status: "requires_action",
      checkoutUrl: providerSession.checkoutUrl,
      reused: false,
    };
  } catch (error) {
    await ctx.query.PaymentSession.updateOne({
      where: { id: (paymentSession as any).id },
      data: {
        status: "failed",
        failedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "Payment provider checkout failed.",
        provisioningLockedUntil: null,
      },
      query: "id",
    });
    throw error;
  }
}
