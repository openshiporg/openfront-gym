import type Stripe from "stripe";
import type { Context } from ".keystone/types";
import { provisionMembershipFromCheckoutSession } from "../../integrations/payment/provision-membership";
import { mapStripeStatusToMembership } from "../../integrations/payment/lifecycle";
import { getPaymentProviderAdapter } from "../../integrations/payment";
import type { PaymentProviderAdapter } from "../../integrations/payment/types";
import { lockTransactionKey } from "./classCapacity";

const PROVIDER_CODE = "pp_stripe";

function toIsoFromUnix(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function mapStripeStatusToSubscription(status: string, collectionPaused = false) {
  if (collectionPaused) return "paused";
  if (status === "active" || status === "trialing") return "active";
  if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(status)) return "past_due";
  if (status === "paused") return "paused";
  return "cancelled";
}

async function claimEvent(context: Context, providerId: string, organizationId: string, event: Stripe.Event) {
  const now = new Date();
  try {
    return await context.prisma.$transaction(async (transaction: any) => {
      const existing = await transaction.paymentEvent.findUnique({
        where: { paymentProviderId_providerEventId: { paymentProviderId: providerId, providerEventId: event.id } },
      });
      if (existing?.status === "processed" || existing?.status === "ignored") return null;
      if (existing?.status === "processing" && existing.lockedUntil && existing.lockedUntil > now) return null;
      if (existing) {
        return transaction.paymentEvent.update({ where: { id: existing.id }, data: { status: "processing", attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000), lastError: "" }, select: { id: true, status: true } });
      }
      return transaction.paymentEvent.create({
        data: { providerEventId: event.id, eventType: event.type, status: "processing", attempts: 1, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000), organizationId, paymentProviderId: providerId, data: { created: event.created, livemode: event.livemode } },
        select: { id: true, status: true },
      });
    });
  } catch (error: any) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}

async function resolveTier(transaction: any, subscription: Stripe.Subscription, organizationId: string) {
  const metadataTierId = subscription.metadata?.tierId;
  if (metadataTierId) {
    const tier = await transaction.membershipTier.findFirst({
      where: { id: metadataTierId, organizationId },
      select: { id: true, classCreditsPerMonth: true },
    });
    if (tier) return tier;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  return transaction.membershipTier.findFirst({
    where: {
      organizationId,
      OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }],
    },
    select: { id: true, classCreditsPerMonth: true },
  });
}

async function findUserForSubscription(transaction: any, subscription: Stripe.Subscription, organizationId: string) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const select = { id: true, organizationId: true, stripeCustomerId: true };
  if (subscription.metadata?.userId) {
    const user = await transaction.user.findFirst({
      where: { id: subscription.metadata.userId, organizationId },
      select,
    });
    if (user) return { user, customerId };
  }
  const user = await transaction.user.findFirst({
    where: { stripeCustomerId: customerId, organizationId },
    select,
  });
  return user ? { user, customerId } : null;
}

function assertRetrievedSubscription(
  incomingSubscriptionId: string,
  subscription: Stripe.Subscription,
) {
  if (subscription.id !== incomingSubscriptionId) {
    throw new Error("Payment provider returned a different subscription during reconciliation");
  }
  return subscription;
}

async function syncSubscription(
  context: Context,
  adapter: PaymentProviderAdapter,
  incomingSubscription: Stripe.Subscription,
  organizationId: string,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  if (!event.id || !Number.isInteger(event.created) || event.created < 0) {
    throw new Error("Stripe subscription event ordering evidence is invalid");
  }

  // Provider truth, not a historical webhook snapshot, is authoritative. The
  // durable high-water transaction below prevents a delayed older event from
  // overwriting a newer cancellation, pause, tier, or renewal state.
  let subscription = assertRetrievedSubscription(
    incomingSubscription.id,
    await adapter.retrieveSubscription(incomingSubscription.id),
  );

  return context.prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(
      transaction,
      `stripe-subscription:${organizationId}:${incomingSubscription.id}`,
    );

    const existingProjection = await transaction.subscription.findUnique({
      where: { stripeSubscriptionId: incomingSubscription.id },
    });
    if (existingProjection && existingProjection.organizationId !== organizationId) {
      throw new Error("Stripe subscription is assigned to a different organization");
    }
    if (existingProjection && event.created < existingProjection.providerEventCreated) {
      return { applied: false, stale: true };
    }
    if (
      existingProjection &&
      event.created === existingProjection.providerEventCreated &&
      event.id === existingProjection.providerEventId
    ) {
      return { applied: false, duplicate: true };
    }
    if (
      existingProjection &&
      event.created === existingProjection.providerEventCreated &&
      event.id !== existingProjection.providerEventId
    ) {
      // Stripe timestamps have one-second precision. Distinct same-second
      // events cannot be ordered by their opaque IDs, so refetch while holding
      // the subscription lock and apply current provider truth.
      subscription = assertRetrievedSubscription(
        incomingSubscription.id,
        await adapter.retrieveSubscription(incomingSubscription.id),
      );
    }

    const owner = await findUserForSubscription(transaction, subscription, organizationId);
    if (!owner) return { applied: false, missingOwner: true };
    const { user, customerId } = owner;
    const member = await transaction.member.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true },
    });
    const tier = await resolveTier(transaction, subscription, organizationId);
    const membership = await transaction.membership.findFirst({
      where: { memberId: user.id, organizationId },
      select: { id: true },
    });
    const membershipStatus = mapStripeStatusToMembership(
      subscription.status,
      Boolean(subscription.pause_collection),
    );
    const billingCycle = subscription.metadata?.billingCycle === "annual" ? "annual" : "monthly";
    const nextBillingDate = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;
    const startDate = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : new Date(event.created * 1000);
    const eventTime = new Date(event.created * 1000);
    const membershipData = {
      ...(tier ? { tierId: tier.id } : {}),
      status: membershipStatus,
      billingCycle,
      startDate,
      nextBillingDate,
      autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
      stripeSubscriptionId: subscription.id,
      ...(membershipStatus === "cancelled"
        ? { cancelledAt: eventTime, freezeStartDate: null, freezeEndDate: null }
        : membershipStatus === "frozen"
          ? {}
          : subscription.cancel_at_period_end
            ? { cancelledAt: null }
            : { cancelledAt: null, cancelReason: "", freezeStartDate: null, freezeEndDate: null }),
    };

    if (membership) {
      await transaction.membership.update({ where: { id: membership.id }, data: membershipData });
    } else if (member && tier) {
      // Establish canonical membership state even when the signed subscription
      // event is delivered before checkout.session.completed.
      await transaction.membership.create({
        data: {
          organizationId,
          memberId: user.id,
          tierId: tier.id,
          ...membershipData,
          classCreditsRemaining: membershipStatus === "active" ? tier.classCreditsPerMonth ?? 0 : 0,
        },
      });
    }

    if (member && tier) {
      await transaction.member.updateMany({
        where: { id: member.id, organizationId },
        data: { membershipTierId: tier.id },
      });
    }

    if (member) {
      const projectionData = {
        memberId: member.id,
        ...(tier ? { membershipTierId: tier.id } : {}),
        status: mapStripeStatusToSubscription(
          subscription.status,
          Boolean(subscription.pause_collection),
        ),
        startDate,
        nextBillingDate,
        cancelledAt: subscription.status === "canceled" ? eventTime : null,
        pausedAt: subscription.status === "paused" || subscription.pause_collection ? eventTime : null,
        stripeCustomerId: customerId,
        providerEventCreated: event.created,
        providerEventId: event.id,
      };
      if (existingProjection) {
        await transaction.subscription.update({
          where: { id: existingProjection.id },
          data: projectionData,
        });
      } else if (tier) {
        await transaction.subscription.create({
          data: {
            organizationId,
            stripeSubscriptionId: subscription.id,
            ...projectionData,
          },
        });
      }
    }

    return { applied: true };
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function recordInvoicePayment(
  context: Context,
  providerId: string,
  organizationId: string,
  invoice: Stripe.Invoice,
  status: "succeeded" | "failed"
) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ stripeSubscriptionId: { equals: subscriptionId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id billingCycle status member { id } tier { classCreditsPerMonth } organization { id }",
  });
  const membership = memberships[0] as any;
  if (!membership) return;
  const members = await context.sudo().query.Member.findMany({
    where: { AND: [{ user: { id: { equals: membership.member.id } } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id",
  });
  const member = members[0] as any;
  if (!member) return;

  const sessions = await context.sudo().query.PaymentSession.findMany({
    where: { AND: [{ providerSubscriptionId: { equals: subscriptionId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id",
  });
  const amount = status === "succeeded" ? invoice.amount_paid : invoice.amount_due;
  const currencyCode = invoice.currency.toUpperCase();
  const existingGymPayments = await context.sudo().query.GymPayment.findMany({
    where: { AND: [{ stripeInvoiceId: { equals: invoice.id } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id status",
  });
  const gymPaymentData = {
    organization: { connect: { id: membership.organization.id } },
    member: { connect: { id: member.id } },
    paymentProvider: { connect: { id: providerId } },
    ...(sessions[0] ? { paymentSession: { connect: { id: (sessions[0] as any).id } } } : {}),
    amount,
    currencyCode,
    status,
    paymentDate: new Date().toISOString(),
    stripePaymentIntentId:
      typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id,
    stripeChargeId: typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id,
    stripeInvoiceId: invoice.id,
    receiptNumber: `STRIPE-${invoice.id}`,
    description: `${membership.billingCycle === "annual" ? "Annual" : "Monthly"} membership payment`,
    metadata: { hostedInvoiceUrl: invoice.hosted_invoice_url ?? null },
  };
  if (existingGymPayments[0]) {
    const existingStatus = (existingGymPayments[0] as any).status;
    if (!["succeeded", "refunded"].includes(existingStatus) && existingStatus !== status) {
      await context.sudo().query.GymPayment.updateOne({
        where: { id: (existingGymPayments[0] as any).id },
        data: gymPaymentData,
        query: "id",
      });
    }
  } else {
    await context.sudo().query.GymPayment.createOne({ data: gymPaymentData, query: "id" });
  }

  const existingMembershipPayments = await context.sudo().query.MembershipPayment.findMany({
    where: { AND: [{ stripeInvoiceId: { equals: invoice.id } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id status",
  });
  const existingMembershipPaymentStatus = (existingMembershipPayments[0] as any)?.status as string | undefined;
  const existingPaymentIsSettled = ["completed", "refunded"].includes(existingMembershipPaymentStatus || "");
  // Checkout provisioning grants the first period's allowance. Only a true
  // recurring cycle may replenish it; subscription-create or proration
  // invoices must never erase usage that occurred after checkout.
  const shouldReplenishCredits =
    status === "succeeded" &&
    !existingPaymentIsSettled &&
    invoice.billing_reason === "subscription_cycle";
  const effectiveMembershipPaymentSucceeded = status === "succeeded" || existingPaymentIsSettled;
  const membershipPaymentData = {
    organization: { connect: { id: membership.organization.id } },
    member: { connect: { id: membership.member.id } },
    membership: { connect: { id: membership.id } },
    amount,
    currencyCode,
    paymentType: "membership",
    status: status === "succeeded" ? "completed" : "failed",
    paymentMethod: "credit-card",
    paymentDate: new Date().toISOString(),
    stripePaymentIntentId:
      typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id,
    stripeChargeId: typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id,
    stripeInvoiceId: invoice.id,
    receiptNumber: `STRIPE-${invoice.id}`,
    receiptUrl: invoice.hosted_invoice_url ?? undefined,
    description: `${membership.billingCycle === "annual" ? "Annual" : "Monthly"} membership payment`,
    isRecurring: true,
  };
  if (existingMembershipPayments[0]) {
    const existingStatus = (existingMembershipPayments[0] as any).status;
    const expectedStatus = status === "succeeded" ? "completed" : "failed";
    if (!["completed", "disputed", "refunded"].includes(existingStatus) && existingStatus !== expectedStatus) {
      await context.sudo().query.MembershipPayment.updateOne({
        where: { id: (existingMembershipPayments[0] as any).id },
        data: membershipPaymentData,
        query: "id",
      });
    }
  } else {
    await context.sudo().query.MembershipPayment.createOne({ data: membershipPaymentData, query: "id" });
  }

  await context.prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `membership:${membership.id}`);
    await lockTransactionKey(transaction, `member:${member.id}`);
    const currentMembership = await transaction.membership.findFirst({
      where: { id: membership.id, organizationId },
      include: { tier: { select: { classCreditsPerMonth: true } } },
    });
    if (!currentMembership || ["cancelled", "expired"].includes(currentMembership.status)) return;
    await transaction.membership.update({
      where: { id: currentMembership.id },
      data: {
        status: currentMembership.status === "frozen"
          ? "frozen"
          : effectiveMembershipPaymentSucceeded ? "active" : "past-due",
        ...(shouldReplenishCredits && currentMembership.tier
          ? { classCreditsRemaining: currentMembership.tier.classCreditsPerMonth }
          : {}),
      },
    });
  });
}

export function monotonicRefundAmount(paymentAmount: number, currentRefundAmount: number | null, incomingRefundAmount: number) {
  if (!Number.isInteger(paymentAmount) || paymentAmount < 0 || !Number.isInteger(incomingRefundAmount)) {
    throw new Error("Refund evidence must use integer minor units");
  }
  const current = Math.max(0, Math.min(paymentAmount, currentRefundAmount ?? 0));
  const incoming = Math.max(0, Math.min(paymentAmount, incomingRefundAmount));
  return Math.max(current, incoming);
}

export async function recordRefund(context: Context, charge: Stripe.Charge, organizationId: string) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId || charge.amount_refunded <= 0) return;

  await context.prisma.$transaction(async (transaction: any) => {
    // Serialize all webhook observations for the provider payment, then join the
    // operator-refund lock so webhook and front-desk finalization cannot race.
    await lockTransactionKey(transaction, `payment-refund:${organizationId}:${paymentIntentId}`);
    let gymPayment = await transaction.gymPayment.findFirst({
      where: { organizationId, stripePaymentIntentId: paymentIntentId },
    });
    if (gymPayment) {
      await lockTransactionKey(transaction, `refund:${gymPayment.id}`);
      gymPayment = await transaction.gymPayment.findFirst({
        where: { id: gymPayment.id, organizationId, stripePaymentIntentId: paymentIntentId },
      });
    }
    const membershipPayment = await transaction.membershipPayment.findFirst({
      where: { organizationId, stripePaymentIntentId: paymentIntentId },
    });
    const refundedAt = new Date();

    if (gymPayment) {
      const refundAmount = monotonicRefundAmount(gymPayment.amount, gymPayment.refundAmount, charge.amount_refunded);
      const status = refundAmount >= gymPayment.amount ? "refunded" : "succeeded";
      if (refundAmount !== (gymPayment.refundAmount ?? 0) || status !== gymPayment.status) {
        await transaction.gymPayment.update({
          where: { id: gymPayment.id },
          data: { status, refundAmount, refundedAt },
        });
      }
    }

    if (membershipPayment) {
      const refundAmount = monotonicRefundAmount(
        membershipPayment.amount,
        membershipPayment.refundAmount,
        charge.amount_refunded,
      );
      const status = refundAmount >= membershipPayment.amount ? "refunded" : "completed";
      if (refundAmount !== (membershipPayment.refundAmount ?? 0) || status !== membershipPayment.status) {
        await transaction.membershipPayment.update({
          where: { id: membershipPayment.id },
          data: { status, refundAmount, refundedAt },
        });
      }
    }
  });
}

async function expireCheckoutSession(context: Context, session: Stripe.Checkout.Session, organizationId: string) {
  const key = session.metadata?.paymentSessionKey || session.client_reference_id;
  if (!key) return;
  const sessions = await context.sudo().query.PaymentSession.findMany({
    where: { AND: [{ idempotencyKey: { equals: key } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id status",
  });
  const localSession = sessions[0] as any;
  if (!localSession || localSession.status === "completed") return;
  await context.sudo().query.PaymentSession.updateOne({
    where: { id: localSession.id },
    data: { status: "expired", expiresAt: new Date().toISOString() },
    query: "id",
  });
}

export async function resolveStripeWebhookProvider(context: Context, payload: string, signature: string) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { AND: [{ code: { equals: PROVIDER_CODE } }, { isInstalled: { equals: true } }] },
    take: 100,
    query: "id code adapterKey providerAccountId organization { id }",
  });
  if (!providers.length) throw new Error("Payment provider is not installed.");
  const adapterKeys = new Set(providers.map((entry: any) => entry.adapterKey));
  if (adapterKeys.size !== 1) throw new Error("Webhook provider adapters are ambiguously configured.");
  const adapter = await getPaymentProviderAdapter(providers[0].adapterKey);
  const event = adapter.constructWebhookEvent(payload, signature);
  const accountId = typeof (event as any).account === "string" ? (event as any).account : null;
  const matchingProviders = accountId ? providers.filter((entry: any) => entry.providerAccountId === accountId) : providers;
  if (accountId && matchingProviders.length !== 1) throw new Error("Webhook account is not assigned to exactly one organization.");
  if (!accountId && matchingProviders.length !== 1) throw new Error("Webhook account identity is required when multiple organizations use the provider.");
  const provider = matchingProviders[0];
  const organizationId = provider.organization?.id;
  if (!organizationId) throw new Error("Payment provider is not assigned to an organization.");
  return { provider, adapter, event, organizationId };
}

export async function handleStripeWebhook(
  context: Context,
  payload: string,
  signature: string
) {
  const { provider, adapter, event, organizationId } = await resolveStripeWebhookProvider(context, payload, signature);
  const eventRecord = await claimEvent(context, provider.id, organizationId, event);
  if (!eventRecord) return { received: true, duplicate: true };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") await provisionMembershipFromCheckoutSession(session.id, organizationId, context);
        break;
      }
      case "checkout.session.expired":
        await expireCheckoutSession(context, event.data.object as Stripe.Checkout.Session, organizationId);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(
          context,
          adapter,
          event.data.object as Stripe.Subscription,
          organizationId,
          event,
        );
        break;
      case "invoice.paid":
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object as Stripe.Invoice, "succeeded");
        break;
      case "invoice.payment_failed":
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object as Stripe.Invoice, "failed");
        break;
      case "charge.refunded":
        await recordRefund(context, event.data.object as Stripe.Charge, organizationId);
        break;
      default:
        await context.sudo().query.PaymentEvent.updateOne({
          where: { id: (eventRecord as any).id },
          data: { status: "ignored", processedAt: new Date().toISOString(), lockedUntil: null },
          query: "id",
        });
        return { received: true, ignored: true };
    }

    await context.sudo().query.PaymentEvent.updateOne({
      where: { id: (eventRecord as any).id },
      data: { status: "processed", processedAt: new Date().toISOString(), lockedUntil: null },
      query: "id",
    });
    return { received: true };
  } catch (error) {
    await context.sudo().query.PaymentEvent.updateOne({
      where: { id: (eventRecord as any).id },
      data: {
        status: "failed",
        lockedUntil: null,
        lastError: error instanceof Error ? error.message : "Webhook processing failed",
      },
      query: "id",
    });
    throw error;
  }
}
