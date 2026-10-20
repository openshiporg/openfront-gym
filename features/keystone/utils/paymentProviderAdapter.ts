import { installedPaymentProviderWhere, newPaymentChargesEnabled, reconciliationPaymentProviderWhere } from "../lib/stripe-environment-provider";
import type { Context } from ".keystone/types";
import { getPaymentProviderAdapterForExecution } from "../../integrations/payment";

export type PaymentProviderRecord = {
  id: string;
  code: string;
  adapterKey: string;
  providerAccountId?: string | null;
  isInstalled: boolean;
  organization?: { id: string } | null;
};

/** "charge" admits new payments; "reconcile" only works on obligations that already exist. */
export type PaymentProviderPurpose = "charge" | "reconcile";

const PROVIDER_QUERY = "id code adapterKey providerAccountId isInstalled organization { id }";

export async function getPaymentProvider(
  context: Context,
  providerCode: string,
  organizationId: string,
  purpose: PaymentProviderPurpose = "charge",
): Promise<PaymentProviderRecord> {
  if (!organizationId) throw new Error("Payment provider organization is required.");
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      AND: [
        { code: { equals: providerCode } },
        purpose === "charge" ? installedPaymentProviderWhere() : reconciliationPaymentProviderWhere(),
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: PROVIDER_QUERY,
  });
  const provider = providers[0] as PaymentProviderRecord | undefined;
  if (!provider) throw new Error(`Payment provider ${providerCode} is not installed.`);
  if (purpose === "charge" && provider.adapterKey === "stripe" && !newPaymentChargesEnabled() && process.env.PAYMENT_TEST_MODE !== "true") {
    throw new Error("Card payments are turned off for this Gym deployment.");
  }
  return provider;
}

export async function getAdapterForProvider(
  context: Context,
  providerCode: string,
  organizationId: string,
  purpose: PaymentProviderPurpose = "charge",
) {
  const provider = await getPaymentProvider(context, providerCode, organizationId, purpose);
  const adapter = await getPaymentProviderAdapterForExecution(provider.adapterKey);
  return { provider, adapter };
}
