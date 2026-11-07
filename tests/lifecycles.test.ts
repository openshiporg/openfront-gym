import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_MACHINE, COACHING_MACHINE, GIFT_CARD_MACHINE, MEMBERSHIP_MACHINE, MEMBER_ACCOUNT_MACHINE,
  PAYMENT_SESSION_MACHINE, SUBSCRIPTION_MACHINE, TRAINING_LEAD_MACHINE, TRAINING_PACKAGE_MACHINE,
  assertTransition, canTransition, settleTransition,
} from "../features/keystone/lib/lifecycles";
import { assertAppointmentTransition, allowedAppointmentTransitions } from "../features/keystone/mutations/trainerAppointmentPolicy";
import { assertBookingStatusTransition, assertMembershipStatusTransition } from "../features/keystone/mutations/gymLifecyclePolicy";

const machines = { MEMBERSHIP_MACHINE, SUBSCRIPTION_MACHINE, BOOKING_MACHINE, MEMBER_ACCOUNT_MACHINE, GIFT_CARD_MACHINE, TRAINING_LEAD_MACHINE, COACHING_MACHINE, TRAINING_PACKAGE_MACHINE, PAYMENT_SESSION_MACHINE };

test("every transition target is a declared status", () => {
  for (const [name, machine] of Object.entries(machines)) {
    for (const [from, targets] of Object.entries(machine)) for (const to of targets) assert.ok(Object.hasOwn(machine, to), `${name}: ${from} -> ${to} is undeclared`);
  }
});

test("terminal statuses have no way out", () => {
  for (const [machine, status] of [[MEMBERSHIP_MACHINE, "cancelled"], [SUBSCRIPTION_MACHINE, "cancelled"], [BOOKING_MACHINE, "cancelled"], [MEMBER_ACCOUNT_MACHINE, "cancelled"], [GIFT_CARD_MACHINE, "redeemed"], [GIFT_CARD_MACHINE, "voided"], [COACHING_MACHINE, "reviewed"], [COACHING_MACHINE, "cancelled"], [TRAINING_PACKAGE_MACHINE, "refunded"], [PAYMENT_SESSION_MACHINE, "completed"], [PAYMENT_SESSION_MACHINE, "expired"], [TRAINING_LEAD_MACHINE, "converted"], [TRAINING_LEAD_MACHINE, "closed"]] as const) {
    assert.equal(machine[status].size, 0, status);
  }
});

test("a cancelled membership is never revived by a late provider event", () => {
  assert.throws(() => assertMembershipStatusTransition("cancelled", "active"), /cancelled -> active/);
  assert.equal(settleTransition(MEMBERSHIP_MACHINE, "cancelled", "active"), "cancelled");
  assert.equal(settleTransition(MEMBERSHIP_MACHINE, "cancelled", "past-due"), "cancelled");
  assert.equal(settleTransition(MEMBERSHIP_MACHINE, "active", "frozen"), "frozen");
  assert.equal(settleTransition(MEMBERSHIP_MACHINE, "expired", "active"), "active");
  assert.equal(settleTransition(MEMBERSHIP_MACHINE, undefined, "active"), "active");
});

test("a cancelled subscription projection stays cancelled; a replay of the same status is allowed", () => {
  assert.equal(settleTransition(SUBSCRIPTION_MACHINE, "cancelled", "active"), "cancelled");
  assert.equal(settleTransition(SUBSCRIPTION_MACHINE, "paused", "active"), "active");
  assert.equal(canTransition(SUBSCRIPTION_MACHINE, "cancelled", "cancelled"), true);
});

test("bookings: cancel a cancelled booking is a no-op, a cancelled booking can't be confirmed", () => {
  assertBookingStatusTransition("cancelled", "cancelled");
  assert.throws(() => assertBookingStatusTransition("cancelled", "confirmed"), /cancelled -> confirmed/);
  assert.throws(() => assertBookingStatusTransition("confirmed", "waitlist"), /confirmed -> waitlist/);
  assertBookingStatusTransition("waitlist", "confirmed");
});

test("unknown statuses are refused with a clear error", () => {
  assert.throws(() => assertTransition(BOOKING_MACHINE, "booking", "bogus", "confirmed"), /Unknown booking status: bogus/);
  assert.throws(() => assertTransition(BOOKING_MACHINE, "booking", "confirmed", "attended"), /Unknown booking status: attended/);
});

test("member accounts: a cancelled account can't be reopened, suspended can resume", () => {
  assert.throws(() => assertTransition(MEMBER_ACCOUNT_MACHINE, "member account", "cancelled", "active"), /cancelled -> active/);
  assertTransition(MEMBER_ACCOUNT_MACHINE, "member account", "suspended", "active");
});

test("gift cards: a used-up or refunded card never becomes active again", () => {
  assert.equal(canTransition(GIFT_CARD_MACHINE, "redeemed", "active"), false);
  assert.equal(canTransition(GIFT_CARD_MACHINE, "voided", "active"), false);
  assert.equal(canTransition(GIFT_CARD_MACHINE, "active", "voided"), true);
});

test("checkout sessions: a completed or expired checkout is never reopened", () => {
  assert.equal(canTransition(PAYMENT_SESSION_MACHINE, "completed", "expired"), false);
  assert.equal(canTransition(PAYMENT_SESSION_MACHINE, "expired", "processing"), false);
  assert.equal(canTransition(PAYMENT_SESSION_MACHINE, "failed", "processing"), true);
});

test("training packages: refunded is final", () => {
  assert.equal(canTransition(TRAINING_PACKAGE_MACHINE, "refunded", "active"), false);
});

test("coaching: review needs a submission, cancel only before submission", () => {
  assert.equal(canTransition(COACHING_MACHINE, "assigned", "reviewed"), false);
  assert.equal(canTransition(COACHING_MACHINE, "submitted", "cancelled"), false);
  assert.equal(canTransition(COACHING_MACHINE, "assigned", "submitted"), true);
});

test("leads: no skipping to attended, converted and closed are final", () => {
  assert.equal(canTransition(TRAINING_LEAD_MACHINE, "new", "trial_attended"), false);
  assert.equal(canTransition(TRAINING_LEAD_MACHINE, "closed", "contacted"), false);
});

test("appointments: a checked-in appointment ends completed, it can't be cancelled for a credit", () => {
  assert.throws(() => assertAppointmentTransition("checked_in", "cancelled"), /not allowed/);
  assertAppointmentTransition("checked_in", "completed");
  assert.throws(() => assertAppointmentTransition("completed", "cancelled"), /not allowed/);
  assert.deepEqual(allowedAppointmentTransitions("checked_in", { canManage: true, isOwnCoach: false, isOwnMember: false }), ["completed"]);
  assert.deepEqual(allowedAppointmentTransitions("confirmed", { canManage: false, isOwnCoach: false, isOwnMember: true }), ["cancelled"]);
});
