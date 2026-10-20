import type { BillingCycle } from "./types";

/** Parse decimal USD catalog input exactly. Reject rounding and unsafe values. */
export function decimalToMinor(value: unknown): number {
  const raw = String(value ?? "");
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(raw)) throw new Error("Membership prices must use at most two decimal places");
  const [whole, fraction = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw new Error("Membership price exceeds supported minor units");
  return amount;
}

export function tierAmountMinor(tier: any, cycle: BillingCycle): number {
  const stored = cycle === "annual" ? tier.annualPriceMinor : tier.monthlyPriceMinor;
  const legacy = decimalToMinor(cycle === "annual" ? tier.annualPrice : tier.monthlyPrice);
  // Null permits a separately reviewed backfill of existing catalogs. Never
  // silently accept drift between compatibility display fields and money truth.
  if (stored == null) return legacy;
  if (!Number.isSafeInteger(stored) || stored < 0 || stored !== legacy) throw new Error("Membership catalog amount requires reconciliation");
  return stored;
}

export function membershipTierChangeCurrency(
  agreementSnapshot: unknown,
  organizationDefaultCurrency: unknown,
  gymSettingsCurrency: unknown,
): "USD" {
  const currency = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";
  const contractCurrency = currency((agreementSnapshot as any)?.currencyCode);
  const organizationCurrency = currency(organizationDefaultCurrency);
  const settingsCurrency = currency(gymSettingsCurrency);
  if (contractCurrency !== "USD") {
    throw new Error("This membership agreement has no supported USD contract currency; reconcile its commercial evidence before changing tiers.");
  }
  if (organizationCurrency !== contractCurrency || settingsCurrency !== contractCurrency) {
    throw new Error("Currency settings do not match this membership agreement; reconcile Organization and Store Settings before changing tiers.");
  }
  return contractCurrency;
}

export function snapshotMembershipAgreement(
  tier: any,
  billingCycle: BillingCycle,
  currencyCode: string,
  options: { initialCreditLedger?: boolean; providerPriceId?: string | null; providerProductId?: string | null } = {},
) {
  return {
    version: 1, acceptedAt: new Date().toISOString(), tierId: tier.id, tierName: tier.name,
    billingCycle, currencyCode, amount: tierAmountMinor(tier, billingCycle),
    // The exact provider price/product the member accepted; later catalog edits don't change it.
    ...(options.providerPriceId ? { providerPriceId: options.providerPriceId, providerProductId: options.providerProductId || null } : {}),
    monthlyPriceMinor: tierAmountMinor(tier, "monthly"), annualPriceMinor: tierAmountMinor(tier, "annual"),
    classCreditsPerMonth: tier.classCreditsPerMonth,
    ...(options.initialCreditLedger ? { creditLedgerPolicy: "monthly-grant-v1" } : {}),
    freezeAllowed: Boolean(tier.freezeAllowed),
    contractLength: tier.contractLength ?? 0, cancellationPolicy: "paid_period_end",
    accessHours: tier.accessHours ?? "", accessHoursJson: tier.accessHoursJson ?? null,
    guestPasses: tier.guestPasses ?? 0, maxClassBookings: tier.maxClassBookings ?? 0, personalTrainingSessions: tier.personalTrainingSessions ?? 0,
  };
}

export type AcceptedProviderPrice = { priceId: string; productId: string | null; amount: number | null; basis: "agreement" | "checkout" | "catalog" };

/**
 * The provider price a membership's accepted agreement bills. Agreements accepted before the
 * price was recorded fall back to the accepting checkout's price, then to the plan's configured
 * price for the accepted cycle; the basis says which, so a mismatch is reported, never trusted.
 */
export function acceptedProviderPrice(agreement: any, fallbacks: { checkoutPriceId?: unknown; checkoutProductId?: unknown; tierPriceId?: unknown }): AcceptedProviderPrice | null {
  const amount = Number.isSafeInteger(agreement?.amount) ? agreement.amount : null;
  const text = (value: unknown) => typeof value === "string" && value ? value : null;
  if (text(agreement?.providerPriceId)) return { priceId: agreement.providerPriceId, productId: text(agreement.providerProductId), amount, basis: "agreement" };
  if (text(fallbacks.checkoutPriceId)) return { priceId: fallbacks.checkoutPriceId as string, productId: text(fallbacks.checkoutProductId), amount, basis: "checkout" };
  if (text(fallbacks.tierPriceId)) return { priceId: fallbacks.tierPriceId as string, productId: null, amount, basis: "catalog" };
  return null;
}

const providerId = (value: any) => typeof value === "string" ? value : value?.id || null;
const cycleInterval = (billingCycle: string) => billingCycle === "annual" ? "year" : "month";

function priceProblem(price: any, quantity: unknown, accepted: AcceptedProviderPrice, billingCycle: string) {
  if (price?.id !== accepted.priceId) return `bills price ${price?.id || "none"} instead of the accepted ${accepted.priceId}`;
  if (accepted.productId && providerId(price?.product) && providerId(price.product) !== accepted.productId) return "bills a different product";
  if ((quantity ?? 1) !== 1) return `bills quantity ${quantity}`;
  if (String(price?.currency || "").toUpperCase() !== "USD") return "bills a currency other than USD";
  if (price?.recurring && (price.recurring.interval !== cycleInterval(billingCycle) || (price.recurring.interval_count ?? 1) !== 1)) return `bills every ${price.recurring.interval_count ?? 1} ${price.recurring.interval} instead of the accepted ${billingCycle} cycle`;
  if (accepted.amount !== null && Number.isSafeInteger(price?.unit_amount) && price.unit_amount !== accepted.amount) return "bills a different amount than the accepted agreement";
  return null;
}

/** Why a provider subscription's items aren't exactly the accepted agreement, or null. */
export function subscriptionItemsProblem(subscription: any, accepted: AcceptedProviderPrice | null, billingCycle: string) {
  if (!accepted) return "no accepted provider price is recorded for this membership";
  const items = subscription?.items?.data || [];
  if (items.length !== 1) return `has ${items.length} billed items instead of one`;
  return priceProblem(items[0].price, items[0].quantity, accepted, billingCycle);
}

/** Why a paid invoice's service lines don't establish the accepted agreement's period, or null. */
export function invoiceServiceProblem(invoice: any, accepted: AcceptedProviderPrice | null, billingCycle: string) {
  if (!accepted) return "no accepted provider price is recorded for this membership";
  const lines = (invoice?.lines?.data || []).filter((line: any) => line.type === "subscription" && !line.proration);
  if (lines.length !== 1) return `has ${lines.length} recurring service lines instead of one`;
  const line = lines[0];
  const problem = priceProblem(line.price, line.quantity, accepted, billingCycle);
  if (problem) return problem;
  if (!Number.isSafeInteger(line.amount) || line.amount <= 0) return "has no positive amount for its service line";
  const start = line.period?.start, end = line.period?.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return "has an invalid service period";
  const days = (end - start) / 86_400;
  if (billingCycle === "annual" ? days < 364 || days > 367 : days < 27 || days > 32) return `covers ${Math.round(days)} days, not one ${billingCycle === "annual" ? "year" : "month"}`;
  return null;
}

export function assertCheckoutCorrelation(local: any, session: any, organizationId: string) {
  if (!local || local.organization?.id !== organizationId) throw new Error("Local payment session not found in organization");
  const metadata = session.metadata || {};
  const legacyAttemptKey = `${local.idempotencyKey}:attempt:${local.data?.checkoutAttempt}`;
  if (metadata.paymentSessionKey !== local.idempotencyKey && metadata.paymentSessionKey !== legacyAttemptKey) throw new Error("Checkout attempt does not match local payment session");
  if (local.providerSessionId && local.providerSessionId !== session.id) throw new Error("Provider checkout session does not match local attempt");
  if (local.user?.id !== metadata.userId || local.membershipTier?.id !== metadata.tierId || local.billingCycle !== metadata.billingCycle) throw new Error("Checkout ownership or commercial metadata does not match");
  if (Number(metadata.amount) !== local.amount || String(metadata.currencyCode).toUpperCase() !== local.currencyCode || String(session.currency).toUpperCase() !== local.currencyCode) throw new Error("Checkout amount or currency does not match local agreement");
  // A complete session can still be unpaid for asynchronous collection.
  if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) throw new Error("Checkout payment is not settled");
}
