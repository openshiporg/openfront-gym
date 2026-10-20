/**
 * Explicit deployment activation avoids changing the seeded provider record.
 *
 * Two admissions: `installedPaymentProviderWhere` admits NEW charges (checkout, counter card
 * sales, plan changes) and requires STRIPE_ENABLED=true for the environment-backed provider.
 * `reconciliationPaymentProviderWhere` admits verification and reconciliation of obligations
 * that already exist at the provider (signed webhooks, refunds, subscription status), which
 * must keep working after new checkout is switched off while its credentials remain.
 */
function environmentProviderWhere(requireNewCharges: boolean) {
  const organizationId = process.env.STOREFRONT_ORGANIZATION_ID;
  if (process.env.STRIPE_USE_ENVIRONMENT_PROVIDER !== 'true' || (requireNewCharges && process.env.STRIPE_ENABLED !== 'true') ||
      !organizationId || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return { isInstalled: { equals: true } };
  }
  return { OR: [
    { isInstalled: { equals: true } },
    { code: { equals: 'pp_stripe' }, adapterKey: { equals: 'stripe' }, organization: { id: { equals: organizationId } } },
  ] };
}

export function installedPaymentProviderWhere() {
  return environmentProviderWhere(true);
}

export function reconciliationPaymentProviderWhere() {
  return environmentProviderWhere(false);
}

/** New provider charges are admitted only when the deployment explicitly enables them. */
export function newPaymentChargesEnabled() {
  return process.env.STRIPE_ENABLED === 'true';
}
