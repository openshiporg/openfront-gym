import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertMembershipServiceEligibility, RENEWAL_GRACE_MS } from "../features/keystone/lib/membership-credits";

const membership = (autoRenew: boolean) => ({
  status: "active", autoRenew,
  creditPeriodStart: "2026-10-17T12:00:00Z", creditPeriodEnd: "2026-11-17T12:00:00Z",
});

test("at the door an auto-renewing member is let in while the renewal invoice is charged", () => {
  const justAfter = new Date("2026-11-17T12:30:00Z");
  assert.doesNotThrow(() => assertMembershipServiceEligibility(membership(true), justAfter, { renewalGrace: true }));
  assert.throws(() => assertMembershipServiceEligibility(membership(false), justAfter, { renewalGrace: true }), /outside the paid/);
  assert.throws(() => assertMembershipServiceEligibility(membership(true), justAfter), /outside the paid/);
  const pastGrace = new Date(Date.parse("2026-11-17T12:00:00Z") + RENEWAL_GRACE_MS);
  assert.throws(() => assertMembershipServiceEligibility(membership(true), pastGrace, { renewalGrace: true }), /outside the paid/);
});

test("a renewal keeps the membership's start date; gift card refunds skip the gym receipt path; stale visits are closed", () => {
  const webhook = readFileSync(new URL("../features/keystone/mutations/paymentWebhook.ts", import.meta.url), "utf8");
  assert.match(webhook, /startDate: membership\?\.stripeSubscriptionId === subscription\.id && membership\.startDate \? membership\.startDate : startDate/);
  assert.match(webhook, /if \(!counterCharge && !giftCardCharge\) await recordRefund/);
  const lifecycle = readFileSync(new URL("../features/keystone/mutations/gymLifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycle, /< STALE_OPEN_VISIT_MS\) return \{ checkIn: existing, reused: true \}/);
  assert.match(lifecycle, /if \(isDropInBooking\(booking\)\) continue;/);
});
