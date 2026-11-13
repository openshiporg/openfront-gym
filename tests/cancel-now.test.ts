import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCancelNowForm } from "../features/platform/billing/lib/cancel-renewal";
import { mapStripeStatusToMembership } from "../features/integrations/payment/lifecycle";

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
const valid = { membershipId: "ms_1", reason: " Member request ", idempotencyKey: "0123456789abcdef", confirmCancelNow: "yes" };
const source = (path: string) => readFileSync(path, "utf8");

test("a confirmed cancel now with a reason is sent with its request key", () => {
  assert.deepEqual(parseCancelNowForm(form(valid)), { membershipId: "ms_1", reason: "Member request", idempotencyKey: "0123456789abcdef" });
});

test("nothing is sent without the confirmation, a reason, a membership or a request key", () => {
  assert.throws(() => parseCancelNowForm(form({ ...valid, confirmCancelNow: "" })), /membership ends now/);
  assert.throws(() => parseCancelNowForm(form({ ...valid, confirmCancelRenewal: "yes", confirmCancelNow: "" })), /membership ends now/);
  assert.throws(() => parseCancelNowForm(form({ ...valid, reason: " " })), /reason between 3 and 500/);
  assert.throws(() => parseCancelNowForm(form({ ...valid, membershipId: "" })), /Choose the membership/);
  assert.throws(() => parseCancelNowForm(form({ ...valid, idempotencyKey: "short" })), /request key/);
});

test("an ended provider subscription maps to a cancelled membership, the same state the webhook applies", () => {
  assert.equal(mapStripeStatusToMembership("canceled"), "cancelled");
});

test("cancel now cancels once with Stripe, ends the membership now, makes no refund, and is a no-op once ended", () => {
  const stripe = source("features/integrations/payment/stripe-adapter.ts");
  assert.match(stripe, /subscriptions\.cancel\(\s*subscriptionId,\s*\{\},/);
  const mutation = source("features/keystone/mutations/stripeSubscription.ts");
  const body = mutation.slice(mutation.indexOf("export async function cancelMembershipNow"), mutation.indexOf("export async function freezeMembership"));
  assert.equal((body.match(/adapter\.cancelSubscriptionNow\(/g) || []).length, 1);
  assert.doesNotMatch(body, /cancelSubscriptionAtPeriodEnd|refundGymPayment|refunds\.create/);
  assert.match(body, /status: "cancelled"/);
  assert.match(body, /cancelledAt: endedAt/);
  // already ended (here or by the webhook): Stripe is never called again
  assert.ok(body.indexOf('["cancelled", "expired"].includes(membership.status)') < body.indexOf("adapter.cancelSubscriptionNow"));
  // completed attempt (same key) replays without calling Stripe
  assert.ok(body.indexOf("isCompletedMembershipBillingAttempt") < body.indexOf("adapter.cancelSubscriptionNow"));
});

test("the later customer.subscription.deleted event is idempotent and keeps the first cancellation time", () => {
  const webhook = source("features/keystone/mutations/paymentWebhook.ts");
  assert.match(webhook, /event\.id === existingProjection\.providerEventId/);
  assert.match(webhook, /membership\?\.status === "cancelled" && membership\.cancelledAt \? membership\.cancelledAt : eventTime/);
});

test("period-end cancel is unchanged", () => {
  const mutation = source("features/keystone/mutations/stripeSubscription.ts");
  const body = mutation.slice(mutation.indexOf("export async function cancelMembership("), mutation.indexOf("export async function cancelMembershipNow"));
  assert.match(body, /adapter\.cancelSubscriptionAtPeriodEnd\(/);
  assert.match(body, /autoRenew: false,\s*nextBillingDate: providerPeriodEnd/);
  assert.doesNotMatch(body, /cancelSubscriptionNow/);
});

test("cancel now releases the member's upcoming bookings through the normal booking cancel", () => {
  const lifecycle = source("features/keystone/mutations/gymLifecycle.ts");
  const release = lifecycle.slice(lifecycle.indexOf("export async function releaseFutureBookingsForEndedMembership"));
  // only classes that haven't started, confirmed or waitlisted, never a cancelled class
  assert.match(release, /status: \{ in: \["confirmed", "waitlist"\] \}/);
  assert.match(release, /classInstance: \{ date: \{ gt: new Date\(\) \}, isCancelled: false \}/);
  // the same path as a member cancel: credit restore, waitlist promotion and the member notice
  assert.match(release, /cancelCapacityControlledBooking\(prisma, \{ bookingId: booking\.id, actor \}\)/);
  const mutation = source("features/keystone/mutations/stripeSubscription.ts");
  const body = mutation.slice(mutation.indexOf("export async function cancelMembershipNow"), mutation.indexOf("export async function freezeMembership"));
  assert.ok(body.lastIndexOf("releaseFutureBookingsForEndedMembership") > body.indexOf("finishMembershipBillingAttempt"));
  // an already-ended membership still sweeps leftovers (idempotent)
  assert.ok(body.indexOf("releaseFutureBookingsForEndedMembership") < body.indexOf("adapter.cancelSubscriptionNow"));
  // renewal cancel keeps bookings inside the paid period
  const renewal = mutation.slice(mutation.indexOf("export async function cancelMembership("), mutation.indexOf("export async function cancelMembershipNow"));
  assert.doesNotMatch(renewal, /releaseFutureBookingsForEndedMembership/);
});

test("a membership ended by Stripe (webhook) also releases upcoming bookings, after its transaction commits", () => {
  const webhook = source("features/keystone/mutations/paymentWebhook.ts");
  const body = webhook.slice(webhook.indexOf("export async function syncSubscription"), webhook.indexOf("export async function recordInvoicePayment"));
  assert.match(body, /endedUserId: reconciled\?\.status === "cancelled"/);
  assert.ok(body.indexOf("releaseFutureBookingsForEndedMembership") > body.indexOf("}, { maxWait: 10_000, timeout: 30_000 });"));
});
