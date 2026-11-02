import test from "node:test";
import assert from "node:assert/strict";
import {
  formatClassCreditsLeft,
  formatCreditValue,
  formatCreditsLeft,
  isClassCreditField,
} from "../lib/class-credits";

test("the -1 sentinel reads as Unlimited, never as -1", () => {
  assert.equal(formatCreditValue(-1), "Unlimited");
  assert.equal(formatCreditsLeft(-1), "Unlimited");
  assert.equal(formatCreditsLeft(-1, -1), "Unlimited");
  assert.equal(formatCreditsLeft(5, -1), "Unlimited");
  assert.equal(formatClassCreditsLeft(-1), "Unlimited classes");
});

test("finite allowances and balances keep their numbers", () => {
  assert.equal(formatCreditValue(4), "4");
  assert.equal(formatCreditValue(0), "0");
  assert.equal(formatCreditsLeft(3, 4), "3 of 4 left");
  assert.equal(formatCreditsLeft(3), "3 left");
  assert.equal(formatCreditsLeft(0, 0), "0 left");
  assert.equal(formatClassCreditsLeft(1), "1 class credit left");
  assert.equal(formatClassCreditsLeft(3), "3 class credits left");
});

test("missing values stay empty so callers choose their placeholder", () => {
  assert.equal(formatCreditValue(null), null);
  assert.equal(formatCreditValue(undefined), null);
  assert.equal(formatCreditsLeft(undefined), null);
  assert.equal(formatClassCreditsLeft(null), null);
});

test("only the class-credit integer fields get the Unlimited label in the admin", () => {
  assert.equal(isClassCreditField("MembershipTier", "classCreditsPerMonth"), true);
  assert.equal(isClassCreditField("Membership", "classCreditsRemaining"), true);
  assert.equal(isClassCreditField("MembershipTier", "guestPasses"), false);
  assert.equal(isClassCreditField(undefined, "classCreditsPerMonth"), false);
});
