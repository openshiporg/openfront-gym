import type { PaymentProviderAdapter } from "./types";

const paymentProviderAdapters = {
  stripe: () => import("./stripe-adapter"),
  test: () => import("./test-adapter"),
} as const;

export type PaymentAdapterKey = keyof typeof paymentProviderAdapters;

export async function getPaymentProviderAdapter(adapterKey: string): Promise<PaymentProviderAdapter> {
  const loadAdapter = paymentProviderAdapters[adapterKey as PaymentAdapterKey];
  if (!loadAdapter) throw new Error(`Unsupported payment provider adapter: ${adapterKey}`);

  const loadedAdapter = await loadAdapter();
  if (adapterKey === "stripe") return (loadedAdapter as typeof import("./stripe-adapter")).stripePaymentProviderAdapter;
  return (loadedAdapter as typeof import("./test-adapter")).testPaymentProviderAdapter;
}

export { paymentProviderAdapters };
export type { BillingCycle, MembershipCheckoutInput, MembershipCheckoutResult, PaymentProviderAdapter } from "./types";
