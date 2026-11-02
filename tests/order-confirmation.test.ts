import assert from "node:assert/strict";
import test from "node:test";
import { deliverBookingConfirmation, deliverMembershipConfirmation } from "../features/keystone/lib/order-confirmation";

function configure(on: boolean) {
  process.env.MAIL_ENABLED = on ? "true" : "false";
  process.env.SMTP_HOST = "smtp.test"; process.env.SMTP_FROM = "club@test.dev";
  process.env.NEXTAUTH_URL = "https://club.test";
}
function fake(memberEmail = "a@b.co") {
  const notices = new Map<string, any>();
  const booking = { id: "bk1", organizationId: "org", memberId: "m1", memberName: "Ann", memberEmail, status: "confirmed", waitlistPosition: null,
    organization: { name: "Club", timezone: "America/Chicago" },
    classInstance: { date: new Date("2026-11-04T01:00:00.000Z"), location: { name: "Main" }, classSchedule: { name: "Spin", location: null } } };
  const membership = { id: "ms1", billingCycle: "monthly", tier: { name: "Gold" }, organization: { name: "Club" }, member: { id: "u1", email: memberEmail, name: "Ann" } };
  return { notices, prisma: {
    classBooking: { findUnique: async () => booking },
    membership: { findFirst: async () => membership },
    member: { findFirst: async () => ({ id: "m1" }) },
    operationalNotice: {
      create: async ({ data }: any) => { if (notices.has(data.key)) throw Object.assign(new Error("dup"), { code: "P2002" }); const row = { id: `n${notices.size}`, ...data }; notices.set(data.key, row); return row; },
      update: async ({ where, data }: any) => { for (const row of notices.values()) if (row.id === where.id) Object.assign(row, data); return {}; },
    },
  } };
}
const status = (notices: Map<string, any>) => [...notices.values()][0]?.message;
const inv = { organizationId: "org", stripeSubscriptionId: "sub_1", invoiceId: "in_1", amountCents: 4900, currencyCode: "usd" };

test("a booking confirmation is sent once, with the account link and a local time", async () => {
  configure(true);
  const { notices, prisma } = fake();
  const sent: any[] = [];
  await deliverBookingConfirmation(prisma, "bk1", async mail => { sent.push(mail); return { sent: true }; });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].link.url, "https://club.test/account/bookings");
  assert.match(sent[0].lines[0], /Tuesday, November 3.*CST/);
  assert.equal(status(notices), "sent");
  assert.equal([...notices.values()][0].status, "resolved");
});

test("a replay does not resend", async () => {
  configure(true);
  const { prisma } = fake();
  let count = 0;
  const send = async () => { count++; return { sent: true }; };
  await deliverBookingConfirmation(prisma, "bk1", send);
  await deliverBookingConfirmation(prisma, "bk1", send);
  await deliverMembershipConfirmation(prisma, inv, send);
  await deliverMembershipConfirmation(prisma, inv, send);
  assert.equal(count, 2);
});

test("a mail throw is recorded as failed and never surfaces", async () => {
  configure(true);
  const { notices, prisma } = fake();
  await deliverBookingConfirmation(prisma, "bk1", async () => { throw new Error("boom"); });
  assert.equal(status(notices), "failed");
});

test("unconfigured mail is recorded as skipped and nothing is sent", async () => {
  configure(false);
  const { notices, prisma } = fake();
  let count = 0;
  await deliverBookingConfirmation(prisma, "bk1", async () => { count++; return { sent: true }; });
  assert.equal(count, 0);
  assert.equal(status(notices), "skipped_not_configured");
});

test("a missing recipient is recorded, not mailed", async () => {
  configure(true);
  const { notices, prisma } = fake("");
  let count = 0;
  await deliverMembershipConfirmation(prisma, inv, async () => { count++; return { sent: true }; });
  assert.equal(count, 0);
  assert.equal(status(notices), "skipped_no_recipient");
});

test("membership confirmation links the member's own membership page", async () => {
  configure(true);
  const { prisma } = fake();
  const sent: any[] = [];
  await deliverMembershipConfirmation(prisma, inv, async mail => { sent.push(mail); return { sent: true }; });
  assert.equal(sent[0].link.url, "https://club.test/account/membership");
  assert.match(sent[0].lines[0], /\$49\.00/);
});

test("bookkeeping failure never throws", async () => {
  await deliverBookingConfirmation({ classBooking: { findUnique: async () => { throw new Error("db down"); } } }, "bk1");
});
