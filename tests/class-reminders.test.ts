import assert from "node:assert/strict";
import test from "node:test";
import { sendDueClassReminders } from "../features/keystone/lib/order-confirmation";

process.env.MAIL_ENABLED = "true"; process.env.SMTP_HOST = "smtp.test"; process.env.SMTP_FROM = "club@test.dev"; process.env.NEXTAUTH_URL = "https://club.test";
const now = new Date("2026-11-06T12:00:00.000Z");
const row = (id: string, bookedAt: string, date: string) => ({ id, organizationId: "org", memberId: "m1", memberEmail: "a@b.co", bookedAt: new Date(bookedAt),
  organization: { name: "Club", timezone: "America/Los_Angeles" },
  classInstance: { date: new Date(date), location: { name: "Main" }, classSchedule: { name: "Spin", location: null } } });

function fake(rows: any[]) {
  const notices = new Map<string, any>(); let where: any;
  return { notices, where: () => where, prisma: {
    classBooking: { findMany: async (args: any) => { where = args.where; return rows; } },
    operationalNotice: {
      create: async ({ data }: any) => { if (notices.has(data.key)) throw Object.assign(new Error("dup"), { code: "P2002" }); const r = { id: `n${notices.size}`, ...data }; notices.set(data.key, r); return r; },
      update: async ({ where, data }: any) => { for (const r of notices.values()) if (r.id === where.id) Object.assign(r, data); return {}; },
    },
  } };
}

test("a confirmed booking gets one reminder within 24 hours of class, never twice", async () => {
  const f = fake([row("bk1", "2026-11-01T00:00:00Z", "2026-11-07T02:00:00Z")]);
  const sent: any[] = [];
  const send = async (mail: any) => { sent.push(mail); return { sent: true }; };
  await sendDueClassReminders(f.prisma, now, send);
  await sendDueClassReminders(f.prisma, now, send);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /^Reminder: Spin at Club$/);
  assert.match(sent[0].lines[0], /Friday, November 6.*6:00 PM PST/);
  assert.equal(sent[0].link.url, "https://club.test/account/bookings");
  const w = f.where();
  assert.equal(w.status, "confirmed");
  assert.equal(w.classInstance.isCancelled, false);
  assert.equal(w.classInstance.date.lte.toISOString(), "2026-11-07T12:00:00.000Z");
});

test("a booking made less than a day before class gets no extra reminder (its confirmation covered it)", async () => {
  const f = fake([row("bk2", "2026-11-06T10:00:00Z", "2026-11-07T02:00:00Z")]);
  const sent: any[] = [];
  await sendDueClassReminders(f.prisma, now, async (mail: any) => { sent.push(mail); return { sent: true }; });
  assert.equal(sent.length, 0);
});
