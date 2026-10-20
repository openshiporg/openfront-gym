import type { Context } from ".keystone/types";
import { assertSingleMerchantCheckout } from "../../integrations/payment/membership-checkout-core";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { installedPaymentProviderWhere, reconciliationPaymentProviderWhere } from "./stripe-environment-provider";
import { publicAppUrl } from "./internal-origin";

/**
 * Provider side of staffed counter card payments (retail sales, training packages). The
 * counter payment service reserves a CounterPaymentAttempt before any call here, so these
 * helpers only carry the attempt's frozen identity to the provider and verify it back.
 */
export const COUNTER_SOURCE = "openfront-gym-counter";
export const MINIMUM_CARD_AMOUNT = 50;
// The fixed lifetime of an attempt's checkout request. Stripe needs expires_at at least 30 minutes
// after a session is created, so the first create (and any lost-response replay of it) has about
// 30 minutes in which the provider can still accept it; after that, only expiry resolves it.
export const COUNTER_CHECKOUT_MINUTES = 60;

export type CounterKind = "retail" | "training";
type Purpose = "charge" | "reconcile";

/** The provider an attempt was admitted with; later calls must reach exactly this one. */
export type CounterProviderBinding = { providerId: string; providerAccountId: string | null; adapterKey: string };

export function sameCounterProvider(provider: { id?: string; providerId?: string; providerAccountId?: string | null; adapterKey: string }, bound: CounterProviderBinding) {
  return (provider.providerId ?? provider.id) === bound.providerId && (provider.providerAccountId ?? null) === (bound.providerAccountId ?? null) && provider.adapterKey === bound.adapterKey;
}

export const PROVIDER_CHANGED_MESSAGE = "The payment provider changed since this card payment started. Reconcile it in the provider dashboard; Gym won't send it to a different account.";

/**
 * The same single-merchant rule as membership checkout applies to every counter charge and refund,
 * and a call for an existing attempt only proceeds with the exact provider record and account it
 * was admitted with: a replaced or re-pointed provider stops it for reconciliation instead of
 * silently routing the money elsewhere. (Credentials stay in the environment; none are copied.)
 */
async function counterAdapter(context: Context, organizationId: string, purpose: Purpose, bound?: CounterProviderBinding | null) {
  const { provider, adapter } = await getAdapterForProvider(context, "pp_stripe", organizationId, purpose);
  if (bound && !sameCounterProvider(provider, bound)) throw new Error(PROVIDER_CHANGED_MESSAGE);
  if (provider.adapterKey === "stripe" && process.env.PAYMENT_TEST_MODE !== "true") {
    const merchants = await context.sudo().query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: "pp_stripe" } }, { adapterKey: { equals: "stripe" } }, purpose === "charge" ? installedPaymentProviderWhere() : reconciliationPaymentProviderWhere()] },
      take: 2, query: "id providerAccountId organization { id }",
    });
    assertSingleMerchantCheckout(merchants, organizationId);
  }
  if (!adapter.createCounterCheckout || !adapter.retrieveCounterCheckout || !adapter.expireCounterCheckout || !adapter.findRefundPayment) {
    throw new Error("Card checkout is not available for this payment provider");
  }
  return { provider, adapter: adapter as typeof adapter & Required<Pick<typeof adapter, "createCounterCheckout" | "retrieveCounterCheckout" | "expireCounterCheckout" | "findRefundPayment">> };
}

/** The provider identity a new counter payment is admitted with (recorded on the attempt). */
export async function counterProviderBinding(context: Context, organizationId: string): Promise<CounterProviderBinding> {
  const { provider } = await counterAdapter(context, organizationId, "charge");
  return { providerId: provider.id, providerAccountId: provider.providerAccountId ?? null, adapterKey: provider.adapterKey };
}

/**
 * The provider that can reconcile (and refund) this organization's card payments now. A refund
 * records the original sale's provider, or this one for a sale taken before sales recorded it,
 * so the refund's retries and status checks stay bound to the account it was issued against.
 */
export async function counterReconcileBinding(context: Context, organizationId: string): Promise<CounterProviderBinding> {
  const { provider } = await counterAdapter(context, organizationId, "reconcile");
  return { providerId: provider.id, providerAccountId: provider.providerAccountId ?? null, adapterKey: provider.adapterKey };
}

/** The provider an attempt recorded; legacy attempts without one are not bound. */
export function attemptProviderBinding(attempt: any): CounterProviderBinding | null {
  const recorded = attempt?.quote?.provider;
  if (recorded?.providerId) return { providerId: String(recorded.providerId), providerAccountId: recorded.providerAccountId ?? null, adapterKey: String(recorded.adapterKey || "stripe") };
  return null;
}

/**
 * The exact hosted-checkout request, fixed once for an attempt and stored before the first
 * create: retries, recovery and cancellation send byte-for-byte the same body under the same key,
 * and its absolute expiry is what proves, once passed, that no checkout from it can be paid.
 */
export type CounterCheckoutRequest = {
  amount: number;
  currencyCode: "USD";
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  metadata: Record<string, string>;
};

export function freezeCounterCheckoutRequest(input: { organizationId: string; attemptId: string; kind: CounterKind; amount: number; description: string; returnPath: string }, now = new Date()): CounterCheckoutRequest {
  if (!Number.isSafeInteger(input.amount) || input.amount < MINIMUM_CARD_AMOUNT) throw new Error("Card payments need a total of at least $0.50");
  const returnUrl = publicAppUrl(input.returnPath);
  const separator = returnUrl.includes("?") ? "&" : "?";
  return {
    amount: input.amount,
    currencyCode: "USD",
    description: input.description.slice(0, 200),
    // Stripe substitutes the literal {CHECKOUT_SESSION_ID} placeholder.
    successUrl: `${returnUrl}${separator}cardCheckout={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnUrl}${separator}cardAttempt=${encodeURIComponent(input.attemptId)}`,
    expiresAt: new Date(Math.floor((now.getTime() + COUNTER_CHECKOUT_MINUTES * 60_000) / 1000) * 1000).toISOString(),
    metadata: { source: COUNTER_SOURCE, kind: input.kind, organizationId: input.organizationId, attemptId: input.attemptId, amount: String(input.amount), currencyCode: "USD" },
  };
}

/** Opens (or, under the same key and body, re-reads) the hosted checkout for a reserved attempt. */
export async function createCounterProviderCheckout(context: Context, organizationId: string, input: {
  request: CounterCheckoutRequest;
  providerKey: string;
  bound: CounterProviderBinding | null;
}) {
  const { adapter } = await counterAdapter(context, organizationId, "charge", input.bound);
  return adapter.createCounterCheckout({ ...input.request, expiresAt: new Date(input.request.expiresAt), idempotencyKey: input.providerKey });
}

export async function retrieveCounterProviderCheckout(context: Context, organizationId: string, checkoutSessionId: string, bound: CounterProviderBinding | null = null) {
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(checkoutSessionId)) throw new Error("Card checkout reference is invalid");
  const { adapter } = await counterAdapter(context, organizationId, "reconcile", bound);
  return adapter.retrieveCounterCheckout(checkoutSessionId);
}

export async function expireCounterProviderCheckout(context: Context, organizationId: string, checkoutSessionId: string, bound: CounterProviderBinding | null = null) {
  const { adapter } = await counterAdapter(context, organizationId, "reconcile", bound);
  return adapter.expireCounterCheckout(checkoutSessionId);
}

/** The provider session's state for exactly this attempt; anything else is rejected. */
export function readCounterCheckout(session: any, expected: { organizationId: string; kind: CounterKind; attemptId: string; amount: number }) {
  const metadata = (session?.metadata || {}) as Record<string, string>;
  if (session?.mode !== "payment" || metadata.source !== COUNTER_SOURCE || metadata.kind !== expected.kind ||
      metadata.organizationId !== expected.organizationId || metadata.attemptId !== expected.attemptId) {
    throw new Error("Card checkout does not belong to this sale");
  }
  if (session.amount_total !== expected.amount || String(session.currency).toUpperCase() !== "USD") {
    throw new Error("Card payment amount does not match the reserved sale; operator reconciliation required");
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (session.status === "complete" && session.payment_status === "paid") {
    if (!paymentIntentId) throw new Error("Card payment reference is missing; check the payment provider");
    return { state: "paid" as const, paymentIntentId };
  }
  if (session.status === "expired") return { state: "expired" as const, paymentIntentId };
  return { state: "open" as const, paymentIntentId };
}

export function assertExactCounterRefund(refund: any, expected: { paymentIntentId: string; amount: number; providerKey: string }) {
  const paymentIntent = typeof refund?.payment_intent === "string" ? refund.payment_intent : refund?.payment_intent?.id;
  if (!refund?.id || paymentIntent !== expected.paymentIntentId || refund.amount !== expected.amount ||
      String(refund.currency || "").toUpperCase() !== "USD" || refund.metadata?.gymRefundOperationKey !== expected.providerKey) {
    throw new Error("Provider refund does not match the reserved refund; operator reconciliation required");
  }
}

/**
 * Finds the refund already issued for this attempt key (even after the provider's
 * idempotency window) before issuing it, so a retry never refunds twice.
 */
export async function findOrCreateCounterRefund(context: Context, organizationId: string, input: {
  paymentIntentId: string;
  amount: number;
  providerKey: string;
  reason: string;
  bound: CounterProviderBinding | null;
}) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) throw new Error("This sale has no card payment to refund");
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) throw new Error("Choose at least one paid unit to refund");
  const { adapter } = await counterAdapter(context, organizationId, "reconcile", input.bound);
  const existing = await adapter.findRefundPayment(input.paymentIntentId, input.providerKey);
  const refund = existing || await adapter.refundPayment(input.paymentIntentId, input.amount, input.providerKey, {
    operationKey: input.providerKey, currencyCode: "USD", reason: input.reason.slice(0, 450),
  });
  assertExactCounterRefund(refund, input);
  return refund;
}
