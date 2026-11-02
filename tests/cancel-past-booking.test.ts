import test from "node:test";
import assert from "node:assert/strict";
import { cancelCapacityControlledBooking } from "../features/keystone/mutations/gymLifecycle";

const ORG = "org_1";
const operator = { userId: "staff_1", organizationId: ORG, canManageAllRecords: true };
const HOUR = 60 * 60 * 1000;

function fakePrisma(opts: { attended?: boolean; startsIn?: number; status?: string; debit?: boolean } = {}) {
  const log = { bookingUpdates: [] as any[], notices: [] as any[], credits: [] as any[], promotions: 0 };
  const booking = {
    id: "booking_1",
    memberId: "member_1",
    classInstanceId: "class_1",
    status: opts.status ?? "confirmed",
    classInstance: { id: "class_1", date: new Date(Date.now() + (opts.startsIn ?? -HOUR)), organizationId: ORG, isCancelled: false },
    member: { organizationId: ORG, user: { id: "user_1", membership: null } },
  };
  const scoped = (where: any) => where.id === booking.id && where.organizationId === ORG;
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ locked: true }],
    classBooking: {
      findFirst: async ({ where }: any) => (scoped(where) ? booking : null),
      findMany: async () => [],
      update: async (args: any) => { log.bookingUpdates.push(args); return args; },
    },
    attendanceRecord: {
      findFirst: async ({ where }: any) => (opts.attended && where.bookingId === booking.id && where.organizationId === ORG ? { id: "att_1" } : null),
    },
    membershipCreditEntry: {
      findUnique: async ({ where }: any) => (where.key === "booking_1:debit" && opts.debit !== false ? { grantId: "grant_1", delta: -1 } : null),
      create: async (args: any) => { log.credits.push(args.data); return args.data; },
    },
    membershipCreditGrant: {
      findUnique: async () => ({ id: "grant_1", organizationId: ORG, membershipId: "ms_1", allowance: 8, remaining: 3 }),
      findFirst: async () => null,
      update: async (args: any) => { log.credits.push({ grantUpdate: args.data }); return args; },
    },
    membership: { findUnique: async () => null, update: async () => null },
    operationalNotice: { upsert: async (args: any) => { log.notices.push(args.create); return args.create; } },
    classInstance: { findFirst: async () => { log.promotions += 1; return null; } },
  };
  return { prisma: { $transaction: async (fn: any) => fn(tx) }, log };
}

test("staff can cancel an unmarked confirmed booking after the class started; credit and notice match a normal cancel", async () => {
  const { prisma, log } = fakePrisma();
  const result = await cancelCapacityControlledBooking(prisma, { bookingId: "booking_1", actor: operator, pastBookingReason: "  QA test cleanup " });
  assert.equal(result.cancelled, true);
  assert.equal(log.bookingUpdates[0].data.status, "cancelled");
  assert.ok(log.credits.some((entry) => entry.key === "booking_1:restore" && entry.kind === "restoration"), "credit restored like a normal cancel");
  assert.equal(log.notices.length, 1);
  assert.equal(log.notices[0].kind, "cancellation");
  assert.deepEqual(log.notices[0].history.map((h: any) => [h.action, h.actorId, h.note]), [["past_booking_cancelled", "staff_1", "QA test cleanup"]]);
  assert.equal(result.promotion.promoted, false);
  assert.equal(log.promotions, 0, "no waitlist promotion for a class that already started");
});

test("blocked when the booking has an attendance mark", async () => {
  const { prisma, log } = fakePrisma({ attended: true });
  await assert.rejects(cancelCapacityControlledBooking(prisma, { bookingId: "booking_1", actor: operator, pastBookingReason: "QA test cleanup" }), /attendance mark; undo the check-in first/);
  assert.equal(log.bookingUpdates.length + log.notices.length + log.credits.length, 0);
});

test("blocked for another organization's staff", async () => {
  const { prisma, log } = fakePrisma();
  await assert.rejects(cancelCapacityControlledBooking(prisma, { bookingId: "booking_1", actor: { ...operator, organizationId: "org_2" }, pastBookingReason: "QA test cleanup" }), /Booking not found/);
  assert.equal(log.bookingUpdates.length, 0);
});

test("requires a reason, operator rights, a started class and a confirmed booking", async () => {
  const run = (opts: any, actor: any, reason: string) => cancelCapacityControlledBooking(fakePrisma(opts).prisma, { bookingId: "booking_1", actor, pastBookingReason: reason });
  await assert.rejects(run({}, operator, " "), /reason between 3 and 1000/);
  await assert.rejects(run({}, { ...operator, canManageAllRecords: false }, "QA test cleanup"), /permission required/);
  await assert.rejects(run({ startsIn: HOUR }, operator, "QA test cleanup"), /hasn't started; use the normal cancel/);
  await assert.rejects(run({ status: "waitlist" }, operator, "QA test cleanup"), /Only a confirmed booking/);
});

test("the normal cancel still refuses after the class starts", async () => {
  await assert.rejects(cancelCapacityControlledBooking(fakePrisma().prisma, { bookingId: "booking_1", actor: operator }), /cannot be cancelled after the class starts/);
});
