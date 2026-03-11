import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { keystoneContext } from "@/features/keystone/context";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const toDateTime = (secs: number) => {
  const t = new Date("1970-01-01T00:30:00Z");
  t.setSeconds(secs);
  return t;
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") as string;

  if (!webhookSecret) {
    console.error("Stripe webhook secret not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  const sudoContext = keystoneContext.sudo();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await handleCheckoutSessionCompleted(sudoContext, session);
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(sudoContext, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(sudoContext, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(sudoContext, invoice);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sudoContext, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sudoContext, subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`Error processing webhook: ${err.message}`);
    return NextResponse.json(
      { error: `Webhook processing error: ${err.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(
  context: any,
  session: Stripe.Checkout.Session
) {
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;
  const userId = session.metadata?.userId;
  const membershipId = session.metadata?.membershipId;
  const billingCycle = session.metadata?.billingCycle || "monthly";

  if (!subscriptionId || !userId) {
    console.log("Missing subscription ID or user ID in checkout session");
    return;
  }

  // Fetch full subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // If membershipId provided, link subscription to existing membership
  if (membershipId) {
    await context.query.Membership.updateOne({
      where: { id: membershipId },
      data: {
        stripeSubscriptionId: subscriptionId,
        status: "active",
        billingCycle,
        nextBillingDate: toDateTime(subscription.current_period_end).toISOString(),
      },
    });
    console.log(`Linked subscription ${subscriptionId} to membership ${membershipId}`);
  }

  console.log(`Checkout session completed for user ${userId}`);
}

async function handleSubscriptionCreated(
  context: any,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = subscription.metadata?.userId;

  // Find user by stripeCustomerId
  const users = await context.query.User.findMany({
    where: { stripeCustomerId: { equals: customerId } },
    query: "id email",
  });

  const user = users[0];
  if (!user && !userId) {
    console.error(`No user found for Stripe customer: ${customerId}`);
    return;
  }

  const foundUserId = userId || user?.id;

  // Check if Subscription record already exists
  const existingSubscription = await context.query.Subscription.findOne({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (existingSubscription) {
    console.log(`Subscription ${subscription.id} already exists`);
    return;
  }

  // Get the price ID to find the membership tier
  const priceId = subscription.items.data[0]?.price?.id;
  let membershipTier = null;

  if (priceId) {
    // Find tier by stripe price ID
    const tiers = await context.query.MembershipTier.findMany({
      where: {
        OR: [
          { stripeMonthlyPriceId: { equals: priceId } },
          { stripeAnnualPriceId: { equals: priceId } },
        ],
      },
      query: "id name",
    });
    membershipTier = tiers[0];
  }

  // Create Subscription record (following os.org pattern)
  await context.query.Subscription.createOne({
    data: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: subscription.status === "active" ? "active" : "past_due",
      startDate: toDateTime(subscription.created).toISOString(),
      nextBillingDate: toDateTime(subscription.current_period_end).toISOString(),
      ...(membershipTier && { membershipTier: { connect: { id: membershipTier.id } } }),
    },
  });

  console.log(`Created Subscription record for ${subscription.id}`);
}

async function handleInvoicePaymentSucceeded(context: any, invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  // Find membership by subscription ID
  const memberships = await context.db.Membership.findMany({
    where: { stripeSubscriptionId: { equals: subscriptionId } },
  });

  if (memberships.length === 0) {
    console.log(`No membership found for subscription: ${subscriptionId}`);
    return;
  }

  const membership = memberships[0];

  // Update membership status to active
  await context.db.Membership.updateOne({
    where: { id: membership.id },
    data: {
      status: "active",
    },
  });

  // Create payment record
  const member = await context.db.User.findOne({
    where: { id: membership.memberId },
  });

  if (member) {
    await context.db.MembershipPayment.createOne({
      data: {
        member: { connect: { id: member.id } },
        membership: { connect: { id: membership.id } },
        amount: invoice.amount_paid / 100, // Convert from cents
        paymentType: "membership",
        status: "completed",
        paymentMethod: "credit-card",
        stripeInvoiceId: invoice.id,
        stripeChargeId: invoice.charge as string,
        receiptUrl: invoice.hosted_invoice_url || undefined,
        description: `${membership.billingCycle === "monthly" ? "Monthly" : "Annual"} membership payment`,
        isRecurring: true,
      },
    });
  }

  // Reset class credits if it's a new billing period
  const tier = await context.db.MembershipTier.findOne({
    where: { id: membership.tierId },
  });

  if (tier) {
    await context.db.Membership.updateOne({
      where: { id: membership.id },
      data: {
        classCreditsRemaining: tier.classCreditsPerMonth,
      },
    });
  }

  console.log(`Payment succeeded for membership: ${membership.id}`);
}

async function handleInvoicePaymentFailed(context: any, invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  // Find membership by subscription ID
  const memberships = await context.db.Membership.findMany({
    where: { stripeSubscriptionId: { equals: subscriptionId } },
  });

  if (memberships.length === 0) {
    console.log(`No membership found for subscription: ${subscriptionId}`);
    return;
  }

  const membership = memberships[0];

  // Update membership status to past-due
  await context.db.Membership.updateOne({
    where: { id: membership.id },
    data: {
      status: "past-due",
    },
  });

  // Create failed payment record
  const member = await context.db.User.findOne({
    where: { id: membership.memberId },
  });

  if (member) {
    await context.db.MembershipPayment.createOne({
      data: {
        member: { connect: { id: member.id } },
        membership: { connect: { id: membership.id } },
        amount: invoice.amount_due / 100,
        paymentType: "membership",
        status: "failed",
        stripeInvoiceId: invoice.id,
        description: "Failed membership payment",
        isRecurring: true,
      },
    });
  }

  console.log(`Payment failed for membership: ${membership.id}`);
}

async function handleSubscriptionUpdated(context: any, subscription: Stripe.Subscription) {
  const memberships = await context.db.Membership.findMany({
    where: { stripeSubscriptionId: { equals: subscription.id } },
  });

  if (memberships.length === 0) {
    console.log(`No membership found for subscription: ${subscription.id}`);
    return;
  }

  const membership = memberships[0];

  // Map Stripe status to our status
  let status = membership.status;
  if (subscription.status === "active") {
    status = "active";
  } else if (subscription.status === "past_due") {
    status = "past-due";
  } else if (subscription.status === "canceled") {
    status = "cancelled";
  } else if (subscription.status === "paused") {
    status = "frozen";
  }

  // Update next billing date
  const nextBillingDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : membership.nextBillingDate;

  await context.db.Membership.updateOne({
    where: { id: membership.id },
    data: {
      status,
      nextBillingDate,
    },
  });

  console.log(`Subscription updated for membership: ${membership.id}`);
}

async function handleSubscriptionDeleted(context: any, subscription: Stripe.Subscription) {
  const memberships = await context.db.Membership.findMany({
    where: { stripeSubscriptionId: { equals: subscription.id } },
  });

  if (memberships.length === 0) {
    console.log(`No membership found for subscription: ${subscription.id}`);
    return;
  }

  const membership = memberships[0];

  await context.db.Membership.updateOne({
    where: { id: membership.id },
    data: {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      autoRenew: false,
    },
  });

  console.log(`Subscription deleted for membership: ${membership.id}`);
}
