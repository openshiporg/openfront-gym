import { localDateParts, normalizeTimeZone } from "../../../lib/timezone";

export type TrainingActor = { userId: string; organizationId: string; canManageAppointments: boolean; canManagePrograms?: boolean; canManagePeople?: boolean; isInstructor: boolean };
export function trainingText(value: unknown, label: string, max = 2000, required = true) {
  if (typeof value !== "string" || (required && !value.trim()) || value.trim().length > max) throw new Error(`${label} is invalid`);
  return value.trim();
}
export function trainingInteger(value: unknown, label: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} is invalid`);
  return value as number;
}
export function assertTrainingActor(actor: TrainingActor) {
  if (!actor?.userId || !actor.organizationId) throw new Error("Authenticated organization session required");
}
export function assertTrainingTenant(item: any, actor: TrainingActor, label: string) {
  if (!item || item.organizationId !== actor.organizationId) throw new Error(`${label} was not found in this organization`);
}
export function assertTrainingMember(member: any, actor: TrainingActor) {
  assertTrainingTenant(member, actor, "Member");
  if (!actor.canManageAppointments && member.userId !== actor.userId && member.user?.id !== actor.userId) throw new Error("You cannot book for another member");
  if (member.status !== "active") throw new Error("Member is inactive");
}
export function minutesOfDay(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Time must use HH:mm");
  const [h, m] = value.split(":").map(Number); return h * 60 + m;
}
export function assertTrainerAvailable(rows: any[], start: Date, end: Date, timeZone: string) {
  normalizeTimeZone(timeZone);
  const a = localDateParts(start, timeZone), b = localDateParts(end, timeZone);
  const key = (p: {year: number; month: number; day: number}) => `${p.year}-${p.month}-${p.day}`;
  if (key(a) !== key(b)) throw new Error("Appointments must finish on the same local day");
  const weekday = new Date(Date.UTC(a.year, a.month - 1, a.day)).getUTCDay();
  const startMinute = a.hour * 60 + a.minute, endMinute = b.hour * 60 + b.minute + b.second / 60;
  const applicable = rows.filter(row => {
    if (row.effectiveFrom && start < new Date(row.effectiveFrom)) return false;
    if (row.effectiveTo && end > new Date(row.effectiveTo)) return false;
    if (row.type === "recurring") return row.dayOfWeek === weekday;
    return row.date && key(localDateParts(new Date(row.date), timeZone)) === key(a);
  });
  if (applicable.some(row => (!row.isAvailable || row.type === "time_off") && minutesOfDay(row.startTime) < endMinute && minutesOfDay(row.endTime) > startMinute)) throw new Error("Instructor is unavailable at this time");
  if (!applicable.some(row => row.isAvailable && row.type !== "time_off" && minutesOfDay(row.startTime) <= startMinute && minutesOfDay(row.endTime) >= endMinute)) throw new Error("Appointment is outside published instructor availability");
}
export function assertPackageUsable(pack: any, actor: TrainingActor, memberId: string, locationId: string, end: Date) {
  assertTrainingTenant(pack, actor, "Training package");
  if (pack.memberId !== memberId || pack.locationId !== locationId) throw new Error("Package does not cover this member and location");
  if (pack.status !== "active" || pack.creditsRemaining < 1) throw new Error("Package has no available credits");
  if (end > new Date(pack.expiresAt)) throw new Error("Package expires before this appointment finishes");
}
export function unusedPackageRefundAmount(pack: { amount: number; creditsRemaining: number; totalCredits: number }) {
  return Math.floor(pack.amount * pack.creditsRemaining / pack.totalCredits);
}
