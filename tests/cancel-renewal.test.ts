import test from "node:test";
import assert from "node:assert/strict";
import { parseCancelRenewalForm } from "../features/platform/billing/lib/cancel-renewal";

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
const valid = { membershipId: "ms_1", reason: " Member request ", idempotencyKey: "0123456789abcdef", confirmCancelRenewal: "yes" };

test("a confirmed staff renewal cancel with a reason is sent with its request key", () => {
  assert.deepEqual(parseCancelRenewalForm(form(valid)), { membershipId: "ms_1", reason: "Member request", idempotencyKey: "0123456789abcdef" });
});

test("nothing is sent without the confirmation, a reason, a membership or a request key", () => {
  assert.throws(() => parseCancelRenewalForm(form({ ...valid, confirmCancelRenewal: "" })), /Confirm that renewal ends/);
  assert.throws(() => parseCancelRenewalForm(form({ ...valid, reason: "  " })), /reason between 3 and 500/);
  assert.throws(() => parseCancelRenewalForm(form({ ...valid, reason: "x".repeat(501) })), /reason between 3 and 500/);
  assert.throws(() => parseCancelRenewalForm(form({ ...valid, membershipId: "" })), /Choose the membership/);
  assert.throws(() => parseCancelRenewalForm(form({ ...valid, idempotencyKey: "short" })), /request key/);
});
