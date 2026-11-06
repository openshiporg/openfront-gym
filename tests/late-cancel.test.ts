import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLateCancellation, lateCancelWindowHours } from "../features/keystone/mutations/gymLifecycle";
import { normalizeGymSettingsInput } from "../features/keystone/mutations/gymSettingsLifecycle";

const at = (iso: string) => new Date(iso);

test("a cancel inside the club's window is late; outside it, or with no window, it isn't", () => {
  const start = at("2026-11-07T16:00:00Z");
  assert.equal(isLateCancellation(start, at("2026-11-07T05:00:00Z"), 12), true);   // 11h before
  assert.equal(isLateCancellation(start, at("2026-11-07T04:00:00Z"), 12), false);  // exactly 12h before
  assert.equal(isLateCancellation(start, at("2026-11-07T15:00:00Z"), 0), false);   // window off
});

test("the window is read from settings, defaulting to off when missing and capped at 72 hours", async () => {
  const tx = (value: unknown) => ({ gymSettings: { findFirst: async () => (value === undefined ? null : { lateCancelHours: value }) } });
  assert.equal(await lateCancelWindowHours(tx(12), "org"), 12);
  assert.equal(await lateCancelWindowHours(tx(undefined), "org"), 0);
  assert.equal(await lateCancelWindowHours(tx(500), "org"), 72);
});

test("the late-cancel window is whole hours from 0 to 72", () => {
  assert.deepEqual(normalizeGymSettingsInput({ lateCancelHours: 24 }), { lateCancelHours: 24 });
  assert.throws(() => normalizeGymSettingsInput({ lateCancelHours: 1.5 }), /0 to 72/);
  assert.throws(() => normalizeGymSettingsInput({ lateCancelHours: 73 }), /0 to 72/);
});

test("only a member's own cancel is late; it keeps the credit spent and the drop-in fee, and staff cancels stay waived", () => {
  const lifecycle = readFileSync("features/keystone/mutations/gymLifecycle.ts", "utf8");
  assert.match(lifecycle, /const late = !past && booking\.status === "confirmed" && !input\.actor\.canManageAllRecords/);
  assert.match(lifecycle, /booking\.status === "confirmed" && !late && !isDropInBooking\(booking\)\) await restoreBookingCredit/);
  const resolvers = readFileSync("features/keystone/mutations/gymLifecycleResolvers.ts", "utf8");
  assert.match(resolvers, /if \(result\.cancelled && !late\) await refundCancelledDropIns/);
  const dropIn = readFileSync("features/keystone/mutations/dropIn.ts", "utf8");
  assert.match(dropIn, /status: "cancelled", lateCancelled: false/);
});
