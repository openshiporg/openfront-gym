export const CHECKOUT_RETURN_COOKIE = "gym-membership-checkout-return";

export type CheckoutResult =
  | { success: true; url: string; paymentSessionId: string }
  | { success: false; error: string };

export function publicCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("already has a current membership")) {
    return "This account already has a current membership. Manage it from your account.";
  }
  if (normalized.includes("usd only")) {
    return "Online membership checkout is available in USD only for this launch.";
  }
  if (normalized.includes("already being prepared") || normalized.includes("already in progress")) {
    return "A membership checkout is already in progress. Wait a moment and try again.";
  }
  if (normalized.includes("not configured") || normalized.includes("not installed") || normalized.includes("stripe")) {
    return "Secure online checkout is not available for this plan. Contact the front desk before paying.";
  }
  return "Secure checkout could not be started. No payment was taken; try again or contact the front desk.";
}
