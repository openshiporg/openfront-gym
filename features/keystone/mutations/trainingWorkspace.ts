import { lockParticipationPolicy } from "../lib/operational-policy";
import { businessTimeZone } from "../lib/business-time-zone";
import type { Context } from ".keystone/types";
import { lockTransactionKey } from "./classCapacity";
import { trainingActorFromContext, appointmentProjection } from "./trainerAppointment";
import { recordSettledTrainingPackage, recordTrainingPackageRefund } from "./trainingPackages";
import { assertTrainerAvailable, assertTrainingActor, assertTrainingTenant, minutesOfDay, trainingInteger, trainingText, unusedPackageRefundAmount, type TrainingActor } from "./trainingPolicy";
import { counterAttemptsForWorkspace, startTrainingCardRefund, startTrainingCardSale } from "./counterPayments";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { allowedAppointmentTransitions } from "./trainerAppointmentPolicy";
import { confirmedIntentResult, recordIntentResult } from "./staffIntents";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

export async function getTrainingWorkspace(
  _root: unknown,
  { skip = 0, cardSkip = 0, availabilitySkip = 0, memberQuery }: { skip?: number; cardSkip?: number; availabilitySkip?: number; memberQuery?: string | null },
  context: Context,
) {
  const actor = trainingActorFromContext(context);
  for (const value of [skip, cardSkip, availabilitySkip]) if (!Number.isInteger(value) || value < 0 || value > 100_000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } });
  const where = { organizationId: actor.organizationId };
  const memberScope = { ...where, ...(actor.canManageAppointments ? {} : { memberId: member?.id || "__no_member__" }) };
  // The signed-in coach's own active profile, looked up exactly (never derived from a page of options).
  const ownInstructor = actor.isInstructor ? await tx.instructor.findFirst({ where: { ...where, userId: actor.userId, isActive: true }, select: { id: true, userId: true, user: { select: { name: true } } } }) : null;
  const search = String(memberQuery || "").trim().slice(0, 100);
  const memberSearch = search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {};
  const [packages, appointments, instructorRows, locationRows, resourceRows, availabilityRows, memberRows, assignments, leads, timeZone] = await Promise.all([
    tx.trainingPackage.findMany({ where: memberScope, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 51, skip, select: { id: true, memberId: true, locationId: true, serviceName: true, durationMinutes: true, totalCredits: true, creditsRemaining: true, amount: true, currencyCode: true, expiresAt: true, status: true, terms: true, refundAmount: true } }),
    tx.trainerAppointment.findMany({ where: { ...where, ...(actor.canManageAppointments ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...(actor.isInstructor ? [{ instructor: { userId: actor.userId, isActive: true } }] : [])] }) }, orderBy: [{ startTime: "desc" }, { id: "asc" }], take: 51, skip, include: { instructor: { select: { userId: true } } } }),
    tx.instructor.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: { id: "asc" }, select: { id: true, userId: true, user: { select: { name: true } } } }),
    tx.location.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    tx.gymResource.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, locationId: true } }),
    tx.trainerAvailability.findMany({ where, skip: availabilitySkip, take: 201, orderBy: [{ instructorId: "asc" }, { id: "asc" }], select: { id: true, instructorId: true, locationId: true, type: true, date: true, dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true, isAvailable: true, reason: true } }),
    // Managers search the directory; a coach chooses only from members they already train.
    actor.canManageAppointments || actor.canManagePrograms || actor.canManagePeople
      ? tx.member.findMany({ where: { ...where, ...memberSearch }, take: 201, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } })
      : ownInstructor
        ? tx.member.findMany({ where: { ...where, ...memberSearch, status: "active", trainerAppointments: { some: { instructorId: ownInstructor.id, status: { in: ["confirmed", "checked_in", "completed"] } } } }, take: 201, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } })
        : [],
    // Each assignment carries the member and coach it concerns, read through the assignment itself.
    tx.coachingAssignment.findMany({ where: { ...where, ...(actor.canManagePrograms ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...(ownInstructor ? [{ instructorId: ownInstructor.id }] : [])] }) }, take: 51, skip, orderBy: [{ dueAt: "desc" }, { id: "asc" }], select: { id: true, title: true, instructions: true, dueAt: true, status: true, memberId: true, instructorId: true, memberEvidence: true, review: true, submittedAt: true, reviewedAt: true, member: { select: { name: true } }, instructor: { select: { user: { select: { name: true } } } } } }),
    actor.canManagePeople ? tx.trainingLead.findMany({ where, take: 51, skip, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, name: true, email: true, source: true, status: true, trialAt: true, nextActionAt: true, memberId: true, history: true } }) : [],
    businessTimeZone(tx, actor.organizationId),
  ]);
  const cardPayments = actor.canManageAppointments ? await counterAttemptsForWorkspace(tx, actor.organizationId, "training", cardSkip) : { rows: [], hasMore: false, skip: 0 };
  const instructors = instructorRows.slice(0, 500);
  // The own profile is always selectable for the coach, even past the first page of coaches.
  if (ownInstructor && !instructors.some((row: any) => row.id === ownInstructor.id)) instructors.push(ownInstructor);
  const locations = locationRows.slice(0, 500), resources = resourceRows.slice(0, 500);
  const availability = availabilityRows.slice(0, 200), members = memberRows.slice(0, 200);
  // Staff see who each appointment and package belongs to (their own rows only for coaches).
  const peopleIds = [...new Set([...appointments.map((row: any) => row.memberId), ...packages.map((row: any) => row.memberId)].filter(Boolean))];
  const people = peopleIds.length && (actor.canManageAppointments || actor.isInstructor)
    ? await tx.member.findMany({ where: { ...where, id: { in: peopleIds } }, select: { id: true, name: true } })
    : [];
  const personName = new Map(people.map((row: any) => [row.id, row.name]));
  const ownCoach = new Map(instructors.map((row: any) => [row.id, row.id === ownInstructor?.id]));
  const hasMore = appointments.length > 50 || packages.length > 50 || assignments.length > 50 || leads.length > 50;
  return {
    memberId: member?.id, canManageAppointments: actor.canManageAppointments, canManagePrograms: actor.canManagePrograms, canManagePeople: actor.canManagePeople, isInstructor: actor.isInstructor,
    ownInstructorId: ownInstructor?.id ?? null,
    timeZone, skip, hasMore,
    optionsTruncated: { instructors: instructorRows.length > 500, locations: locationRows.length > 500, resources: resourceRows.length > 500 },
    availabilitySkip, availabilityHasMore: availabilityRows.length > 200,
    memberQuery: search, membersHasMore: memberRows.length > 200,
    cardPaymentsHasMore: cardPayments.hasMore, cardSkip: cardPayments.skip,
    packages: packages.slice(0, 50).map((row: any) => ({ ...row, memberName: personName.get(row.memberId) ?? null })),
    appointments: appointments.slice(0, 50).map((row: any) => ({
      ...appointmentProjection(row),
      memberName: personName.get(row.memberId) ?? null,
      allowedTransitions: allowedAppointmentTransitions(row.status, { canManage: actor.canManageAppointments, isOwnCoach: Boolean(actor.isInstructor && ownCoach.get(row.instructorId)), isOwnMember: row.memberId === member?.id }),
    })),
    instructors: instructors.map((row: any) => ({ id: row.id, name: row.user?.name || "Instructor" })),
    locations, resources, availability,
    members: members.map((row: any) => ({ id: row.id, name: row.name, email: row.email })),
    assignments: assignments.slice(0, 50).map((row: any) => ({
      ...row, member: undefined, instructor: undefined,
      memberName: row.member?.name || "Member", memberRef: String(row.memberId).slice(-6),
      coachName: row.instructor?.user?.name || "Coach",
    })),
    leads: leads.slice(0, 50), cardPayments: cardPayments.rows,
  };
}

export async function saveTrainerAvailabilityAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const startTime = trainingText(data.startTime, "Start time", 5), endTime = trainingText(data.endTime, "End time", 5);
  if (minutesOfDay(startTime) >= minutesOfDay(endTime)) throw new Error("Availability must end after it starts on the same local day");
  if (!["recurring", "one_time", "time_off"].includes(data.type)) throw new Error("Invalid availability type");
  if (data.type === "recurring" && (typeof data.dayOfWeek !== "number" || !Number.isInteger(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6)) throw new Error("Choose the weekday for recurring availability");
  const date = data.date ? new Date(data.date) : null;
  if (data.type !== "recurring" && (!date || !Number.isFinite(date.getTime()))) throw new Error("A dated availability needs a date");
  // Effective bounds limit a recurring pattern; omitted bounds keep what is saved.
  const bound = (value: unknown, label: string) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date`);
    return parsed;
  };
  const effectiveFrom = bound(data.effectiveFrom, "Effective from");
  const effectiveTo = bound(data.effectiveTo, "Effective until");
  const values: Record<string, unknown> = { instructorId: data.instructorId, locationId: data.locationId, type: data.type, dayOfWeek: data.type === "recurring" ? data.dayOfWeek : null, date, startTime, endTime, isAvailable: data.type !== "time_off" && data.isAvailable !== false, reason: trainingText(data.reason || "", "Reason", 1000, false),
    ...(effectiveFrom !== undefined ? { effectiveFrom } : {}), ...(effectiveTo !== undefined ? { effectiveTo } : {}) };
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor.organizationId}`);
    // The form's request key makes a retried save the same save: a confirmed one is replayed.
    const confirmed = await confirmedIntentResult(tx, actor.organizationId, data.requestKey);
    if (confirmed?.availabilityId) return { id: confirmed.availabilityId, reused: true };
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    const location = await tx.location.findUnique({ where: { id: data.locationId } });
    assertTrainingTenant(instructor, actor, "Instructor"); assertTrainingTenant(location, actor, "Location");
    if (data.id) {
      const row = await tx.trainerAvailability.findUnique({ where: { id: data.id } }); assertTrainingTenant(row, actor, "Availability");
      if (row.instructorId !== instructor.id || row.locationId !== location.id) throw new Error("Availability owner and location cannot be changed");
      if (values.effectiveFrom === undefined) values.effectiveFrom = row.effectiveFrom;
      if (values.effectiveTo === undefined) values.effectiveTo = row.effectiveTo;
    }
    if (values.effectiveFrom && values.effectiveTo && (values.effectiveTo as Date) <= (values.effectiveFrom as Date)) throw new Error("Effective until must be after effective from");
    const rows = await tx.trainerAvailability.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Availability limit reached");
    const next = [...rows.filter((row: any) => row.id !== data.id), values];
    const appointments = await tx.trainerAppointment.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id, endTime: { gt: new Date() }, status: { in: ["scheduled", "confirmed", "checked_in"] } }, take: 1000 });
    if (appointments.length >= 1000) throw new Error("Upcoming appointments require review before availability changes");
    const timeZone = await businessTimeZone(tx, actor.organizationId);
    for (const appointment of appointments) assertTrainerAvailable(next, new Date(appointment.startTime), new Date(appointment.endTime), timeZone);
    const row = data.id ? await tx.trainerAvailability.update({ where: { id: data.id }, data: values }) : await tx.trainerAvailability.create({ data: { ...values, organizationId: actor.organizationId } });
    await recordIntentResult(tx, actor.organizationId, data.requestKey, { availabilityId: row.id });
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
    // Only the current, active assigned coach (or a program manager) reviews or cancels.
    const coach = actor.canManagePrograms || (actor.isInstructor && row.instructor?.isActive === true && row.instructor?.userId === actor.userId);
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
    const source = trainingText(data.source || row?.source || "operator", "Source", 200);
    const sameInstant = (a: unknown, b: Date | null) => (a ? new Date(a as string).getTime() : null) === (b ? b.getTime() : null);
    // A replay is only a no-op when every field is unchanged; a new date or source is saved.
    if (history.length && row?.status === data.status && history[history.length - 1]?.note === note && row.name === name && row.source === source &&
        sameInstant(row.trialAt, trialAt || (row.trialAt ? new Date(row.trialAt) : null)) && sameInstant(row.nextActionAt, nextActionAt) &&
        (!data.memberId || row.memberId === data.memberId)) return { id: row.id, reused: true };
    if (history.length >= 500) throw new Error("Case history limit reached; archive through retention policy");
    const entry = { at: new Date().toISOString(), actorId: actor.userId, from: row?.status || null, to: data.status, note };
    const values = { name, status: data.status, source, trialAt: trialAt || row?.trialAt || null, nextActionAt, ...(data.status === "converted" ? { memberId: data.memberId } : {}), history: [...history, entry] };
    const result = row ? await tx.trainingLead.update({ where: { id: row.id }, data: values }) : await tx.trainingLead.create({ data: { organizationId: actor.organizationId, email, ownerId: actor.userId, ...values } });
    return { id: result.id, status: result.status };
  });
}

export const trainingWorkspaceTypeDefs = `
  extend type Query { trainingWorkspace(skip: Int = 0, cardSkip: Int = 0, availabilitySkip: Int = 0, memberQuery: String): JSON! }
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
export async function recordTrainingPackage(_r: unknown, { data }: any, ctx: Context) {
  const actor = trainingActorFromContext(ctx);
  // Card packages are issued from their reserved, provider-verified counter checkout only.
  if (data?.mode === "startCard") return startTrainingCardSale(ctx, actor, data);
  if (data?.tender === "card") throw new Error("Card packages are recorded from their card checkout");
  return recordSettledTrainingPackage(ctx.prisma, { ...data, cardPayment: false }, actor);
}

/** Card-paid packages reserve their unused credits, then refund them to the original card. */
export async function refundTrainingPackage(_r: unknown, { data }: any, ctx: Context) {
  const actor = trainingActorFromContext(ctx);
  const prisma = guardKeystonePrismaResults(ctx.prisma as any);
  const pack = await prisma.trainingPackage.findUnique({ where: { id: String(data?.packageId || "") } });
  if (pack && pack.organizationId === actor.organizationId && pack.terms?.tender === "card" && pack.status === "active") return startTrainingCardRefund(ctx, actor, data);
  return recordTrainingPackageRefund(ctx.prisma, data, actor);
}
export async function saveTrainerAvailability(_r: unknown, { data }: any, ctx: Context) { return saveTrainerAvailabilityAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function assignCoaching(_r: unknown, { data }: any, ctx: Context) { return assignCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function transitionCoaching(_r: unknown, { data }: any, ctx: Context) { return transitionCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
export async function saveTrainingLead(_r: unknown, { data }: any, ctx: Context) { return saveTrainingLeadAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
