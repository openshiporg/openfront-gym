import type { Context } from ".keystone/types";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import {
  claimMembershipBillingAttempt,
  failMembershipBillingAttempt,
  finishMembershipBillingAttempt,
  isCompletedMembershipBillingAttempt,
  membershipBillingRequestHash,
  type MembershipBillingOperation,
} from "./membershipBillingAttempts";

const PROVIDER_CODE = "pp_stripe";

function actorOrganizationId(context: Context) {
  const organizationId = (context.session as any)?.data?.organization?.id;
  if (typeof organizationId !== "string" || !organizationId) throw new Error("Organization context required");
  return organizationId;
}

function assertUserSessionAccess(context: Context, userId: string) {
  const session = context.session as any;
  if (!session?.itemId) throw new Error("Authentication required");
  if (session.itemId === userId || session.data?.role?.canManageAllRecords) return;
  throw new Error("You cannot manage another member's billing");
}

async function getAuthorizedMembership(context: Context, membershipId: string) {
  const organizationId = actorOrganizationId(context);
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id organization { id defaultCurrency } stripeSubscriptionId billingCycle status autoRenew nextBillingDate member { id stripeCustomerId organization { id } } tier { id freezeAllowed organization { id } }",
  });
  const membership = memberships[0] as any;
  if (!membership || membership.organization?.id !== organizationId || membership.member?.organization?.id !== organizationId) {
    throw new Error("Membership not found");
  }
  assertUserSessionAccess(context, membership.member?.id);
  return membership;
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
  const organizationId = actorOrganizationId(context);
  assertUserSessionAccess(context, userId);
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
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
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
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const endsAt = new Date(endDate);
  if (Number.isNaN(endsAt.getTime())) throw new Error("Freeze end date must be in the future");
  const scope = billingAttemptScope(organizationId, membershipId, "freeze", idempotencyKey, { endDate: endsAt.toISOString() });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  }
  if (membership.status !== "active") throw new Error("Only active memberships can be frozen");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot be frozen");
  if (!membership.tier?.freezeAllowed) throw new Error("This membership tier does not allow freezes");
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
  try {
    const { adapter } = await getAdapter(context, organizationId);
    await adapter.pauseSubscription(membership.stripeSubscriptionId, endsAt, attempt.providerIdempotencyKey);
    await finishMembershipBillingAttempt(context, attempt, { status: "frozen", freezeStartDate: startsAt, freezeEndDate: endsAt });
    return { membership: await currentMembership(context, membershipId), message: "Membership frozen immediately" };
  } catch (error) { await failMembershipBillingAttempt(context, attempt, error); throw error; }
}

export async function unfreezeMembership(
  root: unknown,
  { membershipId, idempotencyKey }: { membershipId: string; idempotencyKey: string },
  context: Context
) {
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
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
  if (!(context.session as any)?.data?.role?.canManageAllRecords) {
    throw new Error("Contact the front desk to change membership tiers");
  }
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const scope = billingAttemptScope(organizationId, membershipId, "tier-change", idempotencyKey, { newTierId });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Cannot change a ${membership.status} membership`);
  if (membership.tier?.id === newTierId) throw new Error("Membership is already on this tier");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot change tiers");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const newTiers = await context.sudo().query.MembershipTier.findMany({ where: { AND: [{ id: { equals: newTierId } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id classCreditsPerMonth monthlyPrice annualPrice stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }" });
  const newTier = newTiers[0] as any;
  if (!newTier) throw new Error("New membership tier not found");
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) throw new Error("Stripe price not configured for this tier");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    const planAmount = membership.billingCycle === "monthly" ? newTier.monthlyPrice : newTier.annualPrice;
    if (!Number.isFinite(planAmount) || planAmount < 0) throw new Error("Membership tier has an invalid price");
    await adapter.validateMembershipPrice({
      priceId: newPriceId,
      productId: newTier.stripeProductId,
      amount: Math.round(planAmount * 100),
      currencyCode: membership.organization.defaultCurrency || "USD",
      billingCycle: membership.billingCycle === "annual" ? "annual" : "monthly",
    });
    await adapter.changeSubscriptionPrice(
      membership.stripeSubscriptionId,
      newPriceId,
      { tierId: newTierId, billingCycle: membership.billingCycle },
      attempt.providerIdempotencyKey,
    );
    await finishMembershipBillingAttempt(context, attempt, { tierId: newTierId, classCreditsRemaining: newTier.classCreditsPerMonth });
    await context.prisma.member.updateMany({
      where: { organizationId, userId: membership.member.id },
      data: { membershipTierId: newTierId },
    });
    return { membership: await currentMembership(context, membershipId), message: "Membership tier updated successfully" };
  } catch (error) { await failMembershipBillingAttempt(context, attempt, error); throw error; }
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
  const session = context.session as any;
  if (!session?.itemId || !session.data?.role?.canManageAllRecords) {
    throw new Error("Payment recovery management permission required");
  }
  const organizationId = actorOrganizationId(context);
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id cancelReason organization { id }",
  });
  const membership = memberships[0] as any;
  if (!membership) throw new Error("Membership not found");
  const note = `[Recovery contacted ${new Date().toISOString()}]`;
  return context.sudo().db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      cancelReason: membership.cancelReason ? `${membership.cancelReason}\n${note}` : note,
    },
  });
}

export async function getStripeBillingPortal(
  root: unknown,
  { userId, returnUrl }: { userId: string; returnUrl: string },
  context: Context
) {
  const organizationId = actorOrganizationId(context);
  assertUserSessionAccess(context, userId);
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
