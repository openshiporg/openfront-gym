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
    throw new Error("Currency settings do not match this membership agreement; reconcile Organization and Gym Settings before changing tiers.");
  }
  return contractCurrency;
}

export function snapshotMembershipAgreement(
  tier: any,
  billingCycle: BillingCycle,
  currencyCode: string,
  options: { initialCreditLedger?: boolean } = {},
) {
  return {
    version: 1, acceptedAt: new Date().toISOString(), tierId: tier.id, tierName: tier.name,
    billingCycle, currencyCode, amount: tierAmountMinor(tier, billingCycle),
    monthlyPriceMinor: tierAmountMinor(tier, "monthly"), annualPriceMinor: tierAmountMinor(tier, "annual"),
    classCreditsPerMonth: tier.classCreditsPerMonth,
    ...(options.initialCreditLedger ? { creditLedgerPolicy: "monthly-grant-v1" } : {}),
    freezeAllowed: Boolean(tier.freezeAllowed),
    contractLength: tier.contractLength ?? 0, cancellationPolicy: "paid_period_end",
    accessHours: tier.accessHours ?? "", accessHoursJson: tier.accessHoursJson ?? null,
    guestPasses: tier.guestPasses ?? 0, maxClassBookings: tier.maxClassBookings ?? 0, personalTrainingSessions: tier.personalTrainingSessions ?? 0,
  };
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
