import { guardKeystonePrismaResults } from "./prisma-result";
import { lockTransactionKey } from "../mutations/classCapacity";

/**
 * Raw dashboard edits that would orphan live services or erase history are refused with the
 * supported alternative; the controlled workflows (reassign, cancel, close account) keep
 * ownership keys and history intact.
 */
const LIVE_APPOINTMENT = ["scheduled", "confirmed", "checked_in"];
const DAY_MS = 86_400_000;

const minutesOf = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return h * 60 + m; };

/**
 * Classes that still need a coach or site: future sessions plus sessions that have started and
 * not yet ended (an explicit end, or the schedule's end time for an inheriting session).
 */
async function openClasses(tx: any, organizationId: string, scope: Record<string, unknown>[], now: Date) {
  const [future, started] = await Promise.all([
    tx.classInstance.count({ where: { organizationId, isCancelled: false, date: { gt: now }, OR: scope } }),
    tx.classInstance.findMany({
      where: { organizationId, isCancelled: false, date: { lte: now, gt: new Date(now.getTime() - DAY_MS) }, OR: scope },
      select: { date: true, endsAt: true, classSchedule: { select: { startTime: true, endTime: true } } }, take: 500,
    }),
  ]);
  const running = started.filter((instance: any) => {
    if (instance.endsAt) return new Date(instance.endsAt) > now;
    const duration = instance.classSchedule ? minutesOf(instance.classSchedule.endTime) - minutesOf(instance.classSchedule.startTime) : 480;
    return new Date(instance.date).getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 480) * 60_000 > now.getTime();
  }).length;
  return future + running;
}

async function openWorkAtLocation(tx: any, organizationId: string, locationId: string, now = new Date()) {
  const [classes, appointments] = await Promise.all([
    openClasses(tx, organizationId, [{ locationId }, { locationId: null, classSchedule: { locationId } }], now),
    tx.trainerAppointment.count({ where: { organizationId, locationId, status: { in: LIVE_APPOINTMENT }, endTime: { gt: now } } }),
  ]);
  return { classes, appointments };
}

async function openWorkForInstructor(tx: any, organizationId: string, instructorId: string, now = new Date()) {
  const [classes, appointments] = await Promise.all([
    openClasses(tx, organizationId, [{ instructorId }, { instructorId: null, classSchedule: { instructorId } }], now),
    tx.trainerAppointment.count({ where: { organizationId, instructorId, status: { in: LIVE_APPOINTMENT }, endTime: { gt: now } } }),
  ]);
  return { classes, appointments };
}

/**
 * Retires a coach or site only while no class or appointment still needs it. The check and the
 * retirement are one transaction under the scheduling lock every allocation writer takes (and
 * each of them re-reads isActive under it), so no work can be allocated between the two.
 * Returns why it can't retire yet, or null once it is retired; the dashboard edit that asked for
 * it then saves the same value with any other changed fields.
 */
export async function retireUnderSchedulingLock(context: any, kind: "instructor" | "location", item: { id: string; organizationId: string }) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `gym-scheduling:${item.organizationId}`);
    const open = kind === "instructor"
      ? await openWorkForInstructor(tx, item.organizationId, item.id)
      : await openWorkAtLocation(tx, item.organizationId, item.id);
    if (open.classes || open.appointments) {
      return kind === "instructor"
        ? `Reassign or cancel this coach's ${open.classes} upcoming or in-progress class sessions and ${open.appointments} appointments before retiring them`
        : `Move or cancel this location's ${open.classes} upcoming or in-progress class sessions and ${open.appointments} appointments before closing it`;
    }
    if (kind === "instructor") await tx.instructor.update({ where: { id: item.id }, data: { isActive: false } });
    else await tx.location.update({ where: { id: item.id }, data: { isActive: false } });
    return null;
  });
}

/** Any operational or commercial evidence that names this member (via Member or its User). */
export async function memberHasHistory(context: any, organizationId: string, memberId: string | null, userId: string | null) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const checks: Promise<number>[] = [];
  if (memberId) {
    checks.push(
      prisma.classBooking.count({ where: { organizationId, memberId } }),
      prisma.checkIn.count({ where: { organizationId, memberId } }),
      prisma.gymPayment.count({ where: { organizationId, memberId } }),
      prisma.subscription.count({ where: { organizationId, memberId } }),
      prisma.trainingPackage.count({ where: { organizationId, memberId } }),
      prisma.trainerAppointment.count({ where: { organizationId, memberId } }),
      prisma.participationEvidence.count({ where: { organizationId, memberId } }),
      prisma.workoutLog.count({ where: { memberId } }),
      prisma.waitlist.count({ where: { memberId } }),
      prisma.attendanceRecord.count({ where: { memberId } }),
      prisma.coachingAssignment.count({ where: { organizationId, memberId } }),
      prisma.operationsCase.count({ where: { organizationId, memberId } }),
    );
  }
  if (userId) {
    checks.push(
      prisma.membership.count({ where: { organizationId, memberId: userId } }),
      prisma.membershipPayment.count({ where: { organizationId, memberId: userId } }),
      prisma.paymentSession.count({ where: { organizationId, userId } }),
    );
  }
  const counts = await Promise.all(checks);
  return counts.some((count) => count > 0);
}
