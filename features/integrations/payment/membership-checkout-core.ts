import { installedPaymentProviderWhere } from "../../keystone/lib/stripe-environment-provider";
import type { Context } from ".keystone/types";
import type { BillingCycle, MembershipCheckoutResult } from "./types";
import { snapshotMembershipAgreement, tierAmountMinor } from "./commercial-agreement";
import { createMembershipCheckoutIdempotencyKey } from "./lifecycle";
import { getAdapterForProvider } from "../../keystone/utils/paymentProviderAdapter";
import { guardKeystonePrismaResults, requirePrismaAffectedCount, throwOnKeystonePrismaError } from "../../keystone/lib/prisma-result";
import { lockTransactionKey } from "../../keystone/mutations/classCapacity";
import { lockActiveOrganization } from "../../keystone/lib/current-actor";

const PROVIDER_CODE = "pp_stripe";
const REUSABLE_SESSION_STATUSES = new Set(["pending", "requires_action"]);
// Stripe may prune keys at 24h (docs.stripe.com/api/idempotent_requests); cap automatic retries at 12h.
const CHECKOUT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * A local expiry time can't tell an unpaid lapsed checkout from one paid just before expiry whose
 * callback hasn't arrived, so a lapsed checkout is closed only when the provider itself reports
 * the session expired (an expired Stripe session can never be paid). Read outside any lock.
 */
async function providerExpiredCheckouts(prisma: any, adapter: any, organizationId: string, userId: string) {
  const lapsed = await prisma.paymentSession.findMany({
    where: { organizationId, userId, status: { in: [...REUSABLE_SESSION_STATUSES] }, expiresAt: { lte: new Date() } },
    select: { id: true, providerSessionId: true }, take: 20,
  });
  const confirmed: Array<{ id: string; providerSessionId: string }> = [];
  for (const local of lapsed) {
    if (!local.providerSessionId) continue;
    const session = await adapter.retrieveMembershipCheckout(local.providerSessionId).catch(() => null);
    if (session?.id === local.providerSessionId && session.status === "expired") confirmed.push(local);
  }
  return confirmed;
}

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
      where: { AND: [{ code: { equals: PROVIDER_CODE } }, { adapterKey: { equals: "stripe" } }, installedPaymentProviderWhere()] },
      take: 2, query: "id providerAccountId organization { id }",
    });
    assertSingleMerchantCheckout(merchants, user.organization.id);
  }
  const amount = tierAmountMinor(tier, input.billingCycle);
  // Service starts only after a positive paid invoice; a zero-price plan is never sold online.
  if (amount <= 0) throw new Error("This plan has no price for that billing cycle, so it can't be bought online. Contact the club.");
  const priceId = tierPriceId(tier, input.billingCycle);
  const agreementSnapshot = snapshotMembershipAgreement(tier, input.billingCycle, currencyCode, {
    initialCreditLedger: true, providerPriceId: priceId, providerProductId: tier.stripeProductId || null,
  });
  const idempotencyKey = createMembershipCheckoutIdempotencyKey({
    userId: user.id,
    tierId: tier.id,
    billingCycle: input.billingCycle,
  });
  const organizationId = user.organization.id;
  const prisma = guardKeystonePrismaResults(input.context.prisma as any);
  const checkoutLeaseUntil = new Date(Date.now() + 10 * 60 * 1000);
  const matchesRequest = (session: any) =>
    session?.membershipTierId === tier.id &&
    session?.billingCycle === input.billingCycle &&
    session?.amount === amount &&
    session?.currencyCode === currencyCode &&
    session?.data?.priceId === priceId &&
    session?.data?.productId === tier.stripeProductId;

  const providerExpired = await providerExpiredCheckouts(prisma, adapter, user.organization.id, user.id);

  // One customer-wide checkout reservation. Current memberships and EVERY unresolved checkout
  // are re-read under the same lock provisioning and expiry use, before any provider call, so
  // two first checkouts for different plans or cycles can never both reach the provider. A
  // checkout past its local expiry keeps the reservation until the provider confirms it expired.
  const reservation = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${user.id}`);
    // A new membership charge is new activity: the club must be active, fenced until commit.
    await lockActiveOrganization(tx, organizationId);
    const [current, legacy] = await Promise.all([
      tx.membership.findFirst({ where: { organizationId, memberId: user.id, status: { in: ["active", "frozen", "past-due"] } }, select: { id: true } }),
      tx.subscription.findFirst({ where: { organizationId, member: { userId: user.id }, status: { in: ["active", "past_due", "paused"] } }, select: { id: true } }),
    ]);
    if (current || legacy) throw new Error("This account already has a current membership. Contact the front desk for plan changes.");
    const now = new Date();
    for (const expired of providerExpired) {
      await tx.paymentSession.updateMany({
        where: { id: expired.id, organizationId, userId: user.id, providerSessionId: expired.providerSessionId, status: { in: [...REUSABLE_SESSION_STATUSES] } },
        data: { status: "expired", provisioningLockedUntil: null },
      });
    }
    const open = await tx.paymentSession.findMany({
      where: { organizationId, userId: user.id, status: { in: ["pending", "processing", "requires_action", "failed"] } },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    });
    // Live checkouts, and processing or failed attempts that may have reached the provider,
    // stay reserved for their original plan (the latter within the recovery window).
    const unresolved = open;
    for (const session of unresolved) {
      if (REUSABLE_SESSION_STATUSES.has(session.status)) continue;
      const age = now.getTime() - new Date(session.createdAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age > CHECKOUT_RECOVERY_MAX_AGE_MS) {
        throw new Error("This membership checkout is outside the safe automatic recovery window; reconcile its provider identity before retrying.");
      }
    }
    const conflicting = unresolved.find((session: any) => !matchesRequest(session));
    if (conflicting) {
      const lapsed = conflicting.expiresAt && new Date(conflicting.expiresAt) <= now;
      throw new Error(lapsed
        ? "An earlier checkout for this account hasn't been confirmed as closed by the payment provider yet. Try again in a few minutes, or contact the club."
        : REUSABLE_SESSION_STATUSES.has(conflicting.status)
          ? "A different membership checkout is already in progress for this account."
          : "An unresolved checkout attempt is reserved for its original plan; retry that exact plan or reconcile it before starting another.");
    }
    const existingSession = unresolved[0] || null;
    if (Array.isArray(existingSession?.data?.providerIdentityConflicts) && existingSession.data.providerIdentityConflicts.length > 0) {
      throw new Error("Membership checkout has conflicting provider session identities; operator reconciliation is required before retry.");
    }
    if (existingSession?.status === "processing" && existingSession.provisioningLockedUntil && new Date(existingSession.provisioningLockedUntil) > now) {
      throw new Error("Membership checkout is already being prepared for this account.");
    }
    if (existingSession && REUSABLE_SESSION_STATUSES.has(existingSession.status) && existingSession.checkoutUrl) {
      return { reuse: existingSession as any };
    }
    if (existingSession) {
      const previousAttempt = Math.max(Number(existingSession.data?.checkoutAttempt) || 0, 1);
      const providerIdempotencyKey = /:attempt:\d+$/.test(existingSession.idempotencyKey) ? existingSession.idempotencyKey : `${existingSession.idempotencyKey}:attempt:${previousAttempt}`;
      const claimed = await tx.paymentSession.update({
        where: { id: existingSession.id },
        data: { status: "processing", failedAt: null, provisioningLockedUntil: checkoutLeaseUntil, lastError: "" },
      });
      return { session: claimed, existingSession, reuseProviderAttempt: true, providerIdempotencyKey };
    }
    const priorKeys = await tx.paymentSession.findMany({ where: { organizationId, idempotencyKey: { startsWith: idempotencyKey } }, select: { idempotencyKey: true }, take: 500 });
    const checkoutAttempt = priorKeys.reduce((max: number, row: any) => Math.max(max, Number(/:attempt:(\d+)$/.exec(row.idempotencyKey)?.[1] || 0)), 0) + 1;
    const providerIdempotencyKey = `${idempotencyKey}:attempt:${checkoutAttempt}`;
    const created = await tx.paymentSession.create({ data: {
      organizationId,
      userId: user.id,
      membershipTierId: tier.id,
      paymentProviderId: provider.id,
      status: "processing",
      provisioningLockedUntil: checkoutLeaseUntil,
      billingCycle: input.billingCycle,
      amount,
      currencyCode,
      idempotencyKey: providerIdempotencyKey,
      data: { checkoutAttempt, priceId, productId: tier.stripeProductId, agreementSnapshot },
    } });
    return { session: created, existingSession: null, reuseProviderAttempt: false, providerIdempotencyKey };
  });
  if ("reuse" in reservation) {
    return { id: reservation.reuse.id, status: reservation.reuse.status, checkoutUrl: reservation.reuse.checkoutUrl, reused: true };
  }
  const { existingSession, reuseProviderAttempt, providerIdempotencyKey } = reservation;
  const paymentSession = { id: reservation.session.id as string };

  try {
    // Provider reads and the customer's member profile follow the reservation fence.
    await adapter.validateMembershipPrice({
      priceId,
      productId: tier.stripeProductId,
      amount,
      currencyCode,
      billingCycle: input.billingCycle,
    });
    await ensureMemberProfile(input.context, user);
  } catch (error) {
    // Nothing was sent to the provider: release this reservation definitively.
    await prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "processing" },
      data: { status: reuseProviderAttempt ? "failed" : "cancelled", provisioningLockedUntil: null, lastError: error instanceof Error ? error.message.slice(0, 1000) : "Checkout could not be prepared" },
    });
    throw error;
  }

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
