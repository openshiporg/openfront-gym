import test from "node:test";
import assert from "node:assert/strict";
import { classScheduleDeleteBlockedReason, deleteClassScheduleInTransaction } from "../features/keystone/lib/class-schedule-delete";

const ORG = "org_1";

function fakeTx(counts: { sessions?: number; openBookings?: number; attendance?: number; waitlist?: number } = {}) {
  const calls: string[] = [];
  const where: Record<string, any> = {};
  const tx = {
    classSchedule: {
      findFirst: async ({ where: w }: any) => (w.id === "sched_1" && w.organizationId === ORG ? { id: "sched_1", name: "QA Mobility" } : null),
      delete: async ({ where: w }: any) => { calls.push(`delete schedule ${w.id}`); return { id: w.id }; },
    },
    classInstance: {
      count: async () => counts.sessions ?? 3,
      deleteMany: async ({ where: w }: any) => { calls.push(`delete sessions of ${w.classScheduleId}`); where.sessions = w; return { count: counts.sessions ?? 3 }; },
    },
    classBooking: { count: async ({ where: w }: any) => { where.bookings = w; return counts.openBookings ?? 0; } },
    attendanceRecord: { count: async () => counts.attendance ?? 0 },
    waitlist: { count: async ({ where: w }: any) => { where.waitlist = w; return counts.waitlist ?? 0; } },
  };
  return { tx, calls, where };
}

test("allowed: deletes the sessions, then the template, and reports the count", async () => {
  const { tx, calls, where } = fakeTx({ sessions: 3 });
  const result = await deleteClassScheduleInTransaction(tx, ORG, "sched_1");
  assert.deepEqual(result, { scheduleId: "sched_1", name: "QA Mobility", sessionCount: 3, blockedReason: null, deleted: true });
  assert.deepEqual(calls, ["delete sessions of sched_1", "delete schedule sched_1"]);
  assert.deepEqual(where.sessions, { organizationId: ORG, classScheduleId: "sched_1" });
  // Cancelled bookings are history and do not block; anything else does.
  assert.deepEqual(where.bookings.status, { not: "cancelled" });
  assert.deepEqual(where.waitlist.status, { in: ["waiting", "notified"] });
});

test("blocked by a booking: throws the reason and deletes nothing", async () => {
  const { tx, calls } = fakeTx({ openBookings: 1 });
  await assert.rejects(deleteClassScheduleInTransaction(tx, ORG, "sched_1"), { message: "Has 1 booking. Cancel bookings first." });
  assert.deepEqual(calls, []);
});

test("blocked by attendance history: throws and deletes nothing", async () => {
  const { tx, calls } = fakeTx({ attendance: 1 });
  await assert.rejects(deleteClassScheduleInTransaction(tx, ORG, "sched_1"), /^Error: Has 1 attendance record\./);
  assert.deepEqual(calls, []);
});

test("dry run reports the blocker or the session count without changing anything", async () => {
  const blocked = fakeTx({ openBookings: 2, sessions: 4 });
  const preview = await deleteClassScheduleInTransaction(blocked.tx, ORG, "sched_1", { dryRun: true });
  assert.equal(preview.blockedReason, "Has 2 bookings. Cancel bookings first.");
  assert.equal(preview.sessionCount, 4);
  assert.equal(preview.deleted, false);
  const clear = fakeTx({ sessions: 1 });
  const ok = await deleteClassScheduleInTransaction(clear.tx, ORG, "sched_1", { dryRun: true });
  assert.equal(ok.blockedReason, null);
  assert.deepEqual([...blocked.calls, ...clear.calls], []);
});

test("another organization's template is not found", async () => {
  const { tx, calls } = fakeTx();
  await assert.rejects(deleteClassScheduleInTransaction(tx, "org_2", "sched_1"), { message: "Template not found" });
  assert.deepEqual(calls, []);
});

test("blocked reasons read naturally", () => {
  assert.equal(classScheduleDeleteBlockedReason({ openBookings: 0, attendanceRecords: 0, waitlistEntries: 0 }), null);
  assert.equal(classScheduleDeleteBlockedReason({ openBookings: 0, attendanceRecords: 0, waitlistEntries: 1 }), "Has 1 waitlist entry. Clear the waitlist first.");
  assert.match(classScheduleDeleteBlockedReason({ openBookings: 0, attendanceRecords: 2, waitlistEntries: 0 })!, /^Has 2 attendance records\./);
});
