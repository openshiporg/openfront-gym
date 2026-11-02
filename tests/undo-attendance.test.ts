import test from "node:test";
import assert from "node:assert/strict";
import { undoCapacityControlledAttendance } from "../features/keystone/mutations/gymLifecycle";

const ORG = "org_1";
const operator = { userId: "staff_1", organizationId: ORG, canManageAllRecords: true };

function fakePrisma(booking: Record<string, any> = {}) {
  const calls: any[] = [];
  const row = {
    id: "booking_1",
    memberId: "member_1",
    status: "confirmed",
    member: { organizationId: ORG },
    classInstance: {
      organizationId: ORG,
      classScheduleId: "sched_1",
      isCancelled: false,
      date: new Date(Date.now() - 60 * 60 * 1000),
      instructor: { isActive: true, user: { id: "coach_1" } },
      classSchedule: null,
    },
    ...booking,
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ locked: true }],
    classBooking: { findFirst: async ({ where }: any) => (where.id === row.id && where.organizationId === ORG ? row : null) },
    attendanceRecord: { deleteMany: async (args: any) => { calls.push(args); return { count: 1 }; } },
  };
  return { prisma: { $transaction: async (fn: any) => fn(tx) }, calls };
}

test("operator undo removes the booking's attendance record and nothing else", async () => {
  const { prisma, calls } = fakePrisma();
  const result = await undoCapacityControlledAttendance(prisma, { bookingId: "booking_1", actor: operator });
  assert.deepEqual(result, { bookingId: "booking_1", removed: 1 });
  assert.deepEqual(calls, [{ where: { bookingId: "booking_1", organizationId: ORG } }]);
});

test("the session's active coach may undo; another coach may not", async () => {
  const coach = { userId: "coach_1", organizationId: ORG, canManageAllRecords: false, isInstructor: true };
  assert.equal((await undoCapacityControlledAttendance(fakePrisma().prisma, { bookingId: "booking_1", actor: coach })).removed, 1);
  const other = { ...coach, userId: "coach_2" };
  const { prisma, calls } = fakePrisma();
  await assert.rejects(undoCapacityControlledAttendance(prisma, { bookingId: "booking_1", actor: other }), { message: "Attendance management permission required" });
  assert.equal(calls.length, 0);
});

test("same rules as marking: not before the class, not on a cancelled class, not another org", async () => {
  const future = fakePrisma({ classInstance: { organizationId: ORG, classScheduleId: "s", isCancelled: false, date: new Date(Date.now() + 3600_000) } });
  await assert.rejects(undoCapacityControlledAttendance(future.prisma, { bookingId: "booking_1", actor: operator }), /before the class starts/);
  const cancelled = fakePrisma({ classInstance: { organizationId: ORG, classScheduleId: "s", isCancelled: true, date: new Date(Date.now() - 3600_000) } });
  await assert.rejects(undoCapacityControlledAttendance(cancelled.prisma, { bookingId: "booking_1", actor: operator }), /cancelled class/);
  await assert.rejects(undoCapacityControlledAttendance(fakePrisma().prisma, { bookingId: "booking_1", actor: { ...operator, organizationId: "org_2" } }), /not found|missing/);
  assert.equal(future.calls.length + cancelled.calls.length, 0);
});
