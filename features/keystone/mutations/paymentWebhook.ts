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
import { assertExactProviderRefund, readRefundReservation } from "../lib/refund-reservation";

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
    evidence = Object.fromEntries(["id", "mode", "metadata", "client_reference_id", "amount", "currency", "amount_refunded", "payment_intent", "status"].map(key => [key, object[key] ?? null]));
    if (event.type === "charge.refunded") {
      evidence.refunds = { data: (object.refunds?.data || []).map((refund: any) => ({
        id: refund.id, payment_intent: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id,
        amount: refund.amount, currency: refund.currency, status: refund.status,
        metadata: refund.metadata || {},
      })) };
    }
    if (evidence.payment_intent && typeof evidence.payment_intent === "object") evidence.payment_intent = evidence.payment_intent.id;
    if (evidence.metadata) evidence.metadata = { paymentSessionKey: evidence.metadata.paymentSessionKey ?? null };
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

  // Provider truth, not a historical webhook snapshot, is authoritative. The
  // durable high-water transaction below prevents a delayed older event from
  // overwriting a newer cancellation, pause, tier, or renewal state.
  let subscription = assertRetrievedSubscription(
    incomingSubscription.id,
    await adapter.retrieveSubscription(incomingSubscription.id),
  );

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
    if (!owner) throw new Error("Subscription owner prerequisite missing; retry reconciliation");
    const { user, customerId } = owner;
    const member = await transaction.member.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true },
    });
    if (!member) throw new Error("Subscription member prerequisite missing; retry reconciliation");
    const checkout = await transaction.paymentSession.findFirst({ where: { organizationId, userId: user.id, idempotencyKey: subscription.metadata?.paymentSessionKey || "__missing__" } });
    const agreement = checkout?.data?.agreementSnapshot;
    const tier = await resolveTier(transaction, subscription, organizationId);
    const membership = await transaction.membership.findFirst({
      where: { memberId: user.id, organizationId },
    });
    if (membership && membership.stripeSubscriptionId !== subscription.id) throw new Error("Another subscription owns this membership; checkout reconciliation required");
    await lockTransactionKey(transaction, `member:${member.id}`);
    const providerMembershipStatus = mapStripeStatusToMembership(
      subscription.status,
      Boolean(subscription.pause_collection),
    );
    const now = new Date();
    const hasCurrentPaidServicePeriod = Boolean(
      membership?.status === "active" && membership.creditPeriodStart && membership.creditPeriodEnd &&
      new Date(membership.creditPeriodStart) <= now && now < new Date(membership.creditPeriodEnd),
    );
    // Provider subscription status is not a receipt. Existing paid service may
    // continue through an active event; a first active/trialing event cannot
    // create entitlement before a positive paid invoice commits.
    const membershipStatus = providerMembershipStatus === "active"
      ? (hasCurrentPaidServicePeriod ? "active" : "past-due")
      : providerMembershipStatus;
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

    if (!membership && !agreement?.version) throw new Error("Subscription checkout agreement prerequisite missing; retry reconciliation");
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
          agreementSnapshot: agreement,
          creditPeriodStart: null,
          creditPeriodEnd: null,
          classCreditsRemaining: 0,
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
    const data: any = { billingEventAt: eventAt };
    if (!["cancelled", "frozen"].includes(membership.status) &&
        (membership.status !== "expired" || (membership.autoRenew && status === "succeeded" && periodEnd * 1000 > Date.now()))) data.status = status === "succeeded" ? "active" : "past-due";
    if (status === "succeeded" && ["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "")) {
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
  return processVerifiedPaymentEvent(context, resolved.provider, resolved.adapter, resolved.organizationId, resolved.event);
}

/** Replays only an already signature-verified durable event; never accepts a client payload. */
export async function replayPaymentEvent(_root: unknown, { eventId }: { eventId: string }, context: Context) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Payment reconciliation management permission required");
  const organizationId = actor.organizationId;
  const record = await prisma.paymentEvent.findFirst({ where: { id: eventId, organizationId } });
  if (!record || !record.data?.event || !["failed", "processing"].includes(record.status)) throw new Error("Replayable payment event not found");
  if (record.status === "processing" && record.lockedUntil > new Date()) throw new Error("Payment event is currently processing");
  const provider = await context.sudo().query.PaymentProvider.findOne({ where: { id: record.paymentProviderId }, query: "id adapterKey organization { id }" });
  if (!provider || provider.organization?.id !== organizationId) throw new Error("Payment event provider organization mismatch");
  const event = record.data.event as Stripe.Event;
  if (event.id !== record.providerEventId || event.type !== record.eventType) throw new Error("Stored payment event evidence mismatch");
  const adapter = await getPaymentProviderAdapterForExecution(provider.adapterKey);
  return processVerifiedPaymentEvent(context, provider, adapter, organizationId, event);
}

async function processVerifiedPaymentEvent(context: Context, provider: any, adapter: PaymentProviderAdapter, organizationId: string, event: Stripe.Event) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
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
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object as Stripe.Invoice, "succeeded", event.created);
        break;
      case "invoice.payment_failed":
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object as Stripe.Invoice, "failed", event.created);
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
      case "charge.refunded":
        await recordRefund(context, event.data.object as Stripe.Charge, organizationId, new Date(event.created * 1000));
        break;
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
