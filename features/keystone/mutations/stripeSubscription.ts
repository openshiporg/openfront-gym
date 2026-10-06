import type { Context } from ".keystone/types";
import { currentRoleActor } from "../access/currentRoleActor";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import {
  claimMembershipBillingAttempt,
  failMembershipBillingAttempt,
  finishMembershipBillingAttempt,
  isCompletedMembershipBillingAttempt,
  membershipBillingRequestHash,
  type MembershipBillingOperation,
} from "./membershipBillingAttempts";

import { membershipTierChangeCurrency, snapshotMembershipAgreement, tierAmountMinor } from "../../integrations/payment/commercial-agreement";

const PROVIDER_CODE = "pp_stripe";

type CurrentRoleActor = Awaited<ReturnType<typeof currentRoleActor>>;

function assertUserSessionAccess(actor: CurrentRoleActor, userId: string) {
  if (actor.userId === userId || actor.canManageAllRecords) return;
  throw new Error("You cannot manage another member's billing");
}

async function getAuthorizedMembership(context: Context, membershipId: string, currentActor?: CurrentRoleActor) {
  const actor = currentActor ?? await currentRoleActor(context);
  const organizationId = actor.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id agreementSnapshot agreementHistory organization { id defaultCurrency } stripeSubscriptionId billingCycle status autoRenew nextBillingDate member { id stripeCustomerId organization { id } } tier { id freezeAllowed organization { id } }",
  });
  const membership = memberships[0] as any;
  if (!membership || membership.organization?.id !== organizationId || membership.member?.organization?.id !== organizationId) {
    throw new Error("Membership not found");
  }
  assertUserSessionAccess(actor, membership.member?.id);
  return { membership, actor };
}

async function getAdapter(context: Context, organizationId: string) {
  return getAdapterForProvider(context, PROVIDER_CODE, organizationId);
}

function billingAttemptScope(
  organizationId: string,
  membershipId: string,
  operation: MembershipBillingOperation,
  idempotencyKey: string,
  evidence: Record<string, unknown>,
) {
  return {
    organizationId,
    membershipId,
    operation,
    idempotencyKey,
    requestHash: membershipBillingRequestHash(operation, evidence),
  };
}

async function currentMembership(context: Context, membershipId: string) {
  return context.db.Membership.findOne({ where: { id: membershipId } });
}

export async function createStripeSetupIntent(
  root: unknown,
  { userId }: { userId: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  assertUserSessionAccess(actor, userId);
  const organizationId = actor.organizationId;
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }",
  });
  const user = users[0] as any;
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");

  const { adapter } = await getAdapter(context, organizationId);
  const intent = await adapter.createSetupIntent(user.stripeCustomerId);
  if (!intent.clientSecret) throw new Error("Payment provider did not return a setup client secret");
  return { clientSecret: intent.clientSecret, setupIntentId: intent.id };
}

export async function cancelMembership(
  root: unknown,
  { membershipId, reason, idempotencyKey }: { membershipId: string; reason?: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer");
  const scope = billingAttemptScope(organizationId, membershipId, "cancel", idempotencyKey, { reason: normalizedReason });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership renewal cancellation already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Membership is already ${membership.status}`);
  if (!membership.autoRenew) throw new Error("Membership renewal is already cancelled");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership cancellation already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    const providerSubscription = await adapter.cancelSubscriptionAtPeriodEnd(
      membership.stripeSubscriptionId,
      attempt.providerIdempotencyKey,
    );
    const providerPeriodEnd = providerSubscription.current_period_end
      ? new Date(providerSubscription.current_period_end * 1000)
      : membership.nextBillingDate ? new Date(membership.nextBillingDate) : null;
    await finishMembershipBillingAttempt(context, attempt, {
      autoRenew: false,
      nextBillingDate: providerPeriodEnd,
      cancelReason: normalizedReason,
      cancelledAt: null,
    });
    return { membership: await currentMembership(context, membershipId), message: "Membership renewal cancelled at the end of the paid period" };
  } catch (error) { await failMembershipBillingAttempt(context, attempt, error); throw error; }
}

export async function freezeMembership(
  root: unknown,
  { membershipId, endDate, idempotencyKey }: { membershipId: string; endDate: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const endsAt = new Date(endDate);
  if (Number.isNaN(endsAt.getTime())) throw new Error("Freeze end date must be in the future");
  const scope = billingAttemptScope(organizationId, membershipId, "freeze", idempotencyKey, { endDate: endsAt.toISOString() });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  }
  if (membership.status !== "active") throw new Error("Only active memberships can be frozen");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot be frozen");
  if (!(membership.agreementSnapshot?.freezeAllowed ?? membership.tier?.freezeAllowed)) throw new Error("This membership tier does not allow freezes");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const startsAt = new Date();
  const maximumEnd = new Date(startsAt.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (endsAt <= startsAt) throw new Error("Freeze end date must be in the future");
  if (endsAt > maximumEnd) throw new Error("Freeze duration cannot exceed one year");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  let adapter: Awaited<ReturnType<typeof getAdapter>>["adapter"];
  try {
    ({ adapter } = await getAdapter(context, organizationId));
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
  // Once provider execution begins, a transport error is ambiguous: the remote
  // pause may have succeeded even if its response was lost. Preserve the pending
  // freeze fence and require same-key recovery after the lease.
  try {
    await adapter.pauseSubscription(membership.stripeSubscriptionId, endsAt, attempt.providerIdempotencyKey);
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, "unknown");
    throw error;
  }
  await finishMembershipBillingAttempt(context, attempt, { status: "frozen", freezeStartDate: startsAt, freezeEndDate: endsAt });
  return { membership: await currentMembership(context, membershipId), message: "Membership frozen immediately" };
}

export async function unfreezeMembership(
  root: unknown,
  { membershipId, idempotencyKey }: { membershipId: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const scope = billingAttemptScope(organizationId, membershipId, "unfreeze", idempotencyKey, {});
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  }
  if (membership.status !== "frozen") throw new Error("Only frozen memberships can be resumed");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    await adapter.resumeSubscription(membership.stripeSubscriptionId, attempt.providerIdempotencyKey);
    await finishMembershipBillingAttempt(context, attempt, { status: "active", freezeStartDate: null, freezeEndDate: null });
    return { membership: await currentMembership(context, membershipId), message: "Membership resumed successfully" };
  } catch (error) { await failMembershipBillingAttempt(context, attempt, error); throw error; }
}

export async function changeMembershipTier(
  root: unknown,
  { membershipId, newTierId, idempotencyKey }: { membershipId: string; newTierId: string; idempotencyKey: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Contact the front desk to change membership tiers");
  const { membership, actor: authorizedActor } = await getAuthorizedMembership(context, membershipId, actor);
  const organizationId = authorizedActor.organizationId;
  const scope = billingAttemptScope(organizationId, membershipId, "tier-change", idempotencyKey, { newTierId });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Cannot change a ${membership.status} membership`);
  if (membership.tier?.id === newTierId) throw new Error("Membership is already on this tier");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot change tiers");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const settingsRows = await context.sudo().query.GymSettings.findMany({
    where: { organization: { id: { equals: organizationId } } },
    take: 2,
    query: "currencyCode",
  });
  if (settingsRows.length > 1) throw new Error("Gym currency settings are ambiguous; reconcile them before changing tiers.");
  const contractCurrency = membershipTierChangeCurrency(
    membership.agreementSnapshot,
    membership.organization.defaultCurrency,
    settingsRows[0]?.currencyCode,
  );
  const newTiers = await context.sudo().query.MembershipTier.findMany({ where: { AND: [{ id: { equals: newTierId } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id name classCreditsPerMonth monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor freezeAllowed contractLength accessHours accessHoursJson guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }" });
  const newTier = newTiers[0] as any;
  if (!newTier) throw new Error("New membership tier not found");
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) throw new Error("Stripe price not configured for this tier");
  const planAmount = membership.billingCycle === "monthly" ? newTier.monthlyPrice : newTier.annualPrice;
  if (!Number.isFinite(planAmount) || planAmount < 0) throw new Error("Membership tier has an invalid price");
  // Preserve a new checkout's first-paid ledger policy across pre-payment tier changes;
  // legacy agreements remain unmarked and keep their scalar-balance reconciliation.
  const newAgreementSnapshot = snapshotMembershipAgreement(newTier, membership.billingCycle, contractCurrency, {
    initialCreditLedger: membership.agreementSnapshot?.creditLedgerPolicy === "monthly-grant-v1",
  });
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    await adapter.validateMembershipPrice({
      priceId: newPriceId,
      productId: newTier.stripeProductId,
      amount: tierAmountMinor(newTier, membership.billingCycle),
      currencyCode: contractCurrency,
      billingCycle: membership.billingCycle === "annual" ? "annual" : "monthly",
    });
    providerExecutionStarted = true;
    await adapter.changeSubscriptionPrice(
      membership.stripeSubscriptionId,
      newPriceId,
      { tierId: newTierId, billingCycle: membership.billingCycle },
      attempt.providerIdempotencyKey,
    );
    await finishMembershipBillingAttempt(context, attempt, {
      tierId: newTierId,
      agreementSnapshot: newAgreementSnapshot,
      agreementHistory: [...(Array.isArray(membership.agreementHistory) ? membership.agreementHistory : []), membership.agreementSnapshot],
    }, async (transaction: any) => {
      const memberUpdate = await transaction.member.updateMany({
        where: { organizationId, userId: membership.member.id },
        data: { membershipTierId: newTierId },
      });
      if (memberUpdate.count !== 1) throw new Error("Membership owner projection changed while finalizing the tier change");
    });
    return { membership: await currentMembership(context, membershipId), message: "Membership tier updated; included class allowance applies from the next service month" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}

function validateReturnUrl(returnUrl: string) {
  const configuredBaseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configuredBaseUrl) throw new Error("Application base URL is not configured");

  const requested = new URL(returnUrl, configuredBaseUrl);
  const allowed = new URL(configuredBaseUrl);
  if (requested.origin !== allowed.origin) throw new Error("Billing portal return URL must use the Gym origin");
  return requested.toString();
}

export async function markPaymentRecoveryContacted(
  root: unknown,
  { membershipId }: { membershipId: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Payment recovery management permission required");
  const organizationId = actor.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id recoveryHistory organization { id }",
  });
  const membership = memberships[0] as any;
  if (!membership) throw new Error("Membership not found");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (tx: any) => {
    const lockResult = await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`membership-recovery:${organizationId}:${membershipId}`}, 0))`;
    if (lockResult instanceof Error) throw lockResult;
    const current = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!current) throw new Error("Membership not found");
    return tx.membership.update({ where: { id: membershipId }, data: {
      recoveryHistory: [...(Array.isArray(current.recoveryHistory) ? current.recoveryHistory : []), { contactedAt: new Date().toISOString(), actorId: actor.userId }],
    } });
  });
}

export async function getStripeBillingPortal(
  root: unknown,
  { userId, returnUrl }: { userId: string; returnUrl: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  assertUserSessionAccess(actor, userId);
  const organizationId = actor.organizationId;
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }",
  });
  const user = users[0] as any;
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");

  const safeReturnUrl = validateReturnUrl(returnUrl);
  const { adapter } = await getAdapter(context, organizationId);
  return adapter.createBillingPortalSession(user.stripeCustomerId, safeReturnUrl);
}
