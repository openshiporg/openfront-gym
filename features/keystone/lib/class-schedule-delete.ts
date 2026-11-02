/**
 * Deleting a recurring template removes it and its generated sessions. It is only allowed
 * once nothing a member or coach relies on is still attached: no open bookings, no
 * recorded attendance and no live waitlist entries. Cancelled bookings stay as history;
 * their session link is cleared by the existing SET NULL foreign key.
 */

export type ClassScheduleDeleteBlockers = {
  openBookings: number;
  attendanceRecords: number;
  waitlistEntries: number;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Why the template can't be deleted yet, or null when it can. */
export function classScheduleDeleteBlockedReason(blockers: ClassScheduleDeleteBlockers): string | null {
  if (blockers.openBookings > 0) return `Has ${plural(blockers.openBookings, "booking", "bookings")}. Cancel bookings first.`;
  if (blockers.attendanceRecords > 0) return `Has ${plural(blockers.attendanceRecords, "attendance record", "attendance records")}. Templates with attendance history are kept; pause it instead.`;
  if (blockers.waitlistEntries > 0) return `Has ${plural(blockers.waitlistEntries, "waitlist entry", "waitlist entries")}. Clear the waitlist first.`;
  return null;
}

export type ClassScheduleDeleteResult = {
  scheduleId: string;
  name: string;
  sessionCount: number;
  blockedReason: string | null;
  deleted: boolean;
};

/**
 * Runs inside the caller's transaction (which must hold the scheduling locks). With
 * dryRun it only reports; otherwise it deletes the sessions and the template together,
 * or throws the blocked reason so nothing changes.
 */
export async function deleteClassScheduleInTransaction(
  tx: any,
  organizationId: string,
  scheduleId: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ClassScheduleDeleteResult> {
  const schedule = await tx.classSchedule.findFirst({ where: { id: scheduleId, organizationId }, select: { id: true, name: true } });
  if (!schedule) throw new Error("Template not found");
  const instanceWhere = { organizationId, classScheduleId: schedule.id };
  const [sessionCount, openBookings, attendanceRecords, waitlistEntries] = await Promise.all([
    tx.classInstance.count({ where: instanceWhere }),
    tx.classBooking.count({ where: { organizationId, status: { not: "cancelled" }, classInstance: { is: instanceWhere } } }),
    tx.attendanceRecord.count({ where: { organizationId, OR: [{ classScheduleId: schedule.id }, { booking: { is: { classInstance: { is: instanceWhere } } } }] } }),
    tx.waitlist.count({ where: { organizationId, classScheduleId: schedule.id, status: { in: ["waiting", "notified"] } } }),
  ]);
  const blockedReason = classScheduleDeleteBlockedReason({ openBookings, attendanceRecords, waitlistEntries });
  const result = { scheduleId: schedule.id, name: schedule.name, sessionCount, blockedReason, deleted: false };
  if (dryRun) return result;
  if (blockedReason) throw new Error(blockedReason);
  await tx.classInstance.deleteMany({ where: instanceWhere });
  await tx.classSchedule.delete({ where: { id: schedule.id } });
  return { ...result, deleted: true };
}
