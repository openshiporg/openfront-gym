import type { PaymentProviderAdapter } from "./types";

// This is the production admission list, matching the GOLD provider registries.
// Synthetic adapters are never selected by a persisted PaymentProvider.adapterKey.
const paymentProviderAdapters = {
  stripe: () => import("./stripe-adapter"),
} as const;

export type PaymentAdapterKey = keyof typeof paymentProviderAdapters;

export async function getPaymentProviderAdapter(adapterKey: string): Promise<PaymentProviderAdapter> {
  const loadAdapter = paymentProviderAdapters[adapterKey as PaymentAdapterKey];
  if (!loadAdapter) throw new Error(`Unsupported payment provider adapter: ${adapterKey}`);

  const loadedAdapter = await loadAdapter();
  return (loadedAdapter as typeof import("./stripe-adapter")).stripePaymentProviderAdapter;
}

/** Explicit, non-production test mode for isolated offline fixtures only. */
export async function getPaymentProviderAdapterForExecution(adapterKey: string): Promise<PaymentProviderAdapter> {
  if (adapterKey === "test") {
    throw new Error("Synthetic test adapters cannot be selected from persisted payment provider configuration.");
  }
  if (process.env.PAYMENT_TEST_MODE === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PAYMENT_TEST_MODE is prohibited in production.");
    }
    if (adapterKey === "stripe") {
      const { testPaymentProviderAdapter } = await import("./test-adapter");
      return testPaymentProviderAdapter;
    }
  }
  return getPaymentProviderAdapter(adapterKey);
}

export { paymentProviderAdapters };
export type { BillingCycle, MembershipCheckoutInput, MembershipCheckoutResult, PaymentProviderAdapter } from "./types";
