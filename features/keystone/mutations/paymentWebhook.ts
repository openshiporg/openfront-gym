import { reconciliationPaymentProviderWhere } from "../lib/stripe-environment-provider";
import type Stripe from "stripe";
import type { Context } from ".keystone/types";
import { provisionMembershipFromCheckoutSession } from "../../integrations/payment/provision-membership";
import { mapStripeStatusToMembership } from "../../integrations/payment/lifecycle";
import { getPaymentProviderAdapterForExecution } from "../../integrations/payment";
import type { PaymentProviderAdapter } from "../../integrations/payment/types";
import { createFinanceException, enqueueOperationalNotice } from "../lib/operational-notices";
import { ensureMonthlyCreditGrant, reviewFutureMembershipBookings } from "../lib/membership-credits";
import { currentRoleActor } from "../access/currentRoleActor";
import { lockTransactionKey } from "./classCapacity";
import { guardKeystonePrismaResults, requirePrismaAffectedCount, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { assertExactProviderRefund, readRefundReservation, reconcileProviderRefundCumulative } from "../lib/refund-reservation";
import { ownsCounterPayment, reconcileCounterCheckoutEvent, reconcileCounterRefundEvent } from "./counterPayments";
import { COUNTER_SOURCE } from "../lib/counter-card-payment";
import { acceptedProviderPrice, invoiceServiceProblem, subscriptionItemsProblem } from "../../integrations/payment/commercial-agreement";

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

/** Persist only replay inputs, excluding addresses, card data and provider secrets. */
export function paymentEventReplayEvidence(event: Stripe.Event) {
  const object = event.data.object as any;
  let evidence: any;
  if (event.type.startsWith("invoice.")) {
    evidence = Object.fromEntries(["id", "subscription", "amount_paid", "amount_due", "currency", "period_start", "period_end", "billing_reason", "status_transitions", "payment_intent", "charge", "hosted_invoice_url", "subtotal", "total", "tax", "amount_remaining"].map(key => [key, object[key] ?? null]));
    for (const key of ["subscription", "payment_intent", "charge"]) if (evidence[key] && typeof evidence[key] === "object") evidence[key] = evidence[key].id;
    evidence.lines = { data: (object.lines?.data || []).map((line: any) => ({ id: line.id, amount: line.amount, description: line.description, period: line.period, quantity: line.quantity, type: line.type, proration: line.proration, price: line.price ? { id: line.price.id } : null })) };
  } else {
    evidence = Object.fromEntries(["id", "object", "mode", "metadata", "client_reference_id", "amount", "amount_total", "currency", "amount_refunded", "payment_intent", "payment_status", "status"].map(key => [key, object[key] ?? null]));
    if (event.type === "charge.refunded") {
      evidence.refunds = { data: (object.refunds?.data || []).map((refund: any) => ({
        id: refund.id, payment_intent: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id,
        amount: refund.amount, currency: refund.currency, status: refund.status,
        metadata: refund.metadata || {},
      })) };
    }
    if (evidence.payment_intent && typeof evidence.payment_intent === "object") evidence.payment_intent = evidence.payment_intent.id;
    if (evidence.metadata) evidence.metadata = Object.fromEntries(["paymentSessionKey", "source", "kind", "attemptId", "organizationId", "gymRefundOperationKey"]
      .map(key => [key, evidence.metadata[key] ?? null]));
  }
  return { id: event.id, type: event.type, created: event.created, livemode: event.livemode, data: { object: evidence } };
}

async function claimEvent(context: Context, providerId: string, organizationId: string, event: Stripe.Event) {
  const now = new Date();
  try {
    return await withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
      await lockTransactionKey(transaction, `payment-event:${providerId}:${event.id}`);
      const existing = await transaction.paymentEvent.findUnique({
        where: { paymentProviderId_providerEventId: { paymentProviderId: providerId, providerEventId: event.id } },
      });
      if (existing?.status === "processed" || existing?.status === "ignored") return null;
      if (existing?.status === "processing" && existing.lockedUntil && existing.lockedUntil > now) throw new Error("Payment event is already processing; retry later");
      if (existing) {
        return transaction.paymentEvent.update({ where: { id: existing.id }, data: { status: "processing", attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000), lastError: "" }, select: { id: true, status: true, attempts: true } });
      }
      return transaction.paymentEvent.create({
        data: { providerEventId: event.id, eventType: event.type, status: "processing", attempts: 1, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000), organizationId, paymentProviderId: providerId, data: { event: paymentEventReplayEvidence(event) } },
        select: { id: true, status: true, attempts: true },
      });
    });
  } catch (error: any) {
    if (error?.code === "P2002") throw new Error("Payment event claim conflicted; retry later");
    throw error;
  }
}

/** The accepted provider price for a membership (or its accepting checkout, before one exists). */
async function membershipAcceptedPrice(transaction: any, membership: any, checkout: any) {
  const tierId = membership?.tierId || checkout?.membershipTierId;
  const cycle = membership?.billingCycle || checkout?.billingCycle;
  const tier = tierId ? await transaction.membershipTier.findFirst({ where: { id: tierId }, select: { stripeMonthlyPriceId: true, stripeAnnualPriceId: true } }) : null;
  // The accepting checkout's price speaks for the agreement only while it is that same plan and cycle.
  const checkoutAccepted = checkout && (!membership || (checkout.membershipTierId === membership.tierId && checkout.billingCycle === membership.billingCycle));
  return acceptedProviderPrice(membership?.agreementSnapshot || checkout?.data?.agreementSnapshot, {
    checkoutPriceId: checkoutAccepted ? checkout.data?.priceId : null,
    checkoutProductId: checkoutAccepted ? checkout.data?.productId : null,
    tierPriceId: cycle === "annual" ? tier?.stripeAnnualPriceId : tier?.stripeMonthlyPriceId,
  });
}

/** The local plan whose configured Stripe Price the provider subscription actually bills. */
async function tierForProviderPrice(transaction: any, subscription: Stripe.Subscription, organizationId: string) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  return transaction.membershipTier.findFirst({
    where: { organizationId, OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }] },
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
    if (user?.stripeCustomerId && user.stripeCustomerId !== customerId) throw new Error("Subscription customer does not match the existing user");
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

export async function syncSubscription(
  context: Context,
  adapter: PaymentProviderAdapter,
  incomingSubscription: Stripe.Subscription,
  organizationId: string,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  if (!event.id || !Number.isInteger(event.created) || event.created < 0) {
    throw new Error("Stripe subscription event ordering evidence is invalid");
  }

  return withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
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

    // Customer and owner metadata are immutable for a subscription, so the owner can be
    // resolved before provider truth is read.
    const owner = await findUserForSubscription(transaction, incomingSubscription, organizationId);
    if (!owner) throw new Error("Subscription owner prerequisite missing; retry reconciliation");
    const { user, customerId } = owner;
    const member = await transaction.member.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true },
    });
    if (!member) throw new Error("Subscription member prerequisite missing; retry reconciliation");
    // Operator billing finalization also holds the member lock. Provider truth and the local
    // membership are read only after both locks are held, so neither a stale provider
    // snapshot nor a pre-lock membership row can overwrite a newer committed state.
    await lockTransactionKey(transaction, `member:${member.id}`);
    const subscription = assertRetrievedSubscription(
      incomingSubscription.id,
      await adapter.retrieveSubscription(incomingSubscription.id),
    );

    const checkout = await transaction.paymentSession.findFirst({ where: { organizationId, userId: user.id, idempotencyKey: subscription.metadata?.paymentSessionKey || "__missing__" } });
    const agreement = checkout?.data?.agreementSnapshot;
    const membership = await transaction.membership.findFirst({
      where: { memberId: user.id, organizationId },
    });
    if (membership && membership.stripeSubscriptionId !== subscription.id) throw new Error("Another subscription owns this membership; checkout reconciliation required");

    // The plan is changed only through the authorized tier-change workflow. A provider
    // subscription that doesn't bill exactly the accepted price (same price, product, quantity,
    // currency and cycle) is recorded for reconciliation, never applied.
    const priceTier = await tierForProviderPrice(transaction, subscription, organizationId);
    let tierId: string | null = membership?.tierId || checkout?.membershipTierId || null;
    const accepted = await membershipAcceptedPrice(transaction, membership, checkout);
    const itemProblem = subscriptionItemsProblem(subscription, accepted, membership?.billingCycle || checkout?.billingCycle || "monthly");
    if (!membership && checkout && itemProblem) {
      throw new Error(`Subscription doesn't match its checkout agreement (it ${itemProblem}); operator reconciliation required`);
    }
    if (!tierId) tierId = priceTier?.id || null;
    if (membership && itemProblem) {
      const pendingTierChange = await transaction.membershipBillingAttempt.findFirst({
        where: { organizationId, membershipId: membership.id, operation: "tier-change", status: "processing" },
        select: { id: true },
      });
      if (!pendingTierChange) {
        await createFinanceException(transaction, {
          organizationId, key: `subscription-price:${subscription.id}:${subscription.items?.data?.[0]?.price?.id || "none"}`, kind: "subscription-plan-mismatch",
          reference: subscription.id,
          summary: `The provider subscription ${itemProblem}, which doesn't match the member's accepted plan. Review the subscription and change the plan from Billing, or restore the provider price.`,
        });
      }
    }

    const providerMembershipStatus = mapStripeStatusToMembership(
      subscription.status,
      Boolean(subscription.pause_collection),
    );
    const now = new Date();
    // Paid service is evidenced by the period a positive paid invoice established, whatever
    // local status (frozen, past due) the membership currently has. A first active/trialing
    // event has no such period and therefore cannot create entitlement.
    const hasCurrentPaidServicePeriod = Boolean(
      membership?.creditPeriodStart && membership.creditPeriodEnd &&
      new Date(membership.creditPeriodStart) <= now && now < new Date(membership.creditPeriodEnd),
    );
    const membershipStatus = providerMembershipStatus === "active"
      ? (hasCurrentPaidServicePeriod ? "active" : "past-due")
      : providerMembershipStatus;
    const billingCycle = membership?.billingCycle === "annual" || (!membership && subscription.metadata?.billingCycle === "annual") ? "annual" : "monthly";
    const nextBillingDate = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;
    const startDate = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : new Date(event.created * 1000);
    const eventTime = new Date(event.created * 1000);
    const membershipData = {
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

    if (!membership && !agreement?.version) throw new Error("Subscription checkout agreement prerequisite missing; retry reconciliation");
    if (membership) {
      await transaction.membership.update({ where: { id: membership.id }, data: membershipData });
    } else if (tierId) {
      // Establish canonical membership state even when the signed subscription
      // event is delivered before checkout.session.completed.
      await transaction.membership.create({
        data: {
          organizationId,
          memberId: user.id,
          tierId,
          ...membershipData,
          agreementSnapshot: agreement,
          creditPeriodStart: null,
          creditPeriodEnd: null,
          classCreditsRemaining: 0,
        },
      });
    }

    if (tierId && !membership) {
      await transaction.member.updateMany({
        where: { id: member.id, organizationId },
        data: { membershipTierId: tierId },
      });
    }

    const projectionData = {
      memberId: member.id,
      ...(tierId ? { membershipTierId: tierId } : {}),
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
    } else if (tierId) {
      await transaction.subscription.create({
        data: {
          organizationId,
          stripeSubscriptionId: subscription.id,
          ...projectionData,
        },
      });
    }

    const reconciled = await transaction.membership.findFirst({ where: { memberId: user.id, organizationId } });
    if (reconciled) await reviewFutureMembershipBookings(transaction, reconciled);
    return { applied: true };
  }, { maxWait: 10_000, timeout: 30_000 });
}

/** One invoice lock + member lock commit receipts, service rights and status atomically. */
export async function recordInvoicePayment(
  context: Context, providerId: string, organizationId: string, invoice: Stripe.Invoice,
  status: "succeeded" | "failed", eventCreated: number,
) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return; // Non-membership invoices do not grant Gym entitlements.
  if (!invoice.id || !Number.isInteger(eventCreated)) throw new Error("Invoice event identity is invalid");
  const amount = status === "succeeded" ? invoice.amount_paid : invoice.amount_due;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invoice amount must use non-negative minor units");
  if (String(invoice.currency || "").toUpperCase() !== "USD") throw new Error("Membership invoice currency is outside the supported USD contract");
  if (status === "succeeded" && amount <= 0) throw new Error("A positive paid invoice is required to grant membership service");
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `stripe-subscription:${organizationId}:${subscriptionId}`);
    await lockTransactionKey(tx, `invoice:${organizationId}:${invoice.id}`);
    let membership = await tx.membership.findFirst({ where: { organizationId, stripeSubscriptionId: subscriptionId } });
    if (!membership) throw new Error("Invoice membership prerequisite missing; retry reconciliation");
    const member = await tx.member.findFirst({ where: { organizationId, userId: membership.memberId } });
    if (!member) throw new Error("Invoice member prerequisite missing; retry reconciliation");
    await lockTransactionKey(tx, `member:${member.id}`);
    membership = await tx.membership.findFirst({ where: { id: membership.id, organizationId, stripeSubscriptionId: subscriptionId } });
    if (!membership) throw new Error("Invoice membership changed while acquiring member lock");
    const existingGym = await tx.gymPayment.findUnique({ where: { stripeInvoiceId: invoice.id } });
    const existingMember = await tx.membershipPayment.findUnique({ where: { stripeInvoiceId: invoice.id } });
    if ([existingGym, existingMember].some(p => p && p.organizationId !== organizationId)) throw new Error("Invoice belongs to another organization");
    const settled = ["succeeded", "refunded"].includes(existingGym?.status) || ["completed", "disputed", "refunded"].includes(existingMember?.status);
    const session = await tx.paymentSession.findFirst({ where: { organizationId, providerSubscriptionId: subscriptionId } });
    const effectiveAt = status === "succeeded" ? invoice.status_transitions?.paid_at || eventCreated : eventCreated;
    const paymentDate = new Date(effectiveAt * 1000);
    const common = {
      organizationId, amount, currencyCode: invoice.currency.toUpperCase(), paymentDate,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id,
      stripeChargeId: typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id,
      receiptNumber: `STRIPE-${invoice.id}`,
      description: `${membership.billingCycle === "annual" ? "Annual" : "Monthly"} membership payment`,
    };
    const gymData = { ...common, memberId: member.id, paymentProviderId: providerId, paymentSessionId: session?.id,
      status, metadata: { hostedInvoiceUrl: invoice.hosted_invoice_url ?? null, billingReason: invoice.billing_reason,
        subtotal: invoice.subtotal, total: invoice.total, tax: invoice.tax, amountPaid: invoice.amount_paid,
        amountRemaining: invoice.amount_remaining, lines: invoice.lines?.data.map(line => ({ id: line.id, amount: line.amount, description: line.description, period: line.period, quantity: line.quantity, priceId: line.price?.id })) || [] } };
    const memberData = { ...common, memberId: membership.memberId, membershipId: membership.id,
      paymentType: "membership", status: status === "succeeded" ? "completed" : "failed", paymentMethod: "credit-card",
      receiptUrl: invoice.hosted_invoice_url || "", isRecurring: true };
    // Do not regress settled evidence on a late failure. Missing twin rows from
    // the former split implementation are repaired from the settled receipt.
    if (!settled) {
      if (existingGym) await tx.gymPayment.update({ where: { id: existingGym.id }, data: gymData });
      else await tx.gymPayment.create({ data: gymData });
      if (existingMember) await tx.membershipPayment.update({ where: { id: existingMember.id }, data: memberData });
      else await tx.membershipPayment.create({ data: memberData });
    } else if (status === "succeeded") {
      const refundAmount = Math.max(existingGym?.refundAmount || 0, existingMember?.refundAmount || 0);
      const refundEvidence = refundAmount ? { refundAmount, refundedAt: existingGym?.refundedAt || existingMember?.refundedAt } : {};
      const repairedGym = { ...gymData, ...refundEvidence, status: refundAmount >= amount && refundAmount > 0 ? "refunded" : "succeeded" };
      const repairedMember = { ...memberData, ...refundEvidence, status: refundAmount >= amount && refundAmount > 0 ? "refunded" : "completed" };
      if (!existingGym) await tx.gymPayment.create({ data: repairedGym });
      else if (!["succeeded", "refunded"].includes(existingGym.status)) await tx.gymPayment.update({ where: { id: existingGym.id }, data: repairedGym });
      if (!existingMember) await tx.membershipPayment.create({ data: repairedMember });
      else if (!["completed", "disputed", "refunded"].includes(existingMember.status)) await tx.membershipPayment.update({ where: { id: existingMember.id }, data: repairedMember });
    }
    const recurringLine = invoice.lines?.data.find(line => line.type === "subscription" && !line.proration);
    const periodStart = recurringLine?.period?.start ?? invoice.period_start;
    const periodEnd = recurringLine?.period?.end ?? invoice.period_end;
    const eventAt = new Date(eventCreated * 1000);
    const isOlderPeriod = membership.creditPeriodEnd && periodEnd * 1000 < new Date(membership.creditPeriodEnd).getTime();
    const isOlderEvent = membership.billingEventAt && eventAt < new Date(membership.billingEventAt);
    if (isOlderPeriod || isOlderEvent || (settled && status === "failed")) return { applied: false, stale: true };
    // A paid period is granted only from the accepted agreement's own service line. Positive money
    // for anything else stays recorded as a receipt and goes to finance review, granting nothing.
    const grantsPeriod = status === "succeeded" && ["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "");
    const serviceProblem = grantsPeriod
      ? invoiceServiceProblem(invoice, await membershipAcceptedPrice(tx, membership, session), membership.billingCycle)
      : null;
    if (serviceProblem) {
      const pendingTierChange = await tx.membershipBillingAttempt.findFirst({
        where: { organizationId, membershipId: membership.id, operation: "tier-change", status: "processing" }, select: { id: true },
      });
      // A plan change being finalized may bill its new price first; retry once it settles.
      if (pendingTierChange) throw new Error("A plan change is being finalized for this membership; retry invoice reconciliation");
      await createFinanceException(tx, { organizationId, key: `invoice-service:${invoice.id}`, kind: "subscription-plan-mismatch", reference: invoice.id,
        summary: `Paid invoice ${invoice.id} ${serviceProblem}, so it was recorded without granting a service period. Reconcile the subscription with the member's accepted plan.` });
      await tx.membership.update({ where: { id: membership.id }, data: { billingEventAt: new Date(eventCreated * 1000) } });
      return { applied: false, mismatch: true };
    }
    const data: any = { billingEventAt: eventAt };
    if (!["cancelled", "frozen"].includes(membership.status) &&
        (membership.status !== "expired" || (membership.autoRenew && status === "succeeded" && periodEnd * 1000 > Date.now()))) data.status = status === "succeeded" ? "active" : "past-due";
    if (grantsPeriod) {
      if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd) || periodEnd <= periodStart) throw new Error("Invoice service period is invalid");
      data.creditPeriodStart = new Date(periodStart * 1000);
      data.creditPeriodEnd = new Date(periodEnd * 1000);
      // Monthly grant rows are authoritative, including within annual billing.
      // Never reset a scalar balance on replay, tier change or a proration.
    }
    const updated = await tx.membership.update({ where: { id: membership.id }, data });
    if (updated.status === "active" && updated.creditPeriodStart && new Date(updated.creditPeriodStart) <= new Date() && new Date(updated.creditPeriodEnd) > new Date()) {
      const grant = await ensureMonthlyCreditGrant(tx, updated, new Date());
      await tx.membership.update({ where: { id: updated.id }, data: { classCreditsRemaining: grant.remaining } });
    }
    await reviewFutureMembershipBookings(tx, updated);
    if (status === "failed") {
      await createFinanceException(tx, { organizationId, key: `invoice:${invoice.id}`, kind: "failed-payment", reference: invoice.id, summary: "Membership invoice collection failed; reconcile payment and contact member." });
      await enqueueOperationalNotice(tx, { organizationId, memberId: member.id, key: `invoice:${invoice.id}:${eventCreated}`, kind: "billing", message: "Membership payment needs attention. Open your billing portal or contact the front desk." });
    }
    return { applied: true };
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

export async function recordRefund(context: Context, charge: Stripe.Charge, organizationId: string, effectiveAt = new Date()) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId || charge.amount_refunded <= 0) return;

  await withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
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
    if (!gymPayment || (!membershipPayment && gymPayment.stripeInvoiceId)) throw new Error("Refund receipt prerequisite missing; retry reconciliation after invoice processing");
    const refundedAt = effectiveAt;

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
      const status = refundAmount >= membershipPayment.amount ? "refunded" : membershipPayment.status === "disputed" ? "disputed" : "completed";
      if (refundAmount !== (membershipPayment.refundAmount ?? 0) || status !== membershipPayment.status) {
        await transaction.membershipPayment.update({
          where: { id: membershipPayment.id },
          data: { status, refundAmount, refundedAt },
        });
      }
    }

    if (gymPayment) {
      const attempts = await transaction.gymRefundAttempt.findMany({ where: { organizationId, paymentId: gymPayment.id, status: "processing" } });
      const providerRefunds = (charge as any).refunds?.data || [];
      for (const refund of providerRefunds) {
        const operationKey = refund.metadata?.gymRefundOperationKey;
        if (typeof operationKey !== "string" || !operationKey) continue;
        const attempt = attempts.find((candidate: any) => readRefundReservation(candidate)?.reservation.providerRequestKey === operationKey);
        if (!attempt) continue;
        const saved = readRefundReservation(attempt);
        if (!saved) throw new Error("Refund webhook matched an attempt without frozen reservation evidence");
        assertExactProviderRefund(refund, saved.reservation);
        const succeeded = refund.status === "succeeded";
        const failed = refund.status === "failed" || refund.status === "canceled";
        const update = await transaction.gymRefundAttempt.updateMany({
          where: { id: attempt.id, status: "processing" },
          data: {
            status: succeeded ? "succeeded" : failed ? "failed" : "processing",
            providerRefundId: refund.id,
            ...(succeeded ? { completedAt: refundedAt } : {}),
            reservation: saved.reservation,
            lastError: succeeded ? "" : `Provider refund status: ${refund.status || "unknown"}`,
          },
        });
        if (update.count > 1) requirePrismaAffectedCount(update, 1, "refund webhook reconciliation fence");
        if (succeeded) {
          await transaction.gymPayment.updateMany({ where: { id: gymPayment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
        } else if (failed) {
          await transaction.gymPayment.updateMany({ where: { id: gymPayment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
        }
      }
    }
  });
}

/**
 * Expires exactly the provider checkout this event names, under the same customer checkout
 * lock provisioning holds; a completed attempt is terminal and a newer replacement attempt
 * (a different provider session) is never expired by an old event.
 */
async function expireCheckoutSession(context: Context, session: Stripe.Checkout.Session, organizationId: string) {
  const key = session.metadata?.paymentSessionKey || session.client_reference_id;
  if (!key || !session.id) return;
  await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    const localSession = await tx.paymentSession.findFirst({ where: { organizationId, idempotencyKey: key }, select: { id: true, userId: true } });
    if (!localSession) return;
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${localSession.userId}`);
    await tx.paymentSession.updateMany({
      where: { id: localSession.id, organizationId, status: { notIn: ["completed", "expired"] }, OR: [{ providerSessionId: session.id }, { providerSessionId: "" }] },
      data: { status: "expired", expiresAt: new Date(), provisioningLockedUntil: null },
    });
  });
}

/**
 * refund.created / refund.updated / refund.failed: settles a membership refund attempt or a
 * counter refund from the refund's own terminal status, without waiting for a charge event.
 */
async function recordRefundObservation(context: Context, adapter: PaymentProviderAdapter, refundEvent: Stripe.Refund, organizationId: string) {
  const refund = adapter.retrieveRefund ? await adapter.retrieveRefund(refundEvent.id) : refundEvent;
  if (refund.id !== refundEvent.id) throw new Error("Payment provider returned a different refund");
  const counter = await reconcileCounterRefundEvent(context, organizationId, refund);
  if (counter.matched) return;
  const operationKey = refund.metadata?.gymRefundOperationKey;
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (typeof operationKey !== "string" || !operationKey || !paymentIntentId) return;
  await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `payment-refund:${organizationId}:${paymentIntentId}`);
    const payment = await tx.gymPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } });
    if (!payment) return;
    await lockTransactionKey(tx, `refund:${payment.id}`);
    const attempts = await tx.gymRefundAttempt.findMany({ where: { organizationId, paymentId: payment.id, status: "processing" } });
    const attempt = attempts.find((candidate: any) => readRefundReservation(candidate)?.reservation.providerRequestKey === operationKey);
    if (!attempt) return;
    const saved = readRefundReservation(attempt);
    if (!saved) throw new Error("Refund event matched an attempt without frozen reservation evidence");
    assertExactProviderRefund(refund, saved.reservation);
    const now = new Date();
    if (refund.status === "succeeded") {
      const membershipPayment = payment.stripeInvoiceId ? await tx.membershipPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } }) : null;
      const prior = Math.max(payment.refundAmount ?? 0, membershipPayment?.refundAmount ?? 0);
      const totalRefunded = reconcileProviderRefundCumulative(payment.amount, prior, saved.reservation.startingRefundAmount, saved.reservation.amount);
      const fullyRefunded = totalRefunded >= payment.amount;
      const update = await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { status: "succeeded", providerRefundId: refund.id, completedAt: now, reservation: saved.reservation, lastError: "" } });
      requirePrismaAffectedCount(update, 1, "refund event finalization fence");
      await tx.gymPayment.update({ where: { id: payment.id }, data: { status: fullyRefunded ? "refunded" : "succeeded", refundAmount: totalRefunded, refundedAt: now, ...(payment.refundLockToken === attempt.claimToken ? { refundLockUntil: null, refundLockToken: "" } : {}) } });
      if (membershipPayment) {
        await tx.membershipPayment.update({ where: { id: membershipPayment.id }, data: { status: fullyRefunded ? "refunded" : membershipPayment.status === "disputed" ? "disputed" : "completed", refundAmount: totalRefunded, refundedAt: now } });
      }
    } else if (refund.status === "failed" || refund.status === "canceled") {
      await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { status: "failed", providerRefundId: refund.id, reservation: saved.reservation, lastError: `Provider refund status: ${refund.status}` } });
      await tx.gymPayment.updateMany({ where: { id: payment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    } else {
      await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { providerRefundId: refund.id, lastError: `Provider refund status: ${refund.status || "unknown"}` } });
    }
  });
}

export async function resolveStripeWebhookProvider(context: Context, payload: string, signature: string) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { AND: [{ code: { equals: PROVIDER_CODE } }, reconciliationPaymentProviderWhere()] },
    take: 100,
    query: "id code adapterKey providerAccountId organization { id }",
  });
  if (!providers.length) throw new Error("Payment provider is not installed.");
  const adapterKeys = new Set(providers.map((entry: any) => entry.adapterKey));
  if (adapterKeys.size !== 1) throw new Error("Webhook provider adapters are ambiguously configured.");
  const adapter = await getPaymentProviderAdapterForExecution(providers[0].adapterKey);
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

export async function handleStripeWebhook(context: Context, payload: string, signature: string) {
  const resolved = await resolveStripeWebhookProvider(context, payload, signature);
  const object = resolved.event.data.object as any;
  const source = object.metadata?.source || object.subscription_details?.metadata?.source || object.parent?.subscription_details?.metadata?.source;
  // Payouts belong to the verified merchant account itself; counter payments carry their own
  // source. Anything else must correlate with a Gym subscription or payment.
  if (source !== 'openfront-gym' && source !== COUNTER_SOURCE && object.object !== 'payout') {
    const prisma = guardKeystonePrismaResults(context.prisma as any);
    const subscriptionId = object.object === 'subscription' ? object.id : typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
    const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    const owned = subscriptionId
      ? await prisma.subscription.findFirst({ where: { organizationId: resolved.organizationId, stripeSubscriptionId: subscriptionId }, select: { id: true } })
      : paymentIntentId
        ? (await prisma.membershipPayment.findFirst({ where: { organizationId: resolved.organizationId, stripePaymentIntentId: paymentIntentId }, select: { id: true } })) ||
          (await prisma.gymPayment.findFirst({ where: { organizationId: resolved.organizationId, stripePaymentIntentId: paymentIntentId }, select: { id: true } })) ||
          (await ownsCounterPayment(prisma, resolved.organizationId, paymentIntentId) ? { id: paymentIntentId } : null)
        : null;
    if (!owned) return { received: true, ignored: true };
  }
  return processVerifiedPaymentEvent(context, resolved.provider, resolved.adapter, resolved.organizationId, resolved.event);
}

/** Replays only an already signature-verified durable event; never accepts a client payload. */
export async function replayPaymentEvent(_root: unknown, { eventId }: { eventId: string }, context: Context) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Payment reconciliation management permission required");
  const organizationId = actor.organizationId;
  const record = await prisma.paymentEvent.findFirst({ where: { id: eventId, organizationId } });
  return replayStoredPaymentEvent(context, organizationId, record);
}

async function replayStoredPaymentEvent(context: Context, organizationId: string, record: any) {
  if (!record || !record.data?.event || !["failed", "processing"].includes(record.status)) throw new Error("Replayable payment event not found");
  if (record.status === "processing" && record.lockedUntil > new Date()) throw new Error("Payment event is currently processing");
  const provider = await context.sudo().query.PaymentProvider.findOne({ where: { id: record.paymentProviderId }, query: "id adapterKey organization { id }" });
  if (!provider || provider.organization?.id !== organizationId) throw new Error("Payment event provider organization mismatch");
  const event = record.data.event as Stripe.Event;
  if (event.id !== record.providerEventId || event.type !== record.eventType) throw new Error("Stored payment event evidence mismatch");
  const adapter = await getPaymentProviderAdapterForExecution(provider.adapterKey);
  return processVerifiedPaymentEvent(context, provider, adapter, organizationId, event);
}

const INVOICE_PREREQUISITE_ERROR = /^Invoice (?:membership|member) prerequisite missing/;

/**
 * Stripe can deliver invoice.paid before checkout.session.completed. Like Restaurant's
 * webhook (completeVerifiedCheckout before failing correlation), complete the verified
 * checkout from provider truth and record the invoice once. Anything still missing
 * fails the event so the provider retries and staff can replay it.
 */
async function recordInvoiceWithCheckoutPrerequisites(
  context: Context, providerId: string, adapter: PaymentProviderAdapter, organizationId: string,
  invoice: Stripe.Invoice, status: "succeeded" | "failed", eventCreated: number,
) {
  try {
    return await recordInvoicePayment(context, providerId, organizationId, invoice, status, eventCreated);
  } catch (error) {
    if (!(error instanceof Error) || !INVOICE_PREREQUISITE_ERROR.test(error.message)) throw error;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    if (!subscriptionId || !(await provisionCheckoutForSubscription(context, adapter, organizationId, subscriptionId))) throw error;
    return recordInvoicePayment(context, providerId, organizationId, invoice, status, eventCreated);
  }
}

async function provisionCheckoutForSubscription(context: Context, adapter: PaymentProviderAdapter, organizationId: string, subscriptionId: string) {
  const subscription = assertRetrievedSubscription(subscriptionId, await adapter.retrieveSubscription(subscriptionId));
  const key = subscription.metadata?.paymentSessionKey;
  if (!key) return false;
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const local = await prisma.paymentSession.findFirst({
    where: { organizationId, OR: [{ idempotencyKey: key }, { idempotencyKey: key.replace(/:attempt:\d+$/, "") }] },
    select: { providerSessionId: true },
  });
  if (!local?.providerSessionId) return false;
  await provisionMembershipFromCheckoutSession(local.providerSessionId, organizationId, context);
  return true;
}

/**
 * After checkout provisioning commits, replay stored signature-verified invoice events
 * that failed only because the membership did not exist yet. Others stay in Operations.
 */
export async function replayDeferredInvoiceEvents(context: Context, organizationId: string, subscriptionId?: string | null) {
  if (!subscriptionId) return 0;
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const deferred = await prisma.paymentEvent.findMany({
    where: {
      organizationId, status: "failed",
      eventType: { in: ["invoice.paid", "invoice.payment_failed"] },
      lastError: { contains: "prerequisite missing" },
      data: { path: ["event", "data", "object", "subscription"], equals: subscriptionId },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  let replayed = 0;
  for (const record of deferred) {
    try {
      await replayStoredPaymentEvent(context, organizationId, record);
      replayed += 1;
    } catch (error) {
      console.error("Deferred payment event replay failed", { eventType: record.eventType, name: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return replayed;
}

async function processVerifiedPaymentEvent(context: Context, provider: any, adapter: PaymentProviderAdapter, organizationId: string, event: Stripe.Event) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const eventRecord = await claimEvent(context, provider.id, organizationId, event);
  if (!eventRecord) return { received: true, duplicate: true };

  try {
    // Newer Stripe API versions also send refund.failed (absent from this SDK's event union);
    // it carries the same refund object as refund.updated.
    if ((event.type as string) === "refund.failed") {
      await recordRefundObservation(context, adapter, event.data.object as Stripe.Refund, organizationId);
    } else switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source === COUNTER_SOURCE) {
          await reconcileCounterCheckoutEvent(context, organizationId, session);
        } else if (session.mode === "subscription" && event.type === "checkout.session.completed") {
          const provisioned = await provisionMembershipFromCheckoutSession(session.id, organizationId, context);
          await replayDeferredInvoiceEvents(context, organizationId, provisioned.subscriptionId);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source === COUNTER_SOURCE) await reconcileCounterCheckoutEvent(context, organizationId, session);
        else await expireCheckoutSession(context, session, organizationId);
        break;
      }
      case "refund.created":
      case "refund.updated":
        await recordRefundObservation(context, adapter, event.data.object as Stripe.Refund, organizationId);
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
        await recordInvoiceWithCheckoutPrerequisites(context, provider.id, adapter, organizationId, event.data.object as Stripe.Invoice, "succeeded", event.created);
        break;
      case "invoice.payment_failed":
        await recordInvoiceWithCheckoutPrerequisites(context, provider.id, adapter, organizationId, event.data.object as Stripe.Invoice, "failed", event.created);
        break;
      case "invoice.payment_action_required":
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "payout.failed":
      case "payout.paid": {
        const object = event.data.object as any;
        await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
          await createFinanceException(tx, { organizationId, key: event.id, kind: event.type,
            reference: object.id, summary: `Provider event ${event.type}; amount ${object.amount ?? object.amount_due ?? "unknown"} ${object.currency ?? ""}. Review provider evidence and record reconciliation.` });
          if (event.type.startsWith("charge.dispute.")) {
            const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
            if (paymentIntentId) {
              await lockTransactionKey(tx, `payment-refund:${organizationId}:${paymentIntentId}`);
              const payment = await tx.membershipPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } });
              if (payment && ["completed", "disputed"].includes(payment.status)) await tx.membershipPayment.update({ where: { id: payment.id }, data: { status: object.status === "won" ? "completed" : "disputed" } });
            }
          }
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        let counterRefunds = 0;
        for (const refund of ((charge as any).refunds?.data || [])) {
          if ((await reconcileCounterRefundEvent(context, organizationId, refund)).matched) counterRefunds += 1;
        }
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        // Counter charges settle through their refund attempts; membership charges keep the receipt path.
        const counterCharge = counterRefunds > 0 || (paymentIntentId ? await ownsCounterPayment(prisma, organizationId, paymentIntentId) : false);
        if (!counterCharge) await recordRefund(context, charge, organizationId, new Date(event.created * 1000));
        break;
      }
      default:
        const ignored = await prisma.paymentEvent.updateMany({
          where: { id: (eventRecord as any).id, status: "processing", attempts: (eventRecord as any).attempts },
          data: { status: "ignored", processedAt: new Date(), lockedUntil: null },
        });
        requirePrismaAffectedCount(ignored, 1, "payment event ignore fence");
        return { received: true, ignored: true };
    }

    const processed = await prisma.paymentEvent.updateMany({
      where: { id: (eventRecord as any).id, status: "processing", attempts: (eventRecord as any).attempts },
      data: { status: "processed", processedAt: new Date(), lockedUntil: null },
    });
    requirePrismaAffectedCount(processed, 1, "payment event completion fence");
    return { received: true };
  } catch (error) {
    await prisma.paymentEvent.updateMany({
      where: { id: (eventRecord as any).id, status: "processing", attempts: (eventRecord as any).attempts },
      data: {
        status: "failed",
        lockedUntil: null,
        lastError: error instanceof Error ? error.message : "Webhook processing failed",
      },
    });
    throw error;
  }
}
