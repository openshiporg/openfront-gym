import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseKioskCheckIn, parseKioskGuest, parseKioskSearch, parseKioskUnlock } from "../features/platform/kiosk/input";
import { kioskSessionCookieOptions } from "../features/kiosk/auth";

test("the kiosk has no REST routes and the page calls no /api endpoints", () => {
  for (const route of ["check-in", "guest-check-in", "search-member", "session"]) {
    assert.equal(existsSync(`app/api/kiosk/${route}/route.ts`), false, route);
  }
  assert.doesNotMatch(readFileSync("features/kiosk/screens/KioskCheckInPage.tsx", "utf8"), /fetch\(/);
});

test("the kiosk session cookie reaches the kiosk page that runs the actions", () => {
  assert.equal(kioskSessionCookieOptions().path, "/kiosk");
  assert.equal(kioskSessionCookieOptions().httpOnly, true);
});

test("kiosk check-in input needs a member id or QR code within limits", () => {
  assert.deepEqual(parseKioskCheckIn({ memberId: " m1 " }), { ok: true, data: { memberId: "m1", qrCode: null, locationId: null } });
  assert.equal(parseKioskCheckIn({}).ok, false);
  assert.equal(parseKioskCheckIn({ memberId: 5 as any }).ok, false);
  assert.equal(parseKioskCheckIn({ qrCode: "x".repeat(4097) }).ok, false);
});

test("guest check-in needs a name and a request key; search and unlock are bounded", () => {
  assert.equal(parseKioskGuest({ name: "Ana", idempotencyKey: "0123456789ab" }).ok, true);
  assert.equal(parseKioskGuest({ name: "", idempotencyKey: "0123456789ab" }).ok, false);
  assert.equal(parseKioskGuest({ name: "Ana", idempotencyKey: "short" }).ok, false);
  assert.deepEqual(parseKioskSearch("a"), { ok: true, data: null });
  assert.deepEqual(parseKioskSearch(" ana "), { ok: true, data: "ana" });
  assert.equal(parseKioskSearch("x".repeat(101)).ok, false);
  assert.equal(parseKioskUnlock("").ok, false);
  assert.equal(parseKioskUnlock("x".repeat(513)).ok, false);
});
