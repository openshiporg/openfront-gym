const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]+$/;
const STRIPE_PRODUCT_ID = /^prod_[A-Za-z0-9]+$/;

function finiteNonNegative(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function optionalProviderId(value: unknown, pattern: RegExp, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized && !pattern.test(normalized)) {
    throw new Error(`${label} is not a valid Stripe identifier.`);
  }
  return normalized;
}

export function validateMembershipPlanInput(data: Record<string, unknown>) {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || name.length > 120) {
    throw new Error("Plan name must be between 1 and 120 characters.");
  }
  finiteNonNegative(data.monthlyPrice, "Monthly price");
  finiteNonNegative(data.annualPrice, "Annual price");

  const credits = Number(data.classCreditsPerMonth);
  if (!Number.isInteger(credits) || credits < -1) {
    throw new Error("Class credits must be -1 for unlimited or a non-negative whole number.");
  }

  const monthlyPriceId = optionalProviderId(
    data.stripeMonthlyPriceId,
    STRIPE_PRICE_ID,
    "Monthly price ID",
  );
  const annualPriceId = optionalProviderId(
    data.stripeAnnualPriceId,
    STRIPE_PRICE_ID,
    "Annual price ID",
  );
  const productId = optionalProviderId(
    data.stripeProductId,
    STRIPE_PRODUCT_ID,
    "Product ID",
  );
  if ((monthlyPriceId || annualPriceId) && !productId) {
    throw new Error("A Stripe product ID is required before a checkout Price can be published.");
  }

  return {
    ...data,
    name,
    stripeMonthlyPriceId: monthlyPriceId,
    stripeAnnualPriceId: annualPriceId,
    stripeProductId: productId,
  };
}

export function membershipCheckoutReadiness(input: {
  providerInstalled: boolean;
  monthlyPriceId?: string | null;
  annualPriceId?: string | null;
  productId?: string | null;
}) {
  const productConfigured = Boolean(input.productId?.trim());
  const monthly = Boolean(input.providerInstalled && productConfigured && input.monthlyPriceId?.trim());
  const annual = Boolean(input.providerInstalled && productConfigured && input.annualPriceId?.trim());
  return {
    monthly,
    annual,
    any: monthly || annual,
    message: !input.providerInstalled
      ? "Stripe server integration is not installed. Public checkout remains unavailable."
      : !productConfigured
        ? "Add the Stripe product ID before publishing checkout Prices."
        : !monthly && !annual
          ? "Add at least one Stripe recurring Price ID to enable customer checkout."
          : "Customer checkout is configured; provider truth is revalidated before every checkout.",
  };
}
