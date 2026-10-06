import { lockParticipationPolicy } from "../lib/operational-policy";
import type { Context } from ".keystone/types";
import { lockTransactionKey } from "./classCapacity";
import { trainingActorFromContext, appointmentProjection } from "./trainerAppointment";
import { recordSettledTrainingPackage, recordTrainingPackageRefund } from "./trainingPackages";
import { assertTrainerAvailable, assertTrainingActor, assertTrainingTenant, minutesOfDay, trainingText, type TrainingActor } from "./trainingPolicy";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

export async function getTrainingWorkspace(_root: unknown, { skip = 0 }: { skip?: number }, context: Context) {
  const actor = trainingActorFromContext(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 10_000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } });
  const where = { organizationId: actor.organizationId };
  const memberScope = { ...where, ...(actor.canManageAppointments ? {} : { memberId: member?.id || "__no_member__" }) };
  const [packages, appointments, instructors, locations, resources, availability, members, assignments, leads, organization] = await Promise.all([
    tx.trainingPackage.findMany({ where: memberScope, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 50, skip, select: { id: true, memberId: true, locationId: true, serviceName: true, durationMinutes: true, totalCredits: true, creditsRemaining: true, amount: true, currencyCode: true, expiresAt: true, status: true, terms: true, refundAmount: true } }),
    tx.trainerAppointment.findMany({ where: { ...where, ...(actor.canManageAppointments ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...(actor.isInstructor ? [{ instructor: { userId: actor.userId } }] : [])] }) }, orderBy: [{ startTime: "desc" }, { id: "asc" }], take: 50, skip }),
    tx.instructor.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, user: { select: { name: true } } } }),
    tx.location.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true } }),
    tx.gymResource.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true, locationId: true } }),
    tx.trainerAvailability.findMany({ where, take: 200, orderBy: [{ instructorId: "asc" }, { id: "asc" }], select: { id: true, instructorId: true, locationId: true, type: true, date: true, dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true, isAvailable: true } }),
    actor.canManageAppointments || actor.canManagePrograms || actor.canManagePeople ? tx.member.findMany({ where, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true } }) : [],
    tx.coachingAssignment.findMany({ where: { ...where, ...(actor.canManagePrograms ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...(actor.isInstructor ? [{ instructor: { userId: actor.userId } }] : [])] }) }, take: 50, skip, orderBy: [{ dueAt: "desc" }, { id: "asc" }], select: { id: true, title: true, instructions: true, dueAt: true, status: true, memberId: true, instructorId: true, memberEvidence: true, review: true, submittedAt: true, reviewedAt: true } }),
    actor.canManagePeople ? tx.trainingLead.findMany({ where, take: 50, skip, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, name: true, email: true, source: true, status: true, trialAt: true, nextActionAt: true, memberId: true, history: true } }) : [],
    tx.organization.findUnique({ where: { id: actor.organizationId }, select: { timezone: true } }),
  ]);
  return { memberId: member?.id, canManageAppointments: actor.canManageAppointments, canManagePrograms: actor.canManagePrograms, canManagePeople: actor.canManagePeople, isInstructor: actor.isInstructor, timeZone: organization?.timezone || "UTC", skip, packages, appointments: appointments.map(appointmentProjection), instructors: instructors.map((row: any) => ({ id: row.id, name: row.user?.name || "Instructor" })), locations, resources, availability, members: members.map((row: any) => ({ id: row.id, name: row.name })), assignments, leads };
}

export async function saveTrainerAvailabilityAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const startTime = trainingText(data.startTime, "Start time", 5), endTime = trainingText(data.endTime, "End time", 5);
  if (minutesOfDay(startTime) >= minutesOfDay(endTime)) throw new Error("Availability must end after it starts on the same local day");
  if (!["recurring", "one_time", "time_off"].includes(data.type)) throw new Error("Invalid availability type");
  if (data.type === "recurring" && (!Number.isInteger(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6)) throw new Error("Weekday must be 0-6");
  const date = data.date ? new Date(data.date) : null;
  if (data.type !== "recurring" && (!date || !Number.isFinite(date.getTime()))) throw new Error("A dated availability needs a date");
  const values = { instructorId: data.instructorId, locationId: data.locationId, type: data.type, dayOfWeek: data.type === "recurring" ? data.dayOfWeek : null, date, startTime, endTime, isAvailable: data.type !== "time_off" && data.isAvailable !== false, reason: trainingText(data.reason || "", "Reason", 1000, false) };
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor.organizationId}`);
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    const location = await tx.location.findUnique({ where: { id: data.locationId } });
    assertTrainingTenant(instructor, actor, "Instructor"); assertTrainingTenant(location, actor, "Location");
    if (data.id) {
      const row = await tx.trainerAvailability.findUnique({ where: { id: data.id } }); assertTrainingTenant(row, actor, "Availability");
      if (row.instructorId !== instructor.id || row.locationId !== location.id) throw new Error("Availability owner and location cannot be changed");
    }
    const rows = await tx.trainerAvailability.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Availability limit reached");
    const next = [...rows.filter((row: any) => row.id !== data.id), values];
    const appointments = await tx.trainerAppointment.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id, endTime: { gt: new Date() }, status: { in: ["scheduled", "confirmed", "checked_in"] } }, take: 1000 });
    if (appointments.length >= 1000) throw new Error("Upcoming appointments require review before availability changes");
    const organization = await tx.organization.findUnique({ where: { id: actor.organizationId } });
    for (const appointment of appointments) assertTrainerAvailable(next, new Date(appointment.startTime), new Date(appointment.endTime), organization.timezone);
    const row = data.id ? await tx.trainerAvailability.update({ where: { id: data.id }, data: values }) : await tx.trainerAvailability.create({ data: { ...values, organizationId: actor.organizationId } });
    return { id: row.id };
  });
}

export async function assignCoachingAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManagePrograms && !actor.isInstructor) throw new Error("Coaching permission required");
  const title = trainingText(data.title, "Title", 200), instructions = trainingText(data.instructions, "Instructions", 8000), requestKey = trainingText(data.requestKey, "Request key", 200);
  const dueAt = new Date(data.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) throw new Error("Choose a future due date");
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `coaching:${actor.organizationId}:${requestKey}`);
    const member = await tx.member.findUnique({ where: { id: data.memberId } });
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    assertTrainingTenant(member, actor, "Member"); assertTrainingTenant(instructor, actor, "Instructor");
    if (!actor.canManagePrograms && instructor.userId !== actor.userId) throw new Error("Instructors may assign only their own coaching work");
    if (!instructor.isActive || member.status !== "active") throw new Error("Active member and instructor required");
    if (!actor.canManagePrograms) {
      const service = await tx.trainerAppointment.findFirst({ where: { organizationId: actor.organizationId, memberId: member.id, instructorId: instructor.id, status: { in: ["confirmed", "checked_in", "completed"] } } });
      if (!service) throw new Error("An assigned training relationship is required for instructor-created coaching");
    }
    const values = { memberId: member.id, instructorId: instructor.id, title, instructions, dueAt };
    const existing = await tx.coachingAssignment.findFirst({ where: { organizationId: actor.organizationId, requestKey } });
    if (existing) {
      const snapshot = { memberId: existing.memberId, instructorId: existing.instructorId, title: existing.title, instructions: existing.instructions, dueAt: existing.dueAt };
      if (hashTrainerAppointmentRequest(snapshot) !== hashTrainerAppointmentRequest(values)) throw new Error("Coaching request key has different content");
      return { id: existing.id, reused: true };
    }
    const row = await tx.coachingAssignment.create({ data: { organizationId: actor.organizationId, ...values, requestKey, status: "assigned" } });
    await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: member.id, key: `coaching:${row.id}`, kind: "coaching", message: `Your coach assigned ${title}. Open Account → Training to read and submit your progress.` });
    return { id: row.id };
  });
}

export async function transitionCoachingAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  const text = trainingText(data.text, "Progress or review", 8000);
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `coaching-assignment:${data.id}`);
    const row = await tx.coachingAssignment.findUnique({ where: { id: data.id }, include: { member: true, instructor: true } });
    assertTrainingTenant(row, actor, "Coaching assignment");
    const own = row.member?.userId === actor.userId;
    const coach = actor.canManagePrograms || (actor.isInstructor && row.instructor?.userId === actor.userId);
    if (data.status === "submitted") {
      if (!own) throw new Error("Only the assigned member can submit progress");
      if (row.status === "submitted" && row.memberEvidence === text) return { id: row.id, reused: true };
      if (row.status !== "assigned") throw new Error("Only an assigned task can be submitted");
      const log = await tx.workoutLog.create({ data: { organizationId: actor.organizationId, memberId: row.memberId, title: row.title, date: new Date(), notes: text } });
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "submitted", memberEvidence: text, submittedAt: new Date(), workoutLogId: log.id } });
    } else if (data.status === "reviewed") {
      if (!coach) throw new Error("Only the assigned coach or program manager can review");
      if (row.status === "reviewed" && row.review === text) return { id: row.id, reused: true };
      if (row.status !== "submitted") throw new Error("Progress must be submitted before review");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "reviewed", review: text, reviewedAt: new Date() } });
      await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: row.memberId, key: `coaching-reviewed:${row.id}`, kind: "coaching", message: `Your coach reviewed ${row.title}. Open Account → Training for feedback.` });
    } else if (data.status === "cancelled") {
      if (!coach || row.status !== "assigned") throw new Error("Only unsubmitted coaching work can be cancelled by its coach");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "cancelled", review: text } });
    } else throw new Error("Unknown coaching transition");
    return { id: row.id };
  });
}

export async function saveTrainingLeadAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor); if (!actor.canManagePeople) throw new Error("People management permission required");
  const email = trainingText(data.email, "Email", 254).toLowerCase(), name = trainingText(data.name, "Name", 200), note = trainingText(data.note, "Follow-up note", 2000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is invalid");
  const allowed: Record<string, string[]> = { new: ["contacted", "closed"], contacted: ["trial_booked", "converted", "closed"], trial_booked: ["trial_attended", "contacted", "closed"], trial_attended: ["converted", "contacted", "closed"], converted: [], closed: [] };
  if (!Object.hasOwn(allowed, data.status)) throw new Error("Unknown lead status");
  const trialAt = data.trialAt ? new Date(data.trialAt) : null, nextActionAt = data.nextActionAt ? new Date(data.nextActionAt) : null;
  if ((trialAt && !Number.isFinite(trialAt.getTime())) || (nextActionAt && !Number.isFinite(nextActionAt.getTime()))) throw new Error("Follow-up date is invalid");
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `training-lead:${actor.organizationId}:${email}`);
    const row = await tx.trainingLead.findFirst({ where: { organizationId: actor.organizationId, email } });
    if (!row && data.status !== "new") throw new Error("New inquiries must begin as new");
    if (row && row.status !== data.status && !allowed[row.status]?.includes(data.status)) throw new Error("Lead transition is not allowed");
    if (data.status === "trial_booked" && (!trialAt || trialAt <= new Date())) throw new Error("Choose a future trial appointment");
    if (data.status === "trial_attended" && (!row?.trialAt || new Date(row.trialAt) > new Date())) throw new Error("Trial attendance cannot precede its appointment");
    if (data.status === "converted") {
      const member = await tx.member.findUnique({ where: { id: data.memberId } }); assertTrainingTenant(member, actor, "Converted member");
      const user = await tx.user.findUnique({ where: { id: member.userId } });
      if (user?.email?.toLowerCase() !== email) throw new Error("Conversion requires the matching member identity");
      const paidPackage = await tx.trainingPackage.findFirst({ where: { organizationId: actor.organizationId, memberId: member.id, status: "active", amount: { gt: 0 } } });
      const paidMembership = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, memberId: member.userId, status: "active", stripeSubscriptionId: { not: "" } } });
      if (!paidPackage && !paidMembership) throw new Error("Conversion requires a recorded purchased package or active provider membership");
    }
    const history = Array.isArray(row?.history) ? row.history : [];
    if (history.length && row?.status === data.status && history[history.length - 1]?.note === note && row.name === name && (!data.memberId || row.memberId === data.memberId)) return { id: row.id, reused: true };
    if (history.length >= 500) throw new Error("Case history limit reached; archive through retention policy");
    const entry = { at: new Date().toISOString(), actorId: actor.userId, from: row?.status || null, to: data.status, note };
    const values = { name, status: data.status, source: trainingText(data.source || row?.source || "operator", "Source", 200), trialAt: trialAt || row?.trialAt || null, nextActionAt, ...(data.status === "converted" ? { memberId: data.memberId } : {}), history: [...history, entry] };
    const result = row ? await tx.trainingLead.update({ where: { id: row.id }, data: values }) : await tx.trainingLead.create({ data: { organizationId: actor.organizationId, email, ownerId: actor.userId, ...values } });
    return { id: result.id, status: result.status };
  });
}

export const trainingWorkspaceTypeDefs = `
  extend type Query { trainingWorkspace(skip: Int = 0): JSON! }
  extend type Mutation {
    bookTrainerAppointment(data: JSON!): JSON!
    rescheduleTrainerAppointment(data: JSON!): JSON!
    transitionTrainerAppointment(appointmentId: ID!, status: String!, reason: String): JSON!
    recordTrainingPackage(data: JSON!): JSON!
    refundTrainingPackage(data: JSON!): JSON!
    saveTrainerAvailability(data: JSON!): JSON!
    assignCoaching(data: JSON!): JSON!
    transitionCoaching(data: JSON!): JSON!
    saveTrainingLead(data: JSON!): JSON!
  }
`;
export async function recordTrainingPackage(_r: unknown, { data }: any, ctx: Context) { return recordSettledTrainingPackage(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function refundTrainingPackage(_r: unknown, { data }: any, ctx: Context) { return recordTrainingPackageRefund(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function saveTrainerAvailability(_r: unknown, { data }: any, ctx: Context) { return saveTrainerAvailabilityAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function assignCoaching(_r: unknown, { data }: any, ctx: Context) { return assignCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function transitionCoaching(_r: unknown, { data }: any, ctx: Context) { return transitionCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function saveTrainingLead(_r: unknown, { data }: any, ctx: Context) { return saveTrainingLeadAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
