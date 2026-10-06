import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import type { PaymentProviderAdapter } from "./types";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function encodeSession(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function decodeSession(providerSessionId: string) {
  const encoded = providerSessionId.replace(/^test_cs_/, "");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

const testSubscriptions = new Map<string, Stripe.Subscription>();
const testRefunds = new Map<string, Stripe.Refund>();

export function setTestSubscriptionStateForTesting(subscription: Stripe.Subscription) {
  testSubscriptions.set(subscription.id, structuredClone(subscription));
}

export function resetTestSubscriptionStatesForTesting() {
  testSubscriptions.clear();
}

export function resetTestRefundsForTesting() {
  testRefunds.clear();
}

function updateTestSubscription(subscriptionId: string, data: Partial<Stripe.Subscription>) {
  const existing = testSubscriptions.get(subscriptionId);
  const now = Math.floor(Date.now() / 1000);
  const subscription = {
    id: subscriptionId,
    object: "subscription",
    customer: "test_customer",
    status: "active",
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    metadata: {},
    items: { object: "list", data: [], has_more: false, url: "/v1/subscription_items" },
    ...existing,
    ...data,
  } as Stripe.Subscription;
  testSubscriptions.set(subscriptionId, subscription);
  return structuredClone(subscription);
}

function verifySignature(payload: string, signature: string) {
  const secret = process.env.PAYMENT_TEST_WEBHOOK_SECRET;
  if (!secret) throw new Error("Payment test webhook secret not configured.");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signature.replace(/^test=/, "");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  ) {
    throw new Error("Payment test webhook signature verification failed.");
  }
}

export const testPaymentProviderAdapter: PaymentProviderAdapter = {
  async validateMembershipPrice(input) {
    if (!input.priceId || !Number.isInteger(input.amount) || input.amount < 0) {
      throw new Error("Payment test price configuration is invalid.");
    }
  },

  async createMembershipCheckout(input) {
    if (input.priceId === "test_fail") {
      throw new Error("Payment test adapter forced checkout failure.");
    }
    const providerCustomerId = input.customerId || `test_customer_${digest(input.userId)}`;
    const providerSessionId = `test_cs_${encodeSession({
      userId: input.userId,
      userName: input.userName,
      userEmail: input.userEmail,
      tierId: input.tierId,
      billingCycle: input.billingCycle,
      amount: input.amount,
      currencyCode: input.currencyCode,
      idempotencyKey: input.idempotencyKey,
      providerCustomerId,
    })}`;
    return {
      providerSessionId,
      providerCustomerId,
      checkoutUrl: `https://payments.test/checkout/${digest(input.idempotencyKey)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  },

  async retrieveMembershipCheckout(providerSessionId) {
    const data = decodeSession(providerSessionId);
    const now = Math.floor(Date.now() / 1000);
    const subscriptionId = `test_sub_${digest(data.idempotencyKey)}`;
    const periodEnd = new Date(now * 1000);
    if (data.billingCycle === "annual") periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const subscription = testSubscriptions.get(subscriptionId) || updateTestSubscription(subscriptionId, {
      customer: data.providerCustomerId,
      status: "active",
      current_period_start: now,
      current_period_end: Math.floor(periodEnd.getTime() / 1000),
      metadata: {
        paymentSessionKey: data.idempotencyKey,
        userId: data.userId,
        tierId: data.tierId,
        billingCycle: data.billingCycle,
      },
    });
    return {
      id: providerSessionId,
      object: "checkout.session",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      currency: data.currencyCode.toLowerCase(),
      customer: data.providerCustomerId,
      metadata: {
        source: "openfront-gym-test",
        paymentSessionKey: data.idempotencyKey,
        userId: data.userId,
        tierId: data.tierId,
        billingCycle: data.billingCycle,
        amount: String(data.amount),
        currencyCode: data.currencyCode,
      },
      subscription,
    } as unknown as Stripe.Checkout.Session;
  },

  async retrieveSubscription(subscriptionId) {
    const subscription = testSubscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`Test subscription ${subscriptionId} is not configured.`);
    return structuredClone(subscription);
  },

  async createSetupIntent(customerId) {
    const id = `test_seti_${digest(customerId)}`;
    return { id, clientSecret: `${id}_secret` };
  },

  async cancelSubscriptionAtPeriodEnd(subscriptionId) {
    return updateTestSubscription(subscriptionId, {
      status: "active",
      cancel_at_period_end: true,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });
  },

  async pauseSubscription(subscriptionId) {
    return updateTestSubscription(subscriptionId, {
      status: "active",
      pause_collection: { behavior: "void", resumes_at: null },
    });
  },

  async resumeSubscription(subscriptionId) {
    return updateTestSubscription(subscriptionId, { status: "active", pause_collection: null });
  },

  async changeSubscriptionPrice(subscriptionId, _priceId, metadata, _idempotencyKey) {
    const current = testSubscriptions.get(subscriptionId);
    return updateTestSubscription(subscriptionId, {
      status: "active",
      metadata: { ...current?.metadata, ...metadata },
    });
  },

  async createBillingPortalSession(customerId, returnUrl) {
    return { url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}testPortal=${digest(customerId)}` };
  },

  async refundPayment(paymentIntentId, amount, idempotencyKey, evidence) {
    const key = `${paymentIntentId}:${idempotencyKey || "no-key"}`;
    const existing = testRefunds.get(key);
    if (existing) return structuredClone(existing);
    const refund = {
      id: `test_refund_${digest(key)}`,
      object: "refund",
      payment_intent: paymentIntentId,
      amount: amount ?? 0,
      currency: evidence?.currencyCode.toLowerCase() || "usd",
      status: "succeeded",
      metadata: evidence ? { gymRefundOperationKey: evidence.operationKey, gymRefundCurrency: evidence.currencyCode, gymRefundReason: evidence.reason } : {},
    } as Stripe.Refund;
    testRefunds.set(key, refund);
    return structuredClone(refund);
  },

  async findRefundPayment(paymentIntentId, operationKey) {
    const refund = [...testRefunds.values()].find(candidate =>
      candidate.payment_intent === paymentIntentId && candidate.metadata?.gymRefundOperationKey === operationKey,
    );
    return refund ? structuredClone(refund) : null;
  },

  constructWebhookEvent(payload, signature) {
    verifySignature(payload, signature);
    return JSON.parse(payload) as Stripe.Event;
  },
};
