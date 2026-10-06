import type { Context } from ".keystone/types";
import type { BillingCycle, MembershipCheckoutResult } from "./types";
import { snapshotMembershipAgreement, tierAmountMinor } from "./commercial-agreement";
import { createMembershipCheckoutIdempotencyKey } from "./lifecycle";
import { getAdapterForProvider } from "../../keystone/utils/paymentProviderAdapter";
import { guardKeystonePrismaResults, requirePrismaAffectedCount, throwOnKeystonePrismaError } from "../../keystone/lib/prisma-result";

const PROVIDER_CODE = "pp_stripe";
const REUSABLE_SESSION_STATUSES = new Set(["pending", "requires_action"]);
// Stripe may prune keys at 24h (docs.stripe.com/api/idempotent_requests); cap automatic retries at 12h.
const CHECKOUT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function assertSingleMerchantCheckout(providers: readonly any[], organizationId: string) {
  if (providers.length !== 1 || providers[0].organization?.id !== organizationId || providers[0].providerAccountId) {
    throw new Error("Online checkout requires exactly one installed Stripe merchant organization; connected-account checkout is not supported");
  }
}

function tierPriceId(tier: any, billingCycle: BillingCycle) {
  const configured = billingCycle === "annual" ? tier.stripeAnnualPriceId : tier.stripeMonthlyPriceId;
  if (configured) return configured;
  if (process.env.PAYMENT_TEST_MODE === "true") return `test_price_${tier.id}_${billingCycle}`;
  throw new Error(`Payment provider price is not configured for the ${billingCycle} plan on ${tier.name}.`);
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

  const created = throwOnKeystonePrismaError(await ctx.query.Member.createOne({
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
  }), "Member.createOne");
  if (typeof (created as any)?.id !== "string" || !(created as any).id) throw new Error("Member profile creation returned no identity");
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
    query: "id name monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor classCreditsPerMonth freezeAllowed contractLength accessHours accessHoursJson guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }",
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
  if (provider.adapterKey === "stripe" && process.env.PAYMENT_TEST_MODE !== "true") {
    const merchants = await ctx.query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: PROVIDER_CODE } }, { adapterKey: { equals: "stripe" } }, { isInstalled: { equals: true } }] },
      take: 2, query: "id providerAccountId organization { id }",
    });
    assertSingleMerchantCheckout(merchants, user.organization.id);
  }
  const amount = tierAmountMinor(tier, input.billingCycle);
  const agreementSnapshot = snapshotMembershipAgreement(tier, input.billingCycle, currencyCode, { initialCreditLedger: true });
  const priceId = tierPriceId(tier, input.billingCycle);
  const idempotencyKey = createMembershipCheckoutIdempotencyKey({
    userId: user.id,
    tierId: tier.id,
    billingCycle: input.billingCycle,
  });
  const existing = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization.id } } }] },
    orderBy: [{ createdAt: "desc" }],
    take: 1,
    query: "id idempotencyKey status checkoutUrl expiresAt providerSessionId createdAt billingCycle amount currencyCode data provisioningLockedUntil membershipTier { id }",
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
  const unresolvedCheckout = existingSession && ["processing", "failed"].includes(existingSession.status);
  if (unresolvedCheckout) {
    const createdAt = new Date(existingSession.createdAt).getTime();
    const age = Date.now() - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age > CHECKOUT_RECOVERY_MAX_AGE_MS) {
      throw new Error("This membership checkout is outside the safe automatic recovery window; reconcile its provider identity before retrying.");
    }
  }
  if (unresolvedCheckout && !existingMatchesRequest) {
    throw new Error("An unresolved checkout attempt is reserved for its original plan; retry that exact plan or reconcile it before starting another.");
  }
  if (Array.isArray(existingSession?.data?.providerIdentityConflicts) && existingSession.data.providerIdentityConflicts.length > 0) {
    throw new Error("Membership checkout has conflicting provider session identities; operator reconciliation is required before retry.");
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

  if (REUSABLE_SESSION_STATUSES.has(existingSession?.status) && existingSession?.expiresAt && new Date(existingSession.expiresAt).getTime() <= Date.now()) {
    const expired = throwOnKeystonePrismaError(await ctx.query.PaymentSession.updateOne({
      where: { id: existingSession.id },
      data: { status: "expired" },
      query: "id",
    }), "PaymentSession expiration");
    if (typeof (expired as any)?.id !== "string") throw new Error("Payment session expiration returned no identity");
  }

  // Retry and identity fences run before any provider call, including price reads.
  await adapter.validateMembershipPrice({
    priceId,
    productId: tier.stripeProductId,
    amount,
    currencyCode,
    billingCycle: input.billingCycle,
  });

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
  const providerIdempotencyKey = reuseProviderAttempt
    ? (/:attempt:\d+$/.test(existingSession.idempotencyKey) ? existingSession.idempotencyKey : `${existingSession.idempotencyKey}:attempt:${checkoutAttempt}`)
    : `${idempotencyKey}:attempt:${checkoutAttempt}`;
  const checkoutLeaseUntil = new Date(Date.now() + 10 * 60 * 1000);
  const prisma = guardKeystonePrismaResults(input.context.prisma as any);
  if (existingSession && reuseProviderAttempt) {
    const claim = await prisma.paymentSession.updateMany({
      where: {
        id: existingSession.id,
        OR: [
          { provisioningLockedUntil: null },
          { provisioningLockedUntil: { lt: new Date() } },
        ],
      },
      data: { status: "processing", provisioningLockedUntil: checkoutLeaseUntil },
    });
    requirePrismaAffectedCount(claim, 1, "Membership checkout claim");
  }
  const paymentSession = existingSession && reuseProviderAttempt
    ? throwOnKeystonePrismaError(await ctx.query.PaymentSession.updateOne({
        where: { id: existingSession.id },
        data: { status: "processing", failedAt: null, provisioningLockedUntil: checkoutLeaseUntil.toISOString(), lastError: "" },
        query: "id",
      }), "PaymentSession retry claim")
    : throwOnKeystonePrismaError(await ctx.query.PaymentSession.createOne({
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
          idempotencyKey: providerIdempotencyKey,
          data: { checkoutAttempt, priceId, productId: tier.stripeProductId, agreementSnapshot },
        },
        query: "id",
      }), "PaymentSession creation");
  if (typeof (paymentSession as any)?.id !== "string") throw new Error("Payment session creation returned no identity");

  let providerSession: MembershipCheckoutResult | null = null;
  let providerIdentityConflict: string | null = null;
  let canPersistProviderSession = false;
  try {
    providerSession = await adapter.createMembershipCheckout({
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
    if (
      typeof providerSession?.providerSessionId !== "string" || !providerSession.providerSessionId ||
      typeof providerSession.providerCustomerId !== "string" || !providerSession.providerCustomerId ||
      typeof providerSession.checkoutUrl !== "string" || !providerSession.checkoutUrl
    ) {
      throw new Error("Payment provider did not return a valid membership checkout identity.");
    }
    canPersistProviderSession = true;
    if (reuseProviderAttempt && existingSession?.providerSessionId && existingSession.providerSessionId !== providerSession.providerSessionId) {
      providerIdentityConflict = providerSession.providerSessionId;
      throw new Error("Payment provider returned a different checkout session for the reserved attempt; operator reconciliation is required.");
    }

    if (!user.stripeCustomerId) {
      const updatedUser = throwOnKeystonePrismaError(await ctx.query.User.updateOne({
        where: { id: user.id },
        data: { stripeCustomerId: providerSession.providerCustomerId },
        query: "id",
      }), "User Stripe customer update");
      if (typeof (updatedUser as any)?.id !== "string") throw new Error("Stripe customer update returned no identity");
    }
    const finalized = await prisma.paymentSession.updateMany({
      where: { id: (paymentSession as any).id, status: "processing" },
      data: {
        status: "requires_action",
        providerSessionId: providerSession.providerSessionId,
        providerCustomerId: providerSession.providerCustomerId,
        checkoutUrl: providerSession.checkoutUrl,
        expiresAt: providerSession.expiresAt ? new Date(providerSession.expiresAt) : null,
        provisioningLockedUntil: null,
      },
    });
    requirePrismaAffectedCount(finalized, 1, "Membership checkout finalization");
    return {
      id: (paymentSession as any).id,
      status: "requires_action",
      checkoutUrl: providerSession.checkoutUrl,
      reused: reuseProviderAttempt,
    };
  } catch (error) {
    const unresolved = await prisma.paymentSession.updateMany({
      where: { id: (paymentSession as any).id, status: "processing" },
      data: {
        status: "processing",
        failedAt: null,
        ...(canPersistProviderSession && providerSession && !providerIdentityConflict ? {
          providerSessionId: providerSession.providerSessionId,
          providerCustomerId: providerSession.providerCustomerId,
          checkoutUrl: providerSession.checkoutUrl,
          expiresAt: providerSession.expiresAt ? new Date(providerSession.expiresAt) : null,
        } : {}),
        ...(providerIdentityConflict ? {
          data: {
            ...(existingSession?.data && typeof existingSession.data === "object" ? existingSession.data : {}),
            providerIdentityConflicts: [...new Set([
              ...(Array.isArray(existingSession?.data?.providerIdentityConflicts) ? existingSession.data.providerIdentityConflicts.filter((id: unknown): id is string => typeof id === "string") : []),
              providerIdentityConflict,
            ])],
          },
        } : {}),
        lastError: error instanceof Error ? error.message : "Payment provider checkout outcome requires reconciliation.",
        provisioningLockedUntil: null,
      },
    });
    if (unresolved.count > 1) throw new Error("Membership checkout recovery fence affected multiple sessions");
    throw error;
  }
}
