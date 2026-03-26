import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { keystoneContext } from "@/features/keystone/context";
import { constructWebhookEvent, stripe } from "@/features/keystone/utils/stripe";
import { provisionMembershipFromCheckoutSession } from "@/features/integrations/payment/stripe";

function toIsoFromUnix(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function findUserByStripe(context: any, customerId: string, metadataUserId?: string) {
  if (metadataUserId) {
    const user = await context.query.User.findOne({
      where: { id: metadataUserId },
      query: "id email stripeCustomerId membership { id stripeSubscriptionId status }",
    });
    if (user) return user;
  }

  const users = await context.query.User.findMany({
    where: { stripeCustomerId: { equals: customerId } },
    take: 1,
    query: "id email stripeCustomerId membership { id stripeSubscriptionId status }",
  });

  return users[0] ?? null;
}

async function findMemberForUser(context: any, userId: string) {
  const members = await context.query.Member.findMany({
    where: { user: { id: { equals: userId } } },
    take: 1,
    query: "id",
  });
  return members[0] ?? null;
}

async function resolveTier(context: any, subscription: Stripe.Subscription) {
  const metadataTierId = subscription.metadata?.tierId;
  if (metadataTierId) {
    const tier = await context.query.MembershipTier.findOne({
      where: { id: metadataTierId },
      query: "id name classCreditsPerMonth stripeMonthlyPriceId stripeAnnualPriceId",
    });
    if (tier) return tier;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;

  const tiers = await context.query.MembershipTier.findMany({
    where: {
      OR: [
        { stripeMonthlyPriceId: { equals: priceId } },
        { stripeAnnualPriceId: { equals: priceId } },
      ],
    },
    take: 1,
    query: "id name classCreditsPerMonth stripeMonthlyPriceId stripeAnnualPriceId",
  });

  return tiers[0] ?? null;
}

function mapStripeStatusToMembership(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past-due";
    case "canceled":
      return "cancelled";
    case "paused":
      return "frozen";
    default:
      return "past-due";
  }
}

function mapStripeStatusToSubscription(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    case "paused":
      return "paused";
    default:
      return "cancelled";
  }
}

async function syncFromSubscription(context: any, subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  const user = await findUserByStripe(context, customerId, subscription.metadata?.userId);
  if (!user) {
    console.warn(`No user found for Stripe customer ${customerId}`);
    return;
  }

  const member = await findMemberForUser(context, user.id);
  const tier = await resolveTier(context, subscription);
  const billingCycle = subscription.metadata?.billingCycle === "annual" ? "annual" : "monthly";
  const membershipStatus = mapStripeStatusToMembership(subscription.status);
  const nextBillingDate = toIsoFromUnix(subscription.current_period_end);
  const startDate = toIsoFromUnix(subscription.current_period_start) ?? new Date().toISOString();

  if (user.membership?.id) {
    await context.query.Membership.updateOne({
      where: { id: user.membership.id },
      data: {
        ...(tier ? { tier: { connect: { id: tier.id } } } : {}),
        status: membershipStatus,
        billingCycle,
        startDate,
        nextBillingDate,
        autoRenew: subscription.status !== "canceled",
        stripeSubscriptionId: subscription.id,
        ...(membershipStatus === "cancelled"
          ? { cancelledAt: new Date().toISOString() }
          : { cancelledAt: null, cancelReason: null }),
      },
      query: "id",
    });
  } else if (tier) {
    await context.query.Membership.createOne({
      data: {
        member: { connect: { id: user.id } },
        tier: { connect: { id: tier.id } },
        status: membershipStatus,
        billingCycle,
        startDate,
        nextBillingDate,
        autoRenew: subscription.status !== "canceled",
        classCreditsRemaining: tier.classCreditsPerMonth,
        stripeSubscriptionId: subscription.id,
      },
      query: "id",
    });
  }

  if (member) {
    const existingSubscriptions = await context.query.Subscription.findMany({
      where: { stripeSubscriptionId: { equals: subscription.id } },
      take: 1,
      query: "id",
    });

    const data = {
      member: { connect: { id: member.id } },
      ...(tier ? { membershipTier: { connect: { id: tier.id } } } : {}),
      status: mapStripeStatusToSubscription(subscription.status),
      startDate,
      nextBillingDate,
      cancelledAt: subscription.status === "canceled" ? new Date().toISOString() : null,
      pausedAt: subscription.status === "paused" ? new Date().toISOString() : null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
    };

    if (existingSubscriptions.length) {
      await context.query.Subscription.updateOne({
        where: { id: existingSubscriptions[0].id },
        data,
        query: "id",
      });
    } else {
      await context.query.Subscription.createOne({
        data,
        query: "id",
      });
    }
  }
}

async function recordInvoicePayment(context: any, invoice: Stripe.Invoice, status: "completed" | "failed") {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  const memberships = await context.query.Membership.findMany({
    where: { stripeSubscriptionId: { equals: subscriptionId } },
    take: 1,
    query: "id billingCycle member { id email } tier { id classCreditsPerMonth }",
  });
  const membership = memberships[0] as any;
  if (!membership) return;

  const existingPayments = await context.query.MembershipPayment.findMany({
    where: { stripeInvoiceId: { equals: invoice.id } },
    take: 1,
    query: "id status",
  });

  const paymentData = {
    member: { connect: { id: membership.member.id } },
    membership: { connect: { id: membership.id } },
    amount: ((status === "completed" ? invoice.amount_paid : invoice.amount_due) ?? 0) / 100,
    paymentType: "membership",
    status,
    paymentMethod: "credit-card",
    paymentDate: new Date().toISOString(),
    stripeInvoiceId: invoice.id,
    stripeChargeId: typeof invoice.charge === "string" ? invoice.charge : undefined,
    receiptUrl: invoice.hosted_invoice_url ?? undefined,
    description: `${membership.billingCycle === "annual" ? "Annual" : "Monthly"} membership payment`,
    isRecurring: true,
  };

  if (existingPayments.length) {
    await context.query.MembershipPayment.updateOne({
      where: { id: existingPayments[0].id },
      data: paymentData,
      query: "id",
    });
  } else {
    await context.query.MembershipPayment.createOne({
      data: paymentData,
      query: "id",
    });
  }

  await context.query.Membership.updateOne({
    where: { id: membership.id },
    data: {
      status: status === "completed" ? "active" : "past-due",
      ...(status === "completed" && membership.tier
        ? { classCreditsRemaining: membership.tier.classCreditsPerMonth }
        : {}),
    },
    query: "id",
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(body, signature);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const context = keystoneContext.sudo();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.id) {
          await provisionMembershipFromCheckoutSession(session.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncFromSubscription(context, subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await recordInvoicePayment(context, invoice, "completed");
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await recordInvoicePayment(context, invoice, "failed");
        break;
      }
      default:
        break;
    }
  } catch (error: any) {
    console.error("Stripe webhook processing error", error);
    return NextResponse.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
