"use server";

import { redirect } from "next/navigation";
import { keystoneContext } from "@/features/keystone/context";
import { stripe } from "@/features/keystone/utils/stripe";
import { getUser } from "@/features/storefront/lib/data/user";
import { getBaseUrl } from "@/features/dashboard/lib/getBaseUrl";

type BillingCycle = "monthly" | "annual";

type CheckoutResult =
  | { success: true; url: string }
  | { success: false; error: string };

function getTierPriceId(tier: any, billingCycle: BillingCycle) {
  return billingCycle === "annual" ? tier.stripeAnnualPriceId : tier.stripeMonthlyPriceId;
}

async function ensureMemberProfile(user: { id: string; name: string; email: string; phone?: string | null }, tierId?: string) {
  const ctx = keystoneContext.sudo();
  const existing = await ctx.query.Member.findMany({
    where: { user: { id: { equals: user.id } } },
    take: 1,
    query: "id membershipTier { id }",
  });

  if (existing.length) {
    const member = existing[0] as any;
    if (tierId && member.membershipTier?.id !== tierId) {
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
      user: { connect: { id: user.id } },
      ...(tierId ? { membershipTier: { connect: { id: tierId } } } : {}),
    },
    query: "id",
  });

  return (created as any).id as string;
}

async function ensureStripeCustomer(user: { id: string; name: string; email: string }, existingCustomerId?: string | null) {
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      source: "openfront-gym",
      userId: user.id,
    },
  });

  await keystoneContext.sudo().query.User.updateOne({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
    query: "id",
  });

  return customer.id;
}

export async function startMembershipCheckout(formData: FormData): Promise<CheckoutResult> {
  try {
    const tierId = formData.get("tierId")?.toString();
    const rawBillingCycle = formData.get("billingCycle")?.toString();
    const billingCycle: BillingCycle = rawBillingCycle === "annual" ? "annual" : "monthly";

    if (!tierId) return { success: false, error: "No membership tier selected." };

    const user = await getUser();
    if (!user) return { success: false, error: "Please sign in before checkout." };

    const ctx = keystoneContext.sudo();
    const dbUser = await ctx.query.User.findOne({
      where: { id: user.id },
      query: "id name email phone stripeCustomerId membership { id status tier { id name } }",
    });

    if (!dbUser) return { success: false, error: "User account not found." };

    const tier = await ctx.query.MembershipTier.findOne({
      where: { id: tierId },
      query: `
        id
        name
        monthlyPrice
        annualPrice
        classCreditsPerMonth
        accessHours
        stripeMonthlyPriceId
        stripeAnnualPriceId
      `,
    });

    if (!tier) return { success: false, error: "Membership tier not found." };

    const priceId = getTierPriceId(tier, billingCycle);
    if (!priceId) {
      return {
        success: false,
        error: `Stripe price is not configured for the ${billingCycle} plan on ${tier.name}.`,
      };
    }

    await ensureMemberProfile(dbUser as any, tier.id);
    const customerId = await ensureStripeCustomer(dbUser as any, (dbUser as any).stripeCustomerId);
    const baseUrl = (await getBaseUrl()) || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/join/cancelled?tier=${tier.id}`,
      allow_promotion_codes: true,
      metadata: {
        source: "openfront-gym",
        userId: dbUser.id,
        tierId: tier.id,
        billingCycle,
      },
      subscription_data: {
        metadata: {
          source: "openfront-gym",
          userId: dbUser.id,
          tierId: tier.id,
          billingCycle,
        },
      },
    });

    if (!session.url) {
      return { success: false, error: "Stripe checkout did not return a redirect URL." };
    }

    return { success: true, url: session.url };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to start checkout.",
    };
  }
}

export async function redirectToMembershipCheckout(formData: FormData): Promise<void> {
  const result = await startMembershipCheckout(formData);
  if (!result.success) {
    const tierId = formData.get("tierId")?.toString();
    const params = new URLSearchParams();
    if (tierId) params.set("tier", tierId);
    params.set("checkoutError", result.error);
    redirect(`/join?${params.toString()}`);
  }
  redirect(result.url);
}

export async function provisionMembershipFromCheckoutSession(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });

  if (!session) throw new Error("Checkout session not found.");
  if (!session.metadata?.userId) throw new Error("Checkout session is missing user metadata.");
  if (!session.metadata?.tierId) throw new Error("Checkout session is missing tier metadata.");

  const paymentStatusOk = session.payment_status === "paid" || session.status === "complete";
  if (!paymentStatusOk) {
    throw new Error("Checkout session has not completed payment yet.");
  }

  const subscription = session.subscription as any;
  const customer = session.customer as any;

  if (!subscription?.id) {
    throw new Error("Stripe subscription was not created.");
  }

  const userId = session.metadata.userId;
  const tierId = session.metadata.tierId;
  const billingCycle: BillingCycle = session.metadata.billingCycle === "annual" ? "annual" : "monthly";
  const ctx = keystoneContext.sudo();

  const dbUser = await ctx.query.User.findOne({
    where: { id: userId },
    query: "id name email phone stripeCustomerId membership { id stripeSubscriptionId status }",
  });
  if (!dbUser) throw new Error("User not found for checkout session.");

  const tier = await ctx.query.MembershipTier.findOne({
    where: { id: tierId },
    query: "id name classCreditsPerMonth",
  });
  if (!tier) throw new Error("Membership tier not found.");

  const memberId = await ensureMemberProfile(dbUser as any, tierId);

  if (!dbUser.stripeCustomerId && customer?.id) {
    await ctx.query.User.updateOne({
      where: { id: dbUser.id },
      data: { stripeCustomerId: customer.id },
      query: "id",
    });
  }

  const nextBillingDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const startDate = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : new Date().toISOString();

  const existingMembership = (dbUser as any).membership as any;
  let membershipId = existingMembership?.id as string | undefined;

  if (membershipId) {
    await ctx.query.Membership.updateOne({
      where: { id: membershipId },
      data: {
        tier: { connect: { id: tierId } },
        status: subscription.status === "active" || subscription.status === "trialing" ? "active" : "past-due",
        billingCycle,
        startDate,
        nextBillingDate,
        autoRenew: true,
        classCreditsRemaining: tier.classCreditsPerMonth,
        stripeSubscriptionId: subscription.id,
        cancelledAt: null,
        cancelReason: null,
      },
      query: "id",
    });
  } else {
    const createdMembership = await ctx.query.Membership.createOne({
      data: {
        member: { connect: { id: dbUser.id } },
        tier: { connect: { id: tierId } },
        status: subscription.status === "active" || subscription.status === "trialing" ? "active" : "past-due",
        billingCycle,
        startDate,
        nextBillingDate,
        autoRenew: true,
        classCreditsRemaining: tier.classCreditsPerMonth,
        stripeSubscriptionId: subscription.id,
      },
      query: "id",
    });
    membershipId = (createdMembership as any).id;
  }

  const existingSubscriptions = await ctx.query.Subscription.findMany({
    where: { stripeSubscriptionId: { equals: subscription.id } },
    take: 1,
    query: "id",
  });

  const subscriptionData = {
    member: { connect: { id: memberId } },
    membershipTier: { connect: { id: tierId } },
    status:
      subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : subscription.status === "past_due"
          ? "past_due"
          : subscription.status === "paused"
            ? "paused"
            : "cancelled",
    startDate,
    nextBillingDate,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customer?.id ?? dbUser.stripeCustomerId,
  };

  if (existingSubscriptions.length) {
    await ctx.query.Subscription.updateOne({
      where: { id: (existingSubscriptions[0] as any).id },
      data: subscriptionData,
      query: "id",
    });
  } else {
    await ctx.query.Subscription.createOne({
      data: subscriptionData,
      query: "id",
    });
  }

  return {
    membershipId,
    subscriptionId: subscription.id as string,
    tierName: tier.name as string,
    billingCycle,
  };
}
