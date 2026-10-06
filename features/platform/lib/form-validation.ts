type NumberLike = number | string | null | undefined;

function numberValue(value: NumberLike) {
  return typeof value === "number" ? value : Number(value);
}

function isNonNegativeInteger(value: NumberLike) {
  const number = numberValue(value);
  return Number.isInteger(number) && number >= 0;
}

export function validateLocationDraft(input: { name?: string | null }) {
  return input.name?.trim() ? null : "Enter a location name.";
}

export function validateClassTypeDraft(input: {
  name?: string | null;
  duration?: NumberLike;
  caloriesBurn?: NumberLike;
}) {
  if (!input.name?.trim()) return "Enter a class name.";
  const duration = numberValue(input.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    return "Duration must be a whole number from 1 to 1440 minutes.";
  }
  const calories = numberValue(input.caloriesBurn);
  if (!Number.isInteger(calories) || calories < 0) {
    return "Estimated calories must be a non-negative whole number.";
  }
  return null;
}

export function validateMembershipPlanDraft(input: {
  name?: string | null;
  monthlyPrice?: NumberLike;
  annualPrice?: NumberLike;
  classCreditsPerMonth?: NumberLike;
  guestPasses?: NumberLike;
  personalTrainingSessions?: NumberLike;
  contractLength?: NumberLike;
  maxClassBookings?: NumberLike;
  stripeMonthlyPriceId?: string | null;
  stripeAnnualPriceId?: string | null;
  stripeProductId?: string | null;
}) {
  if (!input.name?.trim()) return "Enter a membership plan name.";
  const monthly = numberValue(input.monthlyPrice);
  const annual = numberValue(input.annualPrice);
  if (!Number.isFinite(monthly) || monthly < 0 || !Number.isFinite(annual) || annual < 0) {
    return "Membership prices must be non-negative numbers.";
  }
  const credits = numberValue(input.classCreditsPerMonth);
  if (!Number.isInteger(credits) || credits < -1) {
    return "Class credits must be -1 for unlimited or a non-negative whole number.";
  }
  const counts: Array<[string, NumberLike]> = [
    ["Guest passes", input.guestPasses],
    ["Personal training sessions", input.personalTrainingSessions],
    ["Contract length", input.contractLength],
    ["Maximum class bookings", input.maxClassBookings],
  ];
  const invalidCount = counts.find(([, value]) => !isNonNegativeInteger(value));
  if (invalidCount) return `${invalidCount[0]} must be a non-negative whole number.`;

  const monthlyPriceId = input.stripeMonthlyPriceId?.trim() || "";
  const annualPriceId = input.stripeAnnualPriceId?.trim() || "";
  const productId = input.stripeProductId?.trim() || "";
  if (monthlyPriceId && !/^price_[A-Za-z0-9]+$/.test(monthlyPriceId)) return "Monthly Stripe Price ID is invalid.";
  if (annualPriceId && !/^price_[A-Za-z0-9]+$/.test(annualPriceId)) return "Annual Stripe Price ID is invalid.";
  if (productId && !/^prod_[A-Za-z0-9]+$/.test(productId)) return "Stripe Product ID is invalid.";
  if ((monthlyPriceId || annualPriceId) && !productId) return "A Stripe Product ID is required with checkout Price IDs.";
  return null;
}
