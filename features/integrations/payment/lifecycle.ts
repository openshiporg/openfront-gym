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
    case "trialing":
      return "active";
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
