import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { minimumTermCancelProblem, minimumTermEnd } from "../features/keystone/mutations/stripeSubscription";

test("a member can't cancel renewal inside the minimum term they agreed to", () => {
  const membership = { startDate: "2026-09-15T00:00:00Z", agreementSnapshot: { contractLength: 12 } };
  assert.equal(minimumTermEnd(membership)?.toISOString(), "2027-09-15T00:00:00.000Z");
  assert.match(minimumTermCancelProblem(membership, new Date("2026-11-07T00:00:00Z")) || "", /12-month minimum term.*September 15, 2027/);
  assert.equal(minimumTermCancelProblem(membership, new Date("2027-09-15T00:00:00Z")), null);
});

test("no minimum term means renewal can be cancelled any time; the accepted snapshot wins over the tier", () => {
  assert.equal(minimumTermCancelProblem({ startDate: "2026-11-01T00:00:00Z", agreementSnapshot: { contractLength: 0 } }), null);
  assert.equal(minimumTermCancelProblem({ startDate: "2026-11-01T00:00:00Z", tier: { contractLength: 0 } }), null);
  assert.equal(minimumTermCancelProblem({ startDate: null, agreementSnapshot: { contractLength: 12 } }), null);
  assert.equal(minimumTermCancelProblem({ startDate: "2026-11-01T00:00:00Z", agreementSnapshot: { contractLength: 0 }, tier: { contractLength: 12 } }), null);
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ending a membership today is refused to members before any lookup or provider call", () => {
  const body = source("features/keystone/mutations/stripeSubscription.ts").split("export async function cancelMembershipNow")[1].split("export async function")[0];
  assert.ok(body.indexOf("canManageAllRecords") > -1 && body.indexOf("canManageAllRecords") < body.indexOf("getAuthorizedMembership"));
  assert.ok(body.indexOf("Only the front desk") < body.indexOf("claimMembershipBillingAttempt"));
});

test("records that history or access depends on can't be deleted out from under it", () => {
  for (const [file, guard] of [
    ["ClassType", "classSchedule.count"],
    ["Exercise", "workoutSet.count"],
    ["PaymentProvider", "gymPayment.count"],
    ["Role", "user.count"],
  ]) {
    const model = source(`features/keystone/models/${file}.ts`);
    assert.match(model, /validateDelete/, `${file} has a delete guard`);
    assert.ok(model.includes(guard), `${file} counts ${guard}`);
  }
});

test("the database refuses out-of-range money, credits, stock and backwards times", () => {
  const sql = source("migrations/20261107120000_gym_money_and_time_invariants/migration.sql");
  for (const name of [
    "GiftCard_balance_range", "TrainingPackage_credit_range", "TrainingPackage_refund_range", "RetailItem_stock_price_nonnegative",
    "GymPayment_refund_range", "MembershipPayment_refund_range", "MembershipCreditGrant_remaining_range",
    "MembershipCreditGrant_period_order", "TrainerAppointment_time_order", "ClassInstance_time_order", "RetailClose_period_order",
    "GymPayment_organization_paymentIntent_key",
  ]) assert.ok(sql.includes(`"${name}"`), name);
  assert.match(sql, /RAISE EXCEPTION/);
});
