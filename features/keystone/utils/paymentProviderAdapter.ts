import type { Context } from ".keystone/types";
import { getPaymentProviderAdapter } from "../../integrations/payment";

export type PaymentProviderRecord = {
  id: string;
  code: string;
  adapterKey: string;
  providerAccountId?: string | null;
  isInstalled: boolean;
  organization?: { id: string } | null;
};

const PROVIDER_QUERY = "id code adapterKey providerAccountId isInstalled organization { id }";

export async function getPaymentProvider(
  context: Context,
  providerCode: string,
  organizationId: string
): Promise<PaymentProviderRecord> {
  if (!organizationId) throw new Error("Payment provider organization is required.");
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      AND: [
        { code: { equals: providerCode } },
        { isInstalled: { equals: true } },
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: PROVIDER_QUERY,
  });
  const provider = providers[0] as PaymentProviderRecord | undefined;
  if (!provider) throw new Error(`Payment provider ${providerCode} is not installed.`);
  return provider;
}

export async function getAdapterForProvider(
  context: Context,
  providerCode: string,
  organizationId: string
) {
  const provider = await getPaymentProvider(context, providerCode, organizationId);
  const adapterKey =
    process.env.PAYMENT_TEST_MODE === "true" && provider.adapterKey === "stripe"
      ? "test"
      : provider.adapterKey;
  const adapter = await getPaymentProviderAdapter(adapterKey);
  return { provider, adapter };
}
