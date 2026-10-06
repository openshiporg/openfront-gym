import { createHash } from "node:crypto";
import type { BillingCycle } from "./types";

export function createMembershipCheckoutIdempotencyKey(input: {
  userId: string;
  tierId: string;
  billingCycle: BillingCycle;
}) {
  // One durable local checkout lane per member prevents simultaneous tier or
  // billing-cycle checkouts from creating multiple provider subscriptions.
  return `gym-membership:${createHash("sha256")
    .update(input.userId)
    .digest("hex")}`;
}

export function mapStripeStatusToMembership(status: string, collectionPaused = false) {
  if (collectionPaused) return "frozen";
  switch (status) {
    case "active":
      return "active";
    // This Gym checkout flow has no contracted free-trial entitlement. Stripe's
    // display status alone must not grant service or credits.
    case "trialing":
      return "past-due";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past-due";
    case "canceled":
      return "cancelled";
    case "paused":
      return "frozen";
    default:
      return "past-due";
  }
}
