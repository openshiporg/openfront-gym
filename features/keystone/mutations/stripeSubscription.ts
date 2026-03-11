import type { Context } from ".keystone/types";
import {
  createCustomer,
  createSubscription,
  createSetupIntent,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
  createBillingPortalSession,
} from "../utils/stripe";

// Create a new membership with Stripe subscription
export async function createMembershipWithStripe(
  root: any,
  {
    email,
    name,
    password,
    tierId,
    billingCycle,
    paymentMethodId,
  }: {
    email: string;
    name: string;
    password: string;
    tierId: string;
    billingCycle: "monthly" | "annual";
    paymentMethodId?: string;
  },
  context: Context
) {
  const { db } = context.sudo();

  // Get the membership tier
  const tier = await db.MembershipTier.findOne({
    where: { id: tierId },
  });

  if (!tier) {
    throw new Error("Membership tier not found");
  }

  // Get the appropriate Stripe price ID based on billing cycle
  const stripePriceId = billingCycle === "monthly"
    ? tier.stripeMonthlyPriceId
    : tier.stripeAnnualPriceId;

  if (!stripePriceId) {
    throw new Error(`Stripe price not configured for ${billingCycle} billing`);
  }

  // Create Stripe customer
  const stripeCustomer = await createCustomer({ email, name });

  // Create the user
  const user = await db.User.createOne({
    data: {
      name,
      email,
      password,
      stripeCustomerId: stripeCustomer.id,
    },
  });

  // Create Stripe subscription
  const subscription = await createSubscription({
    customerId: stripeCustomer.id,
    priceId: stripePriceId,
    paymentMethodId,
  });

  // Calculate next billing date
  const nextBillingDate = new Date();
  if (billingCycle === "monthly") {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  } else {
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  }

  // Create the membership
  const membership = await db.Membership.createOne({
    data: {
      member: { connect: { id: user.id } },
      tier: { connect: { id: tierId } },
      status: subscription.status === "active" ? "active" : "past-due",
      startDate: new Date().toISOString(),
      billingCycle,
      nextBillingDate: nextBillingDate.toISOString(),
      autoRenew: true,
      classCreditsRemaining: tier.classCreditsPerMonth,
      stripeSubscriptionId: subscription.id,
    },
  });

  // Get the client secret for completing payment
  const latestInvoice = subscription.latest_invoice as any;
  const paymentIntent = latestInvoice?.payment_intent;
  const clientSecret = paymentIntent?.client_secret;

  return {
    membership,
    user,
    subscriptionId: subscription.id,
    clientSecret,
    subscriptionStatus: subscription.status,
  };
}

// Create a setup intent for adding a payment method
export async function createStripeSetupIntent(
  root: any,
  { userId }: { userId: string },
  context: Context
) {
  const { db } = context.sudo();

  const user = await db.User.findOne({
    where: { id: userId },
  });

  if (!user || !user.stripeCustomerId) {
    throw new Error("User not found or not a Stripe customer");
  }

  const setupIntent = await createSetupIntent(user.stripeCustomerId);

  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
  };
}

// Cancel a membership subscription
export async function cancelMembership(
  root: any,
  { membershipId, reason }: { membershipId: string; reason?: string },
  context: Context
) {
  const { db } = context.sudo();

  const membership = await db.Membership.findOne({
    where: { id: membershipId },
  });

  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }

  // Cancel in Stripe
  const cancelledSubscription = await cancelSubscription(membership.stripeSubscriptionId);

  // Update membership status
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "cancelled",
      autoRenew: false,
      cancelReason: reason,
    },
  });

  return {
    membership: updatedMembership,
    message: "Membership cancelled successfully",
  };
}

// Freeze/pause a membership
export async function freezeMembership(
  root: any,
  {
    membershipId,
    startDate,
    endDate,
  }: {
    membershipId: string;
    startDate: string;
    endDate: string;
  },
  context: Context
) {
  const { db } = context.sudo();

  const membership = await db.Membership.findOne({
    where: { id: membershipId },
  });

  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }

  // Pause in Stripe
  await pauseSubscription(
    membership.stripeSubscriptionId,
    new Date(endDate)
  );

  // Update membership
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "frozen",
      freezeStartDate: startDate,
      freezeEndDate: endDate,
    },
  });

  return {
    membership: updatedMembership,
    message: "Membership frozen successfully",
  };
}

// Unfreeze/resume a membership
export async function unfreezeMembership(
  root: any,
  { membershipId }: { membershipId: string },
  context: Context
) {
  const { db } = context.sudo();

  const membership = await db.Membership.findOne({
    where: { id: membershipId },
  });

  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }

  // Resume in Stripe
  await resumeSubscription(membership.stripeSubscriptionId);

  // Update membership
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      status: "active",
      freezeStartDate: null,
      freezeEndDate: null,
    },
  });

  return {
    membership: updatedMembership,
    message: "Membership resumed successfully",
  };
}

// Upgrade or downgrade membership tier
export async function changeMembershipTier(
  root: any,
  {
    membershipId,
    newTierId,
  }: {
    membershipId: string;
    newTierId: string;
  },
  context: Context
) {
  const { db } = context.sudo();

  const membership = await db.Membership.findOne({
    where: { id: membershipId },
  });

  if (!membership || !membership.stripeSubscriptionId) {
    throw new Error("Membership not found or has no active subscription");
  }

  const newTier = await db.MembershipTier.findOne({
    where: { id: newTierId },
  });

  if (!newTier) {
    throw new Error("New membership tier not found");
  }

  // Get the appropriate price ID
  const newPriceId = membership.billingCycle === "monthly"
    ? newTier.stripeMonthlyPriceId
    : newTier.stripeAnnualPriceId;

  if (!newPriceId) {
    throw new Error("Stripe price not configured for this tier");
  }

  // Update in Stripe
  await updateSubscription({
    subscriptionId: membership.stripeSubscriptionId,
    newPriceId,
  });

  // Update membership
  const updatedMembership = await db.Membership.updateOne({
    where: { id: membershipId },
    data: {
      tier: { connect: { id: newTierId } },
      classCreditsRemaining: newTier.classCreditsPerMonth,
    },
  });

  return {
    membership: updatedMembership,
    message: "Membership tier updated successfully",
  };
}

// Get Stripe billing portal URL
export async function getStripeBillingPortal(
  root: any,
  { userId, returnUrl }: { userId: string; returnUrl: string },
  context: Context
) {
  const { db } = context.sudo();

  const user = await db.User.findOne({
    where: { id: userId },
  });

  if (!user || !user.stripeCustomerId) {
    throw new Error("User not found or not a Stripe customer");
  }

  const session = await createBillingPortalSession(user.stripeCustomerId, returnUrl);

  return {
    url: session.url,
  };
}
