"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/keystone/lib/operational-policy.ts
var operational_policy_exports = {};
__export(operational_policy_exports, {
  assertParticipationAllowed: () => assertParticipationAllowed,
  isAdult: () => isAdult,
  lockParticipationPolicy: () => lockParticipationPolicy
});
async function lockParticipationPolicy(tx, organizationId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`participation:${organizationId}`}))`;
}
function isAdult(birthDate, at) {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  if (!Number.isFinite(birth.getTime()) || birth > at) return false;
  let years = at.getUTCFullYear() - birth.getUTCFullYear();
  if (at.getUTCMonth() < birth.getUTCMonth() || at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate()) years--;
  return years >= 18;
}
async function assertParticipationAllowed(tx, organizationId, memberId, at, locationId) {
  await lockParticipationPolicy(tx, organizationId);
  const closure = await tx.operationsCase.findFirst({ where: {
    organizationId,
    kind: "closure",
    status: { not: "resolved" },
    // Without a site, fail closed when any site in this organization is closed.
    ...locationId ? { OR: [{ locationId: "" }, { locationId }] } : {}
  } });
  if (closure) throw new Error("Participation is unavailable during an active facility closure");
  const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!policy) return;
  if (!memberId) {
    if (policy.enforceWaiver || policy.adultOnly) throw new Error("Registered participant verification is required by studio policy");
    return;
  }
  const member = await tx.member.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new Error("Member not found");
  if (policy.adultOnly && !isAdult(member.dateOfBirth, at)) throw new Error("Adult age verification is required before participation");
  if (!policy.enforceWaiver) return;
  const evidence = await tx.participationEvidence.findFirst({ where: {
    organizationId,
    memberId,
    policyId: policy.id,
    revokedAt: null,
    acceptedAt: { lte: at },
    OR: [{ expiresAt: null }, { expiresAt: { gt: at } }]
  } });
  if (!evidence) throw new Error("Current waiver verification is required before participation");
}
var init_operational_policy = __esm({
  "features/keystone/lib/operational-policy.ts"() {
    "use strict";
  }
});

// features/keystone/lib/operational-notices.ts
async function enqueueOperationalNotice(tx, input) {
  const key = operationKey(input.organizationId, input.key);
  return tx.operationalNotice.upsert({ where: { key }, update: {}, create: {
    organizationId: input.organizationId,
    memberId: input.memberId,
    key,
    kind: input.kind,
    message: input.message.slice(0, 2e3),
    status: "pending",
    history: []
  } });
}
async function createFinanceException(tx, input) {
  const key = operationKey(input.organizationId, `finance:${input.key}`);
  return tx.operationsCase.upsert({ where: { key }, update: {}, create: {
    organizationId: input.organizationId,
    key,
    kind: "finance",
    reference: input.reference.slice(0, 200),
    summary: `${input.kind}: ${input.summary}`.slice(0, 2e3),
    status: "open",
    openedBy: "provider",
    history: []
  } });
}
var import_node_crypto2, operationKey;
var init_operational_notices = __esm({
  "features/keystone/lib/operational-notices.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
    operationKey = (organizationId, key) => (0, import_node_crypto2.createHash)("sha256").update(`${organizationId}:${key}`).digest("hex");
  }
});

// features/keystone/mutations/classCapacity.ts
var classCapacity_exports = {};
__export(classCapacity_exports, {
  assertNoMemberServiceConflict: () => assertNoMemberServiceConflict,
  createCapacityControlledBooking: () => createCapacityControlledBooking,
  lockTransactionKey: () => lockTransactionKey,
  promoteCapacityControlledWaitlistBooking: () => promoteCapacityControlledWaitlistBooking,
  promoteCapacityControlledWaitlistBookingInTransaction: () => promoteCapacityControlledWaitlistBookingInTransaction,
  updateCapacityControlledClassInstance: () => updateCapacityControlledClassInstance,
  updateCapacityControlledClassSchedule: () => updateCapacityControlledClassSchedule,
  updateCapacityControlledClassScheduleInTransaction: () => updateCapacityControlledClassScheduleInTransaction
});
async function lockTransactionKey(transaction, key) {
  await transaction.$queryRaw`
    SELECT true AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired
  `;
}
function boundedCapacity(value, allowNull = false) {
  if (allowNull && value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 1e4) {
    throw new Error("Capacity must be a whole number between 1 and 10000");
  }
  return value;
}
async function updateCapacityControlledClassInstance(prisma, input) {
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.organizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    const instance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.organizationId },
      include: { classSchedule: { select: { maxCapacity: true } }, resource: { select: { capacity: true } } }
    });
    if (!instance || instance.organizationId !== input.organizationId) {
      throw new Error("Class instance was not found in this organization");
    }
    const requested = boundedCapacity(input.maxCapacity, true);
    const effectiveCapacity = requested ?? instance.classSchedule?.maxCapacity;
    if (typeof effectiveCapacity !== "number") throw new Error("Class instance capacity is unavailable");
    if (instance.resource && effectiveCapacity > instance.resource.capacity) throw new Error("Class capacity exceeds resource capacity");
    const confirmed = await transaction.classBooking.count({
      where: { classInstanceId: instance.id, organizationId: input.organizationId, status: "confirmed" }
    });
    if (effectiveCapacity < confirmed) {
      throw new Error(`Capacity cannot be lower than the ${confirmed} confirmed bookings`);
    }
    return transaction.classInstance.update({
      where: { id: instance.id },
      data: { maxCapacity: requested }
    });
  });
}
async function updateCapacityControlledClassScheduleInTransaction(transaction, input, beforeCapacityWrite) {
  const maxCapacity = boundedCapacity(input.maxCapacity);
  await lockParticipationPolicy(transaction, input.organizationId);
  await lockTransactionKey(transaction, `class-schedule:${input.classScheduleId}`);
  const schedule = await transaction.classSchedule.findFirst({
    where: { id: input.classScheduleId, organizationId: input.organizationId },
    include: { resource: { select: { capacity: true } } }
  });
  if (!schedule || schedule.organizationId !== input.organizationId) {
    throw new Error("Class schedule was not found in this organization");
  }
  if (schedule.resource && maxCapacity > schedule.resource.capacity) throw new Error("Schedule capacity exceeds resource capacity");
  const inheritedInstances = await transaction.classInstance.findMany({
    where: { classScheduleId: schedule.id, organizationId: input.organizationId, maxCapacity: null },
    select: { id: true, resource: { select: { capacity: true } } },
    orderBy: { id: "asc" }
  });
  for (const instance of inheritedInstances) {
    if (instance.resource && maxCapacity > instance.resource.capacity) throw new Error("Schedule capacity exceeds an occurrence resource capacity");
    await lockTransactionKey(transaction, `class-instance:${instance.id}`);
  }
  if (beforeCapacityWrite) await beforeCapacityWrite();
  const instanceIds = inheritedInstances.map((instance) => instance.id);
  if (instanceIds.length) {
    const counts = await transaction.classBooking.groupBy({
      by: ["classInstanceId"],
      where: {
        classInstanceId: { in: instanceIds },
        organizationId: input.organizationId,
        status: "confirmed"
      },
      _count: { _all: true }
    });
    const highestConfirmed = counts.reduce(
      (highest, row) => Math.max(highest, row._count._all),
      0
    );
    if (maxCapacity < highestConfirmed) {
      throw new Error(`Capacity cannot be lower than the ${highestConfirmed} confirmed bookings on a class instance`);
    }
  }
  return transaction.classSchedule.update({
    where: { id: schedule.id },
    data: { maxCapacity }
  });
}
async function updateCapacityControlledClassSchedule(prisma, input) {
  return prisma.$transaction(
    (transaction) => updateCapacityControlledClassScheduleInTransaction(transaction, input)
  );
}
async function createCapacityControlledBooking(prisma, input) {
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actorOrganizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);
    const classInstance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actorOrganizationId },
      include: { classSchedule: { select: { maxCapacity: true, startTime: true, endTime: true } } }
    });
    if (!classInstance) throw new Error("Class instance not found");
    if (classInstance.organizationId !== input.actorOrganizationId) throw new Error("Class is not in the actor's organization");
    if (classInstance.isCancelled) throw new Error("Class has been cancelled");
    if (classInstance.date.getTime() <= Date.now()) throw new Error("Past classes cannot be booked");
    const member = await transaction.member.findFirst({
      where: { id: input.memberId, organizationId: input.actorOrganizationId },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    if (!member) throw new Error("Member not found");
    if (member.organizationId !== input.actorOrganizationId) throw new Error("Member is not in the actor's organization");
    if (!member.user) throw new Error("Member is not linked to a user account");
    if (member.status !== "active") throw new Error("Member account is not active");
    if (member.user.id !== input.actorUserId && !input.actorCanManageAllRecords) {
      throw new Error("You cannot manage bookings for another member");
    }
    const membership = await transaction.membership.findFirst({
      where: { memberId: member.user.id, organizationId: input.actorOrganizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } }
    });
    if (!membership) throw new Error("No active membership found");
    await assertParticipationAllowed(transaction, input.actorOrganizationId, member.id, classInstance.date, classInstance.locationId);
    const grant = await ensureMonthlyCreditGrant(transaction, membership, classInstance.date);
    const unlimited = grant.allowance === -1;
    const currentCredits = grant.remaining;
    if (!unlimited && currentCredits <= 0) {
      throw new Error("No class credits remaining");
    }
    const maximumBookings = membership.agreementSnapshot?.maxClassBookings ?? membership.tier?.maxClassBookings ?? 0;
    if (maximumBookings > 0 && await transaction.classBooking.count({ where: { organizationId: input.actorOrganizationId, memberId: member.id, status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: /* @__PURE__ */ new Date() } } } }) >= maximumBookings) throw new Error("Membership concurrent booking limit reached");
    const duplicate = await transaction.classBooking.findFirst({
      where: {
        classInstanceId: input.classInstanceId,
        memberId: input.memberId,
        organizationId: input.actorOrganizationId,
        status: { in: ["confirmed", "waitlist"] }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new Error("Member already has an active booking for this class instance");
    }
    const capacity = classInstance.maxCapacity ?? classInstance.classSchedule?.maxCapacity ?? 20;
    const confirmedCount = await transaction.classBooking.count({
      where: {
        classInstanceId: input.classInstanceId,
        organizationId: input.actorOrganizationId,
        status: "confirmed"
      }
    });
    const atCapacity = confirmedCount >= capacity;
    if (atCapacity && input.capacityMode === "reject") {
      throw new Error("Class is at capacity, cannot process walk-in");
    }
    const waitlistPosition = atCapacity ? await transaction.classBooking.count({
      where: {
        classInstanceId: input.classInstanceId,
        organizationId: input.actorOrganizationId,
        status: "waitlist"
      }
    }) + 1 : null;
    const status = atCapacity ? "waitlist" : "confirmed";
    if (status === "confirmed") await assertNoMemberServiceConflict(transaction, member.id, input.actorOrganizationId, classInstance);
    const booking = await transaction.classBooking.create({
      data: {
        organizationId: classInstance.organizationId,
        classInstanceId: input.classInstanceId,
        memberId: input.memberId,
        memberName: member.user.name || member.name,
        memberEmail: member.user.email || member.email,
        memberPhone: member.phone || "",
        status,
        activeBookingKey: "active",
        waitlistPosition,
        bookedAt: /* @__PURE__ */ new Date()
      },
      select: { id: true }
    });
    if (status === "confirmed") await debitBookingCredit(transaction, membership, booking.id, classInstance.date);
    await enqueueOperationalNotice(transaction, {
      organizationId: input.actorOrganizationId,
      memberId: member.id,
      key: `booking:${booking.id}:created`,
      kind: "booking",
      message: status === "confirmed" ? "Your class booking is confirmed." : "You joined the waitlist. A released place is automatically confirmed and reserves any required class credit; we will notify you."
    });
    return {
      bookingId: booking.id,
      status,
      waitlistPosition,
      creditsRemaining: unlimited ? -1 : currentCredits - (status === "confirmed" ? 1 : 0)
    };
  });
}
async function promoteCapacityControlledWaitlistBooking(prisma, classInstanceId, organizationId) {
  return prisma.$transaction(
    (transaction) => promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId)
  );
}
async function promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId, locksAlreadyHeld = false) {
  if (!locksAlreadyHeld) {
    await lockParticipationPolicy(transaction, organizationId);
    await lockTransactionKey(transaction, `class-instance:${classInstanceId}`);
  }
  const classInstance = await transaction.classInstance.findFirst({
    where: { id: classInstanceId, organizationId },
    include: { classSchedule: { select: { maxCapacity: true, startTime: true, endTime: true } } }
  });
  if (!classInstance) throw new Error("Class instance not found");
  if (classInstance.organizationId !== organizationId) throw new Error("Class is not in the requested organization");
  if (classInstance.isCancelled) {
    return { promoted: false, message: "Class has been cancelled" };
  }
  if (classInstance.date.getTime() <= Date.now()) {
    return { promoted: false, message: "Past classes cannot promote a waitlist" };
  }
  const capacity = classInstance.maxCapacity ?? classInstance.classSchedule?.maxCapacity ?? 20;
  const confirmedCount = await transaction.classBooking.count({
    where: { classInstanceId, organizationId, status: "confirmed" }
  });
  if (confirmedCount >= capacity) {
    return { promoted: false, message: "Class is already at capacity" };
  }
  const candidates = await transaction.classBooking.findMany({
    where: { classInstanceId, organizationId, status: "waitlist" },
    orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
    take: 1e4,
    include: {
      member: { include: { user: { select: { id: true } } } }
    }
  });
  if (!candidates.length) return { promoted: false, message: "No members on waitlist" };
  let booking = null;
  let membership = null;
  for (const candidate of candidates) {
    if (candidate.member?.organizationId !== organizationId) {
      throw new Error("Waitlisted member is not in the class organization");
    }
    if (candidate.member?.status !== "active" || !candidate.member?.user?.id) continue;
    const candidateMembership = await transaction.membership.findFirst({
      where: { memberId: candidate.member.user.id, organizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } }
    });
    if (!candidateMembership) continue;
    await lockTransactionKey(transaction, `member:${candidate.memberId}`);
    const lockedMembership = await transaction.membership.findFirst({
      where: { id: candidateMembership.id, organizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } }
    });
    if (!lockedMembership) continue;
    const lockedMember = await transaction.member.findFirst({ where: { id: candidate.memberId, organizationId, status: "active" } });
    if (!lockedMember) continue;
    try {
      await assertParticipationAllowed(transaction, organizationId, candidate.memberId, classInstance.date, classInstance.locationId);
      await assertNoMemberServiceConflict(transaction, candidate.memberId, organizationId, classInstance);
      const grant = await ensureMonthlyCreditGrant(transaction, lockedMembership, classInstance.date);
      if (grant.allowance !== -1 && grant.remaining <= 0) continue;
    } catch (error) {
      if (!(error instanceof Error) || !/Membership|membership|Service is outside|waiver|Waiver|closure|closed|participation|Adult age verification|Registered participant verification|overlapping training appointment|overlapping class/i.test(error.message)) throw error;
      await transaction.classBooking.update({ where: { id: candidate.id }, data: { eligibilityReviewReason: error.message } });
      continue;
    }
    booking = candidate;
    membership = lockedMembership;
    break;
  }
  if (!booking || !membership) {
    return { promoted: false, message: "No eligible members on waitlist" };
  }
  await transaction.classBooking.update({
    where: { id: booking.id },
    data: { status: "confirmed", waitlistPosition: null }
  });
  await debitBookingCredit(transaction, membership, booking.id, classInstance.date);
  const remaining = await transaction.classBooking.findMany({
    where: { classInstanceId, organizationId, status: "waitlist" },
    orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
    select: { id: true }
  });
  for (let index = 0; index < remaining.length; index++) {
    await transaction.classBooking.update({ where: { id: remaining[index].id }, data: { waitlistPosition: index + 1 } });
  }
  const promotionNotice = await enqueueOperationalNotice(transaction, {
    organizationId,
    memberId: booking.memberId,
    key: `booking:${booking.id}:promoted`,
    kind: "promotion",
    message: "A waitlist place opened. Your booking is now confirmed and any required credit has been reserved for this class."
  });
  if (promotionNotice instanceof Error) throw promotionNotice;
  return { promoted: true, bookingId: booking.id, message: "Member promoted from waitlist" };
}
async function assertNoMemberServiceConflict(tx, memberId, organizationId, instance) {
  const minutes = (value) => Number(value?.slice(0, 2)) * 60 + Number(value?.slice(3));
  const duration = minutes(instance.classSchedule?.endTime) - minutes(instance.classSchedule?.startTime);
  const end = instance.endsAt || new Date(instance.date.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 60) * 6e4);
  const conflict = await tx.trainerAppointment.findFirst({ where: { organizationId, memberId, status: { in: ["scheduled", "confirmed", "checked_in"] }, startTime: { lt: end }, endTime: { gt: instance.date } }, select: { id: true } });
  if (conflict) throw new Error("Member has an overlapping training appointment");
  const booked = await tx.classBooking.findMany({ where: { organizationId, memberId, classInstanceId: { not: instance.id }, status: "confirmed", classInstance: { isCancelled: false, date: { lt: end, gt: new Date(instance.date.getTime() - 864e5) } } }, include: { classInstance: { include: { classSchedule: true } } }, take: 1e3 });
  if (booked.length >= 1e3) throw new Error("Member service calendar requires review");
  for (const booking of booked) {
    const other = booking.classInstance;
    if (!other) throw new Error("Member booking has no service occurrence; review required");
    const otherDuration = minutes(other.classSchedule?.endTime) - minutes(other.classSchedule?.startTime);
    const otherEnd = other.endsAt || new Date(other.date.getTime() + (Number.isFinite(otherDuration) && otherDuration > 0 ? otherDuration : 60) * 6e4);
    if (other.date < end && otherEnd > instance.date) throw new Error("Member has an overlapping class");
  }
}
var init_classCapacity = __esm({
  "features/keystone/mutations/classCapacity.ts"() {
    "use strict";
    init_membership_credits();
    init_operational_policy();
    init_operational_notices();
  }
});

// features/keystone/lib/membership-credits.ts
function monthlyServicePeriod(membership, at) {
  const start = new Date(membership.creditPeriodStart || membership.startDate);
  const end = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || at < start || at >= end) {
    throw new Error("Service is outside the paid membership period");
  }
  const monthAt = (offset2) => {
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(start.getUTCMonth() + offset2);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return result;
  };
  let offset = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
  if (monthAt(offset) > at) offset -= 1;
  const periodStart = monthAt(offset);
  const next = monthAt(offset + 1);
  const periodEnd = next < end ? next : end;
  return { periodStart, periodEnd };
}
function assertMembershipServiceEligibility(membership, at) {
  if (!membership || membership.status !== "active") throw new Error("Membership is not active");
  monthlyServicePeriod(membership, at);
  if (membership.freezeStartDate && at >= new Date(membership.freezeStartDate) && (!membership.freezeEndDate || at < new Date(membership.freezeEndDate))) {
    throw new Error("Membership is frozen for this service date");
  }
}
async function ensureMonthlyCreditGrant(tx, membership, at) {
  assertMembershipServiceEligibility(membership, at);
  const { periodStart, periodEnd } = monthlyServicePeriod(membership, at);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  const key = `${membership.id}:${periodStart.toISOString()}`;
  const existing = await tx.membershipCreditGrant.findUnique({ where: { key } });
  if (existing) return existing;
  const anyGrant = await tx.membershipCreditGrant.findFirst({ where: { membershipId: membership.id } });
  const now = /* @__PURE__ */ new Date();
  const remaining = allowance === -1 ? -1 : !anyGrant && periodStart.getTime() === new Date(membership.creditPeriodStart || membership.startDate).getTime() && periodStart <= now && now < periodEnd ? Math.min(Math.max(membership.classCreditsRemaining ?? 0, 0), Math.max(allowance, 0)) : allowance;
  return tx.membershipCreditGrant.create({ data: {
    key,
    organizationId: membership.organizationId,
    membershipId: membership.id,
    periodStart,
    periodEnd,
    allowance,
    remaining
  } });
}
async function debitBookingCredit(tx, membership, bookingId, at) {
  const key = `${bookingId}:debit`;
  const existing = await tx.membershipCreditEntry.findUnique({ where: { key } });
  if (existing) return tx.membershipCreditGrant.findUnique({ where: { id: existing.grantId } });
  const grant = await ensureMonthlyCreditGrant(tx, membership, at);
  if (grant.allowance !== -1 && grant.remaining <= 0) throw new Error("No class credits remaining for this service month");
  const amount = grant.allowance === -1 ? 0 : -1;
  const updated = amount ? await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: 1 } } }) : grant;
  await tx.membershipCreditEntry.create({ data: {
    key,
    organizationId: membership.organizationId,
    grantId: grant.id,
    bookingId,
    delta: amount,
    kind: "booking"
  } });
  await updateCurrentCreditDisplay(tx, membership.id);
  return updated;
}
async function restoreBookingCredit(tx, bookingId) {
  const debit = await tx.membershipCreditEntry.findUnique({ where: { key: `${bookingId}:debit` } });
  if (!debit) {
    await tx.classBooking.update({ where: { id: bookingId }, data: { eligibilityReviewReason: "Legacy booking has no credit provenance; staff must review any credit adjustment" } });
    return false;
  }
  const key = `${bookingId}:restore`;
  if (await tx.membershipCreditEntry.findUnique({ where: { key } })) return false;
  const grant = await tx.membershipCreditGrant.findUnique({ where: { id: debit.grantId } });
  if (!grant) throw new Error("Credit source grant is missing");
  if (debit.delta < 0) await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { remaining: { increment: -debit.delta } } });
  await tx.membershipCreditEntry.create({ data: { key, organizationId: grant.organizationId, grantId: grant.id, bookingId, delta: -debit.delta, kind: "restoration" } });
  await updateCurrentCreditDisplay(tx, grant.membershipId);
  return debit.delta < 0;
}
async function updateCurrentCreditDisplay(tx, membershipId) {
  const now = /* @__PURE__ */ new Date();
  const current = await tx.membershipCreditGrant.findFirst({ where: { membershipId, periodStart: { lte: now }, periodEnd: { gt: now } }, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }] });
  if (current) await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: current.remaining } });
}
async function reviewFutureMembershipBookings(tx, membership) {
  const bookings = await tx.classBooking.findMany({ where: {
    organizationId: membership.organizationId,
    member: { userId: membership.memberId },
    status: { in: ["confirmed", "waitlist"] },
    classInstance: { date: { gt: /* @__PURE__ */ new Date() } }
  }, include: { classInstance: true, member: { select: { status: true } } }, take: 1e3 });
  for (const booking of bookings) {
    let reason = "";
    try {
      if (booking.member?.status !== "active") throw new Error(`Member account is ${booking.member?.status || "unavailable"}`);
      assertMembershipServiceEligibility(membership, booking.classInstance.date);
    } catch (error) {
      reason = error instanceof Error ? error.message : "Eligibility requires review";
    }
    await tx.classBooking.update({ where: { id: booking.id }, data: { eligibilityReviewReason: reason } });
  }
  return bookings.length;
}
async function refreshMemberEntitlement(context, organizationId, userId) {
  const session = context.session;
  if (!session?.itemId || session.data?.organization?.id !== organizationId || session.itemId !== userId && !session.data?.role?.canManageAllRecords) throw new Error("Membership owner or manager permission required");
  const identity = await context.prisma.membership.findFirst({ where: { organizationId, memberId: userId }, select: { id: true } });
  if (!identity) return { refreshed: false, reason: "No membership" };
  return refreshScopedMembership(context.prisma, organizationId, identity.id);
}
async function refreshScopedMembership(prisma, organizationId, membershipId) {
  const { lockParticipationPolicy: lockParticipationPolicy2 } = await Promise.resolve().then(() => (init_operational_policy(), operational_policy_exports));
  const { lockTransactionKey: lockTransactionKey2 } = await Promise.resolve().then(() => (init_classCapacity(), classCapacity_exports));
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy2(tx, organizationId);
    await lockTransactionKey2(tx, `membership:${membershipId}`);
    let membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    if (!membership) throw new Error("Membership not found");
    const member = await tx.member.findFirst({ where: { organizationId, userId: membership.memberId } });
    if (!member) return { refreshed: false, reason: "Member record missing", membershipId };
    await lockTransactionKey2(tx, `member:${member.id}`);
    membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    const now = /* @__PURE__ */ new Date();
    const paidEnd = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
    if (membership.status === "active" && Number.isFinite(paidEnd.getTime()) && paidEnd <= now) {
      membership = await tx.membership.update({ where: { id: membershipId }, data: { status: "expired" }, include: { tier: true } });
    }
    let refreshed = false, reason = "";
    if (membership.status === "active" && member.status === "active") {
      try {
        assertMembershipServiceEligibility(membership, now);
      } catch (error) {
        reason = error instanceof Error ? error.message : "Membership requires review";
      }
      if (!reason) {
        const grant = await ensureMonthlyCreditGrant(tx, membership, now);
        await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: grant.remaining } });
        refreshed = true;
      }
    } else reason = `Member ${member.status}; membership ${membership.status}`;
    const reviewed = await reviewFutureMembershipBookings(tx, membership);
    if (member.status !== "active") await tx.classBooking.updateMany({ where: { organizationId, memberId: member.id, status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: now } } }, data: { eligibilityReviewReason: `Member account is ${member.status}` } });
    return { refreshed, reason, membershipId, reviewed, reviewLimitReached: reviewed >= 1e3 };
  });
}
var init_membership_credits = __esm({
  "features/keystone/lib/membership-credits.ts"() {
    "use strict";
  }
});

// features/integrations/payment/stripe-adapter.ts
var stripe_adapter_exports = {};
__export(stripe_adapter_exports, {
  assertStripeMembershipPrice: () => assertStripeMembershipPrice,
  stripePaymentProviderAdapter: () => stripePaymentProviderAdapter
});
function getStripeClient() {
  if (process.env.STRIPE_ENABLED !== "true") {
    throw new Error("Stripe checkout is disabled for this Gym deployment.");
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe secret key not configured.");
  return new import_stripe.default(secretKey, { apiVersion: "2023-10-16" });
}
async function ensureCustomer(input) {
  if (input.customerId) return input.customerId;
  const customer = await getStripeClient().customers.create(
    {
      email: input.userEmail,
      name: input.userName,
      metadata: { source: "openfront-gym", userId: input.userId }
    },
    { idempotencyKey: `gym-customer:${input.userId}` }
  );
  return customer.id;
}
function assertStripeMembershipPrice(price, input) {
  const expectedInterval = input.billingCycle === "annual" ? "year" : "month";
  const productId = typeof price.product === "string" ? price.product : price.product?.id;
  const productActive = Boolean(
    typeof price.product === "object" && price.product && !("deleted" in price.product && price.product.deleted) && "active" in price.product && price.product.active
  );
  const valid = productActive && price.active && price.type === "recurring" && price.recurring?.interval === expectedInterval && price.recurring?.interval_count === 1 && price.unit_amount === input.amount && price.currency.toUpperCase() === input.currencyCode.toUpperCase() && (!input.productId || productId === input.productId);
  if (!valid) {
    throw new Error(
      `Stripe ${input.billingCycle} Price must be active, recurring once per ${expectedInterval}, and match the configured plan amount, currency, and product.`
    );
  }
}
var import_stripe, stripePaymentProviderAdapter;
var init_stripe_adapter = __esm({
  "features/integrations/payment/stripe-adapter.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    stripePaymentProviderAdapter = {
      async validateMembershipPrice(input) {
        const price = await getStripeClient().prices.retrieve(input.priceId, {
          expand: ["product"]
        });
        assertStripeMembershipPrice(price, input);
      },
      async createMembershipCheckout(input) {
        const stripe = getStripeClient();
        const customerId = await ensureCustomer(input);
        const session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            customer: customerId,
            client_reference_id: input.idempotencyKey,
            line_items: [{ price: input.priceId, quantity: 1 }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            allow_promotion_codes: true,
            metadata: {
              source: "openfront-gym",
              paymentSessionKey: input.idempotencyKey,
              userId: input.userId,
              tierId: input.tierId,
              billingCycle: input.billingCycle,
              amount: String(input.amount),
              currencyCode: input.currencyCode
            },
            subscription_data: {
              metadata: {
                source: "openfront-gym",
                paymentSessionKey: input.idempotencyKey,
                userId: input.userId,
                tierId: input.tierId,
                billingCycle: input.billingCycle
              }
            }
          },
          { idempotencyKey: input.idempotencyKey }
        );
        if (!session.url) throw new Error("Stripe checkout did not return a redirect URL.");
        return {
          providerSessionId: session.id,
          providerCustomerId: customerId,
          checkoutUrl: session.url,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1e3).toISOString() : null
        };
      },
      retrieveMembershipCheckout(providerSessionId) {
        return getStripeClient().checkout.sessions.retrieve(providerSessionId, {
          expand: ["subscription", "customer"]
        });
      },
      retrieveSubscription(subscriptionId) {
        return getStripeClient().subscriptions.retrieve(subscriptionId);
      },
      async createSetupIntent(customerId) {
        const intent = await getStripeClient().setupIntents.create({
          customer: customerId,
          payment_method_types: ["card"]
        });
        return { id: intent.id, clientSecret: intent.client_secret };
      },
      cancelSubscriptionAtPeriodEnd(subscriptionId, idempotencyKey) {
        return getStripeClient().subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: true },
          idempotencyKey ? { idempotencyKey } : void 0
        );
      },
      pauseSubscription(subscriptionId, resumeDate, idempotencyKey) {
        return getStripeClient().subscriptions.update(subscriptionId, {
          pause_collection: {
            behavior: "void",
            resumes_at: resumeDate ? Math.floor(resumeDate.getTime() / 1e3) : void 0
          }
        }, idempotencyKey ? { idempotencyKey } : void 0);
      },
      resumeSubscription(subscriptionId, idempotencyKey) {
        return getStripeClient().subscriptions.update(subscriptionId, { pause_collection: null }, idempotencyKey ? { idempotencyKey } : void 0);
      },
      async changeSubscriptionPrice(subscriptionId, priceId, metadata, idempotencyKey) {
        const stripe = getStripeClient();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const itemId = subscription.items.data[0]?.id;
        if (!itemId) throw new Error("Stripe subscription has no active line item.");
        return stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: {
            tierId: metadata.tierId,
            billingCycle: metadata.billingCycle
          }
        }, idempotencyKey ? { idempotencyKey } : void 0);
      },
      async createBillingPortalSession(customerId, returnUrl) {
        const session = await getStripeClient().billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl
        });
        return { url: session.url };
      },
      refundPayment(paymentIntentId, amount, idempotencyKey) {
        return getStripeClient().refunds.create(
          {
            payment_intent: paymentIntentId,
            ...amount ? { amount } : {}
          },
          idempotencyKey ? { idempotencyKey } : void 0
        );
      },
      constructWebhookEvent(payload, signature) {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) throw new Error("Stripe webhook secret not configured.");
        return getStripeClient().webhooks.constructEvent(payload, signature, secret);
      }
    };
  }
});

// features/integrations/payment/test-adapter.ts
var test_adapter_exports = {};
__export(test_adapter_exports, {
  resetTestSubscriptionStatesForTesting: () => resetTestSubscriptionStatesForTesting,
  setTestSubscriptionStateForTesting: () => setTestSubscriptionStateForTesting,
  testPaymentProviderAdapter: () => testPaymentProviderAdapter
});
function digest(value) {
  return (0, import_node_crypto3.createHash)("sha256").update(value).digest("hex").slice(0, 24);
}
function encodeSession(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}
function decodeSession(providerSessionId) {
  const encoded = providerSessionId.replace(/^test_cs_/, "");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}
function setTestSubscriptionStateForTesting(subscription) {
  testSubscriptions.set(subscription.id, structuredClone(subscription));
}
function resetTestSubscriptionStatesForTesting() {
  testSubscriptions.clear();
}
function updateTestSubscription(subscriptionId, data) {
  const existing = testSubscriptions.get(subscriptionId);
  const now = Math.floor(Date.now() / 1e3);
  const subscription = {
    id: subscriptionId,
    object: "subscription",
    customer: "test_customer",
    status: "active",
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    metadata: {},
    items: { object: "list", data: [], has_more: false, url: "/v1/subscription_items" },
    ...existing,
    ...data
  };
  testSubscriptions.set(subscriptionId, subscription);
  return structuredClone(subscription);
}
function verifySignature(payload, signature) {
  const secret = process.env.PAYMENT_TEST_WEBHOOK_SECRET;
  if (!secret) throw new Error("Payment test webhook secret not configured.");
  const expected = (0, import_node_crypto3.createHmac)("sha256", secret).update(payload).digest("hex");
  const provided = signature.replace(/^test=/, "");
  if (expected.length !== provided.length || !(0, import_node_crypto3.timingSafeEqual)(Buffer.from(expected), Buffer.from(provided))) {
    throw new Error("Payment test webhook signature verification failed.");
  }
}
var import_node_crypto3, testSubscriptions, testPaymentProviderAdapter;
var init_test_adapter = __esm({
  "features/integrations/payment/test-adapter.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    testSubscriptions = /* @__PURE__ */ new Map();
    testPaymentProviderAdapter = {
      async validateMembershipPrice(input) {
        if (!input.priceId || !Number.isInteger(input.amount) || input.amount < 0) {
          throw new Error("Payment test price configuration is invalid.");
        }
      },
      async createMembershipCheckout(input) {
        if (input.priceId === "test_fail") {
          throw new Error("Payment test adapter forced checkout failure.");
        }
        const providerCustomerId = input.customerId || `test_customer_${digest(input.userId)}`;
        const providerSessionId = `test_cs_${encodeSession({
          userId: input.userId,
          userName: input.userName,
          userEmail: input.userEmail,
          tierId: input.tierId,
          billingCycle: input.billingCycle,
          amount: input.amount,
          currencyCode: input.currencyCode,
          idempotencyKey: input.idempotencyKey,
          providerCustomerId
        })}`;
        return {
          providerSessionId,
          providerCustomerId,
          checkoutUrl: `https://payments.test/checkout/${digest(input.idempotencyKey)}`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1e3).toISOString()
        };
      },
      async retrieveMembershipCheckout(providerSessionId) {
        const data = decodeSession(providerSessionId);
        const now = Math.floor(Date.now() / 1e3);
        const subscriptionId = `test_sub_${digest(data.idempotencyKey)}`;
        const periodEnd = new Date(now * 1e3);
        if (data.billingCycle === "annual") periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
        else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
        const subscription = testSubscriptions.get(subscriptionId) || updateTestSubscription(subscriptionId, {
          customer: data.providerCustomerId,
          status: "active",
          current_period_start: now,
          current_period_end: Math.floor(periodEnd.getTime() / 1e3),
          metadata: {
            paymentSessionKey: data.idempotencyKey,
            userId: data.userId,
            tierId: data.tierId,
            billingCycle: data.billingCycle
          }
        });
        return {
          id: providerSessionId,
          object: "checkout.session",
          mode: "subscription",
          status: "complete",
          payment_status: "paid",
          currency: data.currencyCode.toLowerCase(),
          customer: data.providerCustomerId,
          metadata: {
            source: "openfront-gym-test",
            paymentSessionKey: data.idempotencyKey,
            userId: data.userId,
            tierId: data.tierId,
            billingCycle: data.billingCycle,
            amount: String(data.amount),
            currencyCode: data.currencyCode
          },
          subscription
        };
      },
      async retrieveSubscription(subscriptionId) {
        const subscription = testSubscriptions.get(subscriptionId);
        if (!subscription) throw new Error(`Test subscription ${subscriptionId} is not configured.`);
        return structuredClone(subscription);
      },
      async createSetupIntent(customerId) {
        const id = `test_seti_${digest(customerId)}`;
        return { id, clientSecret: `${id}_secret` };
      },
      async cancelSubscriptionAtPeriodEnd(subscriptionId) {
        return updateTestSubscription(subscriptionId, {
          status: "active",
          cancel_at_period_end: true,
          current_period_end: Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60
        });
      },
      async pauseSubscription(subscriptionId) {
        return updateTestSubscription(subscriptionId, {
          status: "active",
          pause_collection: { behavior: "void", resumes_at: null }
        });
      },
      async resumeSubscription(subscriptionId) {
        return updateTestSubscription(subscriptionId, { status: "active", pause_collection: null });
      },
      async changeSubscriptionPrice(subscriptionId, _priceId, metadata, _idempotencyKey) {
        const current = testSubscriptions.get(subscriptionId);
        return updateTestSubscription(subscriptionId, {
          status: "active",
          metadata: { ...current?.metadata, ...metadata }
        });
      },
      async createBillingPortalSession(customerId, returnUrl) {
        return { url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}testPortal=${digest(customerId)}` };
      },
      async refundPayment(paymentIntentId, amount, idempotencyKey) {
        return {
          id: `test_refund_${digest(`${paymentIntentId}:${amount ?? "full"}:${idempotencyKey ?? ""}`)}`,
          object: "refund",
          payment_intent: paymentIntentId,
          amount: amount ?? 0,
          status: "succeeded"
        };
      },
      constructWebhookEvent(payload, signature) {
        verifySignature(payload, signature);
        return JSON.parse(payload);
      }
    };
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth2 = require("@keystone-6/auth");
var import_core43 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/Organization.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");
var import_access = require("@keystone-6/core/access");

// features/keystone/access/tenantPolicy.ts
function getTenantId(session) {
  const id = session?.data?.organization?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
function tenantFilter({ session }, narrowerFilter) {
  const organizationId = getTenantId(session);
  if (!organizationId) return false;
  const organizationFilter = { organization: { id: { equals: organizationId } } };
  if (!narrowerFilter) return organizationFilter;
  return { AND: [organizationFilter, narrowerFilter] };
}
function tenantItemAccess({ session, item }) {
  const organizationId = getTenantId(session);
  if (!organizationId || !item) return false;
  const itemOrganizationId = item.organizationId ?? item.organization?.id;
  return itemOrganizationId === organizationId;
}
function canManageTenant({ session }, permission) {
  if (!getTenantId(session)) return false;
  if (session?.data?.role?.canManageAllRecords) return true;
  return permission ? Boolean(session?.data?.role?.[permission]) : false;
}

// features/keystone/access.ts
function isOperatorSession(session) {
  return session?.data.role?.canManageAllRecords ?? false;
}
function ownerFilter(session, filter) {
  if (!session) return false;
  return tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : filter
  );
}
function isSignedIn({ session }) {
  return Boolean(session);
}
var permissions = {
  canCreateRecords: ({ session }) => session?.data.role?.canCreateRecords ?? false,
  canManageAllRecords: ({ session }) => isOperatorSession(session),
  canManagePeople: ({ session }) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }) => session?.data.role?.canManageRoles ?? false,
  canAccessDashboard: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
  canManageOnboarding: ({ session }) => session?.data.role?.canManageOnboarding ?? false,
  canManageSettings: ({ session }) => session?.data.role?.canManageSettings ?? false,
  canManageAppointments: ({ session }) => session?.data.role?.canManageAppointments ?? false,
  canManageCheckIns: ({ session }) => session?.data.role?.canManageCheckIns ?? false,
  canManageFacilities: ({ session }) => session?.data.role?.canManageFacilities ?? false,
  canManagePrograms: ({ session }) => session?.data.role?.canManagePrograms ?? false,
  canManageCommunications: ({ session }) => session?.data.role?.canManageCommunications ?? false,
  canManageRetail: ({ session }) => session?.data.role?.canManageRetail ?? false,
  canManagePayroll: ({ session }) => session?.data.role?.canManagePayroll ?? false,
  canViewReports: ({ session }) => session?.data.role?.canViewReports ?? false,
  isInstructor: ({ session }) => session?.data.role?.isInstructor ?? false
};
var rules = {
  canReadOwnUser: ({ session }) => {
    if (!session) return false;
    const narrower = isOperatorSession(session) ? void 0 : { id: { equals: session.itemId } };
    return tenantFilter({ session }, narrower);
  },
  canReadOwnMember: ({ session }) => {
    if (!session) return false;
    const narrower = isOperatorSession(session) ? void 0 : { user: { id: { equals: session.itemId } } };
    return tenantFilter({ session }, narrower);
  },
  canReadOwnMembership: ({ session }) => ownerFilter(session, { member: { id: { equals: session?.itemId } } }),
  canReadOwnMemberResource: ({ session }) => ownerFilter(session, { member: { user: { id: { equals: session?.itemId } } } }),
  canReadOwnPaymentSession: ({ session }) => ownerFilter(session, { user: { id: { equals: session?.itemId } } }),
  canReadOwnPaymentSessionField: ({ session, item }) => Boolean(session && (isOperatorSession(session) || item?.userId === session.itemId)),
  canReadOwnMemberField: ({ session, item }) => Boolean(
    session && tenantItemAccess({ session, item }) && (isOperatorSession(session) || item?.userId === session.itemId)
  ),
  canReadOwnWorkoutSet: ({ session }) => ownerFilter(session, {
    workoutLog: { member: { user: { id: { equals: session?.itemId } } } }
  }),
  canReadOwnBooking: ({ session }) => {
    if (!session) return false;
    const memberFilter = { member: { user: { id: { equals: session.itemId } } } };
    if (isOperatorSession(session)) return tenantFilter({ session });
    if (!session.data.role?.isInstructor) return tenantFilter({ session }, memberFilter);
    return tenantFilter({ session }, { OR: [memberFilter, { classInstance: {
      OR: [
        { instructor: { user: { id: { equals: session.itemId } } } },
        { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } }] }
      ]
    } }] });
  },
  canReadOwnAttendance: ({ session }) => {
    if (!session) return false;
    const memberFilter = { member: { user: { id: { equals: session.itemId } } } };
    if (isOperatorSession(session)) return tenantFilter({ session });
    if (!session.data.role?.isInstructor) return tenantFilter({ session }, memberFilter);
    return tenantFilter({ session }, { OR: [memberFilter, { booking: { classInstance: {
      OR: [
        { instructor: { user: { id: { equals: session.itemId } } } },
        { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { id: { equals: session.itemId } } } } }] }
      ]
    } } }] });
  },
  canReadOwnWaitlist: ({ session }) => ownerFilter(session, { member: { user: { id: { equals: session?.itemId } } } }),
  canReadOwnRole: ({ session }) => {
    if (!session) return false;
    const narrower = isOperatorSession(session) ? void 0 : { assignedTo: { some: { id: { equals: session.itemId } } } };
    return tenantFilter({ session }, narrower);
  },
  canReadClassSchedule: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : { isActive: { equals: true } }
  ),
  canReadInstructor: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : { isActive: { equals: true } }
  ),
  canReadClassInstance: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : { isCancelled: { equals: false } }
  ),
  // Backward-compatible aliases for the existing User/Member update boundaries.
  canReadPeople: ({ session }) => {
    if (!session) return false;
    return tenantFilter(
      { session },
      isOperatorSession(session) ? void 0 : { id: { equals: session.itemId } }
    );
  },
  canUpdatePeople: ({ session }) => {
    if (!session) return false;
    return tenantFilter(
      { session },
      isOperatorSession(session) ? void 0 : { id: { equals: session.itemId } }
    );
  },
  canDeletePeople: ({ session }) => {
    if (!session || !session.data?.role?.canManagePeople) return false;
    return tenantFilter({ session });
  }
};

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/Organization.ts
var ownOrganization = ({ session, item }) => getTenantId(session) === item?.id;
var ownOrganizationFilter = ({ session }) => {
  const organizationId = getTenantId(session);
  return organizationId ? { id: { equals: organizationId } } : false;
};
var ownedRecords = (ref) => (0, import_fields2.relationship)({
  ref,
  many: true,
  access: { create: import_access.denyAll, update: import_access.denyAll }
});
var Organization = (0, import_core.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOnboarding,
      update: permissions.canManageSettings,
      delete: () => false
    },
    filter: { query: ownOrganizationFilter },
    item: { update: ownOrganization }
  },
  ui: {
    labelField: "name",
    hideDelete: true,
    listView: { initialColumns: ["name", "slug", "status", "timezone"] }
  },
  fields: {
    name: (0, import_fields2.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields2.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields2.select)({
      type: "enum",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" }
      ],
      defaultValue: "active",
      validation: { isRequired: true }
    }),
    defaultCurrency: (0, import_fields2.text)({ defaultValue: "USD", validation: { isRequired: true } }),
    timezone: (0, import_fields2.text)({ defaultValue: "America/Los_Angeles", validation: { isRequired: true } }),
    isMultiLocation: (0, import_fields2.checkbox)({ defaultValue: true }),
    users: ownedRecords("User.organization"),
    roles: ownedRecords("Role.organization"),
    members: ownedRecords("Member.organization"),
    instructors: ownedRecords("Instructor.organization"),
    locations: ownedRecords("Location.organization"),
    resources: ownedRecords("GymResource.organization"),
    trainerAvailability: ownedRecords("TrainerAvailability.organization"),
    appointments: ownedRecords("TrainerAppointment.organization"),
    membershipTiers: ownedRecords("MembershipTier.organization"),
    memberships: ownedRecords("Membership.organization"),
    membershipPayments: ownedRecords("MembershipPayment.organization"),
    subscriptions: ownedRecords("Subscription.organization"),
    gymPayments: ownedRecords("GymPayment.organization"),
    paymentMethods: ownedRecords("PaymentMethod.organization"),
    paymentProviders: ownedRecords("PaymentProvider.organization"),
    paymentSessions: ownedRecords("PaymentSession.organization"),
    paymentEvents: ownedRecords("PaymentEvent.organization"),
    checkIns: ownedRecords("CheckIn.organization"),
    workoutLogs: ownedRecords("WorkoutLog.organization"),
    workoutSets: ownedRecords("WorkoutSet.organization"),
    exercises: ownedRecords("Exercise.organization"),
    waitlists: ownedRecords("Waitlist.organization"),
    attendanceRecords: ownedRecords("AttendanceRecord.organization"),
    classTypes: ownedRecords("ClassType.organization"),
    classSchedules: ownedRecords("ClassSchedule.organization"),
    classBookings: ownedRecords("ClassBooking.organization"),
    classInstances: ownedRecords("ClassInstance.organization"),
    gymSettings: ownedRecords("GymSettings.organization"),
    onboardingRuns: ownedRecords("OnboardingRun.organization"),
    refundAttempts: ownedRecords("GymRefundAttempt.organization"),
    membershipBillingAttempts: ownedRecords("MembershipBillingAttempt.organization"),
    ...trackingFields
  }
});

// features/keystone/models/User.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");

// features/keystone/models/tenantRelationships.ts
function requiredRelationshipDb(relationName) {
  return (field) => field.replace(new RegExp(`(${relationName}\\s+\\w+)\\?`), "$1").replace(new RegExp(`(${relationName}Id\\s+String)\\?`), "$1");
}
function compoundUniqueDb(...constraints) {
  return (schema) => {
    const additions = constraints.map((constraint) => `  @@unique([${constraint}])`).join("\n");
    return schema.replace(/\n}/, `
${additions}
}`);
  };
}
function connectedRelationshipId(value) {
  if (!value || typeof value !== "object") return void 0;
  const relationship42 = value;
  if (relationship42.disconnect) return null;
  return typeof relationship42.connect?.id === "string" ? relationship42.connect.id : void 0;
}
function tenantOrganizationId(resolvedData, item) {
  const connected = connectedRelationshipId(resolvedData.organization);
  if (connected !== void 0) return connected;
  return item?.organizationId ?? void 0;
}
function validateTenantOwnership(targets, options = {}) {
  return async function validateTenantOwnershipInput({
    resolvedData,
    item,
    context,
    addValidationError,
    session,
    operation
  }) {
    const sessionOrganizationId = argsSessionOrganizationId({ session, context });
    const requireOrganization = options.requireOrganization ?? true;
    if (operation === "create" && resolvedData.organization === void 0 && sessionOrganizationId) {
      resolvedData.organization = { connect: { id: sessionOrganizationId } };
    } else if (operation === "create" && resolvedData.organization === void 0 && !requireOrganization) {
      const [defaultOrganization] = await context.sudo().query.Organization.findMany({
        take: 1,
        orderBy: [{ createdAt: "asc" }],
        query: "id"
      });
      if (defaultOrganization?.id) {
        resolvedData.organization = { connect: { id: defaultOrganization.id } };
      }
    }
    const organizationId = tenantOrganizationId(resolvedData, item);
    if (!organizationId && requireOrganization) {
      addValidationError("A tenant organization is required");
      return;
    }
    if (!organizationId) return;
    if (sessionOrganizationId && sessionOrganizationId !== organizationId) {
      addValidationError("The relationship must belong to the signed-in organization");
      return;
    }
    if (resolvedData.organization !== void 0) {
      const connectedOrganizationId = connectedRelationshipId(resolvedData.organization);
      if (connectedOrganizationId !== organizationId) {
        addValidationError("The tenant organization cannot be reassigned");
        return;
      }
    }
    for (const target of targets) {
      const relationshipValue = resolvedData[target.field];
      const relationshipId = relationshipValue === void 0 ? item?.[`${target.field}Id`] : connectedRelationshipId(relationshipValue);
      if (!relationshipId) {
        if (target.required) addValidationError(`${target.field} is required`);
        continue;
      }
      const related = await context.prisma[target.list].findUnique({
        where: { id: relationshipId },
        select: { id: true, organizationId: true }
      });
      if (!related) {
        addValidationError(`${target.field} was not found`);
      } else if (related.organizationId !== organizationId) {
        addValidationError(`${target.field} must belong to the same organization`);
      }
    }
  };
}
function argsSessionOrganizationId(args) {
  const id = (args?.session ?? args?.context?.session)?.data?.organization?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
async function validateResourceLocation({
  resolvedData,
  item,
  context,
  addValidationError
}) {
  const locationId = resolvedData.location === void 0 ? item?.locationId : connectedRelationshipId(resolvedData.location);
  const resourceId = resolvedData.resource === void 0 ? item?.resourceId : connectedRelationshipId(resolvedData.resource);
  if (!locationId || !resourceId) return;
  const resource = await context.prisma.gymResource.findUnique({
    where: { id: resourceId },
    select: { locationId: true }
  });
  if (resource && resource.locationId !== locationId) {
    addValidationError("resource must belong to the selected location");
  }
}

// features/keystone/models/roleCapabilities.ts
var roleCapabilityFields = [
  "canCreateRecords",
  "canManageAllRecords",
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManageSettings",
  "canManageAppointments",
  "canManageCheckIns",
  "canManageFacilities",
  "canManagePrograms",
  "canManageCommunications",
  "canManageRetail",
  "canManagePayroll",
  "canViewReports",
  "isInstructor"
];
function elevatedRoleCapabilities(candidate, actor2) {
  if (actor2?.canManageAllRecords === true) return [];
  return roleCapabilityFields.filter((field) => candidate[field] === true && actor2?.[field] !== true);
}

// lib/authRateLimit.ts
var import_node_crypto = require("node:crypto");
function rateLimitStorageKey(key) {
  const bounded = key.trim().slice(0, 200);
  if (!bounded) return "";
  if (bounded.endsWith(":global") || bounded === "global") return bounded;
  return `bucket:${(0, import_node_crypto.createHash)("sha256").update(bounded).digest("hex")}`;
}
async function consumeAuthAttempt(prisma, key, limit, windowMs, now = /* @__PURE__ */ new Date()) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return false;
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`auth-rate:${boundedKey}`}, 0))) AS acquired`;
    const existing = await transaction.authRateLimitBucket.findUnique({ where: { key: boundedKey } });
    if (!existing || existing.resetAt <= now) {
      if (boundedKey.endsWith(":global") || boundedKey === "global") {
        await transaction.authRateLimitBucket.deleteMany({
          where: { resetAt: { lt: now }, key: { not: boundedKey } }
        });
      }
      await transaction.authRateLimitBucket.upsert({
        where: { key: boundedKey },
        create: { key: boundedKey, count: 1, resetAt: new Date(now.getTime() + windowMs) },
        update: { count: 1, resetAt: new Date(now.getTime() + windowMs) }
      });
      return true;
    }
    if (existing.count >= limit) return false;
    await transaction.authRateLimitBucket.update({ where: { key: boundedKey }, data: { count: { increment: 1 } } });
    return true;
  });
}
function normalizeAuthIdentity(value) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

// features/keystone/models/User.ts
var validateUserTenant = validateTenantOwnership([
  { field: "role", list: "role" }
], { requireOrganization: false });
async function validateUserInput(args) {
  const session = args.session ?? args.context?.session;
  await validateUserTenant(args);
  const roleId = connectedRelationshipId(args.resolvedData.role);
  if (!roleId || !session) return;
  if (args.operation === "update" && args.item?.id === session.itemId) {
    args.addValidationError("You cannot change the role assigned to your own account");
    return;
  }
  const role = await args.context.prisma.role.findUnique({
    where: { id: roleId },
    select: Object.fromEntries(roleCapabilityFields.map((field) => [field, true]))
  });
  const elevated = elevatedRoleCapabilities(role ?? {}, session.data?.role);
  if (elevated.length) {
    args.addValidationError(`You cannot assign a role with capabilities you do not hold: ${elevated.join(", ")}`);
  }
}
function canAssignRole({ session, item, operation }) {
  if (!permissions.canManageRoles({ session })) return false;
  return operation === "create" || session?.itemId !== item?.id;
}
var User = (0, import_core2.list)({
  hooks: { validateInput: validateUserInput },
  access: {
    operation: {
      query: isSignedIn,
      // Public registration uses the bounded registerMember workflow; generic CRUD never creates public users.
      create: permissions.canManagePeople,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadOwnUser,
      update: rules.canUpdatePeople,
      delete: rules.canDeletePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "organization", "role", "membership"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    organization: (0, import_fields3.relationship)({
      ref: "Organization.users",
      access: {
        create: permissions.canManagePeople,
        update: () => false
      },
      graphql: { isNonNull: { read: true } },
      ui: { description: "Tenant organization for this account" }
    }),
    name: (0, import_fields3.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields3.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ resolvedData }) => resolvedData.email === void 0 ? void 0 : normalizeAuthIdentity(resolvedData.email)
      },
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields3.password)({
      access: {
        read: import_access3.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: {
        isRequired: true,
        rejectCommon: true,
        length: { min: 12, max: 128 }
      }
    }),
    role: (0, import_fields3.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: canAssignRole,
        update: canAssignRole
      },
      ui: {
        itemView: {
          fieldMode: (args) => canAssignRole({ ...args, operation: "update" }) ? "edit" : "read"
        }
      }
    }),
    // Inverse lifecycle collections are read-only. Owning records are linked by
    // their tenant-checked custom workflows.
    membership: (0, import_fields3.relationship)({
      ref: "Membership.member",
      many: false,
      access: { create: import_access3.denyAll, update: import_access3.denyAll }
    }),
    payments: (0, import_fields3.relationship)({
      ref: "MembershipPayment.member",
      many: true,
      access: { create: import_access3.denyAll, update: import_access3.denyAll }
    }),
    paymentSessions: (0, import_fields3.relationship)({
      ref: "PaymentSession.user",
      many: true,
      access: { create: import_access3.denyAll, update: import_access3.denyAll }
    }),
    // Stripe integration
    stripeCustomerId: (0, import_fields3.text)({
      access: {
        read: isSignedIn,
        create: permissions.canManageAllRecords,
        update: permissions.canManageAllRecords
      },
      ui: {
        description: "Stripe Customer ID"
      }
    }),
    phone: (0, import_fields3.text)({
      ui: {
        description: "Member phone number"
      }
    }),
    emergencyContact: (0, import_fields3.text)({
      ui: {
        description: "Emergency contact name and phone"
      }
    }),
    onboardingStatus: (0, import_fields3.select)({
      access: {
        create: import_access3.denyAll,
        update: import_access3.denyAll
      },
      type: "string",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" }
      ],
      defaultValue: "not_started",
      validation: { isRequired: true },
      ui: {
        description: "Tracks dashboard onboarding state for this user"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core3 = require("@keystone-6/core");
var import_access5 = require("@keystone-6/core/access");
var import_fields4 = require("@keystone-6/core/fields");
function manageableRoleFilter({ session }) {
  const organizationId = session?.data?.organization?.id;
  const currentRoleId = session?.data?.role?.id;
  if (!organizationId || !currentRoleId) return false;
  return {
    AND: [
      { organization: { id: { equals: organizationId } } },
      { id: { not: { equals: currentRoleId } } }
    ]
  };
}
async function validateRoleInput(args) {
  const session = args.session ?? args.context?.session;
  await validateTenantOwnership([])(args);
  if (session?.data?.role?.id && args.item?.id === session.data.role.id) {
    args.addValidationError("You cannot modify the role assigned to your own account");
    return;
  }
  if (session) {
    const elevated = elevatedRoleCapabilities(args.resolvedData, session.data?.role);
    if (elevated.length) {
      args.addValidationError(`A role cannot grant capabilities you do not hold: ${elevated.join(", ")}`);
    }
  }
}
var Role = (0, import_core3.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateRoleInput },
  access: {
    operation: {
      ...(0, import_access5.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    },
    filter: {
      query: rules.canReadOwnRole,
      update: manageableRoleFilter,
      delete: manageableRoleFilter
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    organization: (0, import_fields4.relationship)({
      ref: "Organization.roles",
      access: { update: import_access5.denyAll },
      graphql: { isNonNull: { read: true } },
      ui: { description: "Tenant organization for this role" }
    }),
    name: (0, import_fields4.text)({ validation: { isRequired: true } }),
    canCreateRecords: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageAllRecords: (0, import_fields4.checkbox)({ defaultValue: false }),
    canSeeOtherPeople: (0, import_fields4.checkbox)({ defaultValue: false }),
    canEditOtherPeople: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManagePeople: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageRoles: (0, import_fields4.checkbox)({ defaultValue: false }),
    canAccessDashboard: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageOnboarding: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageSettings: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageAppointments: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageCheckIns: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageFacilities: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManagePrograms: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageCommunications: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManageRetail: (0, import_fields4.checkbox)({ defaultValue: false }),
    canManagePayroll: (0, import_fields4.checkbox)({ defaultValue: false }),
    canViewReports: (0, import_fields4.checkbox)({ defaultValue: false }),
    isInstructor: (0, import_fields4.checkbox)({ defaultValue: false }),
    assignedTo: (0, import_fields4.relationship)({
      ref: "User.role",
      many: true,
      access: { create: import_access5.denyAll, update: import_access5.denyAll },
      ui: {
        itemView: { fieldMode: "read" }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Member.ts
var import_core4 = require("@keystone-6/core");
var import_access7 = require("@keystone-6/core/access");
var import_fields5 = require("@keystone-6/core/fields");
function sensitiveMemberRead({ session, item }) {
  return Boolean(session?.itemId && session?.data?.organization?.id === item?.organizationId && (session.data?.role?.canManageAllRecords || session.data?.role?.canManagePeople || item?.userId === session.itemId));
}
var Member = (0, import_core4.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: { validateInput: validateTenantOwnership([
    { field: "user", list: "user" },
    { field: "membershipTier", list: "membershipTier" }
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManagePeople,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadOwnMember,
      update: rules.canReadOwnMember,
      delete: rules.canDeletePeople
    }
  },
  ui: {
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "membershipTier", "status", "joinDate"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.data.member?.id === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    organization: (0, import_fields5.relationship)({
      ref: "Organization.members",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
      ui: { description: "Tenant organization for this member" }
    }),
    name: (0, import_fields5.text)({
      validation: { isRequired: true },
      ui: {
        description: "Full name of the member"
      }
    }),
    email: (0, import_fields5.text)({
      isIndexed: "unique",
      access: { update: permissions.canManagePeople },
      validation: { isRequired: true },
      ui: {
        description: "Member email address"
      }
    }),
    phone: (0, import_fields5.text)({
      ui: {
        description: "Primary phone number"
      }
    }),
    dateOfBirth: (0, import_fields5.timestamp)({
      ui: {
        description: "Date of birth for age verification and birthday promotions"
      }
    }),
    joinDate: (0, import_fields5.timestamp)({
      access: { update: permissions.canManagePeople },
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Date member joined the gym"
      }
    }),
    membershipTier: (0, import_fields5.relationship)({
      ref: "MembershipTier",
      access: { update: import_access7.denyAll },
      ui: {
        displayMode: "select",
        description: "Current membership plan"
      }
    }),
    emergencyContactName: (0, import_fields5.text)({
      access: { read: sensitiveMemberRead },
      ui: {
        description: "Emergency contact full name"
      }
    }),
    emergencyContactPhone: (0, import_fields5.text)({
      access: { read: sensitiveMemberRead },
      ui: {
        description: "Emergency contact phone number"
      }
    }),
    healthNotes: (0, import_fields5.json)({
      access: { read: sensitiveMemberRead, create: import_access7.denyAll, update: import_access7.denyAll },
      ui: {
        views: "./fields/json-view",
        description: "Medical conditions, injuries, or health considerations (stored as JSON)"
      },
      defaultValue: { conditions: [], injuries: [], notes: "" }
    }),
    profilePhoto: (0, import_fields5.image)({
      storage: "my_images"
    }),
    status: (0, import_fields5.select)({
      access: { update: import_access7.denyAll },
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "active",
      validation: { isRequired: true },
      ui: {
        description: "Member account status"
      }
    }),
    // Relationship to User for authentication
    user: (0, import_fields5.relationship)({
      ref: "User",
      access: { update: import_access7.denyAll },
      ui: {
        description: "Linked user account for authentication"
      }
    }),
    // Relationships to other entities
    bookings: (0, import_fields5.relationship)({
      ref: "ClassBooking.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Class bookings made by this member"
      }
    }),
    // Inverse collections are read-only. Their owning records are changed only
    // through tenant-checked lifecycle operations, never nested parent writes.
    checkIns: (0, import_fields5.relationship)({
      ref: "CheckIn.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Check-in history"
      }
    }),
    payments: (0, import_fields5.relationship)({
      ref: "GymPayment.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Payment history"
      }
    }),
    workoutLogs: (0, import_fields5.relationship)({
      ref: "WorkoutLog.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Workout tracking history"
      }
    }),
    subscriptions: (0, import_fields5.relationship)({
      ref: "Subscription.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Subscription billing history"
      }
    }),
    waitlistEntries: (0, import_fields5.relationship)({
      ref: "Waitlist.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Waitlist entries for full classes"
      }
    }),
    trainerAppointments: (0, import_fields5.relationship)({
      ref: "TrainerAppointment.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: { description: "One-to-one trainer appointments" }
    }),
    attendanceRecords: (0, import_fields5.relationship)({
      ref: "AttendanceRecord.member",
      access: { create: import_access7.denyAll, update: import_access7.denyAll },
      many: true,
      ui: {
        description: "Class attendance tracking"
      }
    }),
    lifetimeValue: (0, import_fields5.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core4.graphql.field({
        type: import_core4.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const payments = await sudoContext.query.GymPayment.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            query: "amount refundAmount currencyCode status"
          });
          const settled = payments.filter(
            (payment) => ["completed", "succeeded", "refunded"].includes(payment.status)
          );
          const currencies = new Set(settled.map((payment) => String(payment.currencyCode || "USD").toUpperCase()));
          if (currencies.size > 1 || currencies.size === 1 && !currencies.has("USD")) return null;
          return settled.reduce(
            (sum, payment) => sum + Math.max((payment.amount || 0) - (payment.refundAmount || 0), 0),
            0
          ) / 100;
        }
      }),
      ui: { description: "Net settled lifetime payments in USD; unavailable for mixed/non-USD evidence" }
    }),
    membershipLengthDays: (0, import_fields5.virtual)({
      field: import_core4.graphql.field({
        type: import_core4.graphql.Int,
        async resolve(item, args, context) {
          const joinDate = item.joinDate;
          if (!joinDate) return 0;
          const now = /* @__PURE__ */ new Date();
          const diffTime = now.getTime() - new Date(joinDate).getTime();
          return Math.max(0, Math.ceil(diffTime / (1e3 * 60 * 60 * 24)));
        }
      }),
      ui: { description: "Days since member joined" }
    }),
    attendanceRate: (0, import_fields5.virtual)({
      access: { read: rules.canReadOwnMemberField },
      field: import_core4.graphql.field({
        type: import_core4.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.id.toString() } } }
          });
          if (totalRecords === 0) return 0;
          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.id.toString() } } },
                { attended: { equals: true } }
              ]
            }
          });
          return Math.round(attendedRecords / totalRecords * 100);
        }
      }),
      ui: { description: "Class attendance rate percentage" }
    }),
    lastCheckIn: (0, import_fields5.virtual)({
      access: { read: rules.canReadOwnMemberField },
      field: import_core4.graphql.field({
        type: import_core4.graphql.DateTime,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const checkIns = await sudoContext.query.CheckIn.findMany({
            where: {
              member: { id: { equals: item.id.toString() } },
              isGuest: { equals: false }
            },
            orderBy: { checkInTime: "desc" },
            take: 1,
            query: "checkInTime"
          });
          const checkInTime = checkIns[0]?.checkInTime;
          return checkInTime ? new Date(checkInTime) : null;
        }
      }),
      ui: { description: "Last gym check-in timestamp" }
    }),
    currentMembershipTier: (0, import_fields5.virtual)({
      access: { read: rules.canReadOwnMemberField },
      field: import_core4.graphql.field({
        type: import_core4.graphql.object()({
          name: "MemberCurrentTier",
          fields: {
            id: import_core4.graphql.field({
              type: import_core4.graphql.ID,
              resolve: (source) => source.id
            }),
            name: import_core4.graphql.field({
              type: import_core4.graphql.String,
              resolve: (source) => source.name
            })
          }
        }),
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const member = await sudoContext.query.Member.findOne({
            where: { id: item.id.toString() },
            query: "user { membership { tier { id name } } } membershipTier { id name }"
          });
          return member?.user?.membership?.tier || member?.membershipTier || null;
        }
      }),
      ui: {
        description: "Current membership tier details",
        query: `{
          id
          name
        }`
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MembershipTier.ts
var import_core5 = require("@keystone-6/core");
var import_access9 = require("@keystone-6/core/access");
var import_fields6 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");

// features/integrations/payment/commercial-agreement.ts
function decimalToMinor(value) {
  const raw = String(value ?? "");
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(raw)) throw new Error("Membership prices must use at most two decimal places");
  const [whole, fraction = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw new Error("Membership price exceeds supported minor units");
  return amount;
}
function tierAmountMinor(tier, cycle) {
  const stored = cycle === "annual" ? tier.annualPriceMinor : tier.monthlyPriceMinor;
  const legacy = decimalToMinor(cycle === "annual" ? tier.annualPrice : tier.monthlyPrice);
  if (stored == null) return legacy;
  if (!Number.isSafeInteger(stored) || stored < 0 || stored !== legacy) throw new Error("Membership catalog amount requires reconciliation");
  return stored;
}
function snapshotMembershipAgreement(tier, billingCycle, currencyCode) {
  return {
    version: 1,
    acceptedAt: (/* @__PURE__ */ new Date()).toISOString(),
    tierId: tier.id,
    tierName: tier.name,
    billingCycle,
    currencyCode,
    amount: tierAmountMinor(tier, billingCycle),
    monthlyPriceMinor: tierAmountMinor(tier, "monthly"),
    annualPriceMinor: tierAmountMinor(tier, "annual"),
    classCreditsPerMonth: tier.classCreditsPerMonth,
    freezeAllowed: Boolean(tier.freezeAllowed),
    contractLength: tier.contractLength ?? 0,
    cancellationPolicy: "paid_period_end",
    accessHours: tier.accessHours ?? "",
    accessHoursJson: tier.accessHoursJson ?? null,
    guestPasses: tier.guestPasses ?? 0,
    maxClassBookings: tier.maxClassBookings ?? 0,
    personalTrainingSessions: tier.personalTrainingSessions ?? 0
  };
}
function assertCheckoutCorrelation(local, session, organizationId) {
  if (!local || local.organization?.id !== organizationId) throw new Error("Local payment session not found in organization");
  const metadata = session.metadata || {};
  const legacyAttemptKey = `${local.idempotencyKey}:attempt:${local.data?.checkoutAttempt}`;
  if (metadata.paymentSessionKey !== local.idempotencyKey && metadata.paymentSessionKey !== legacyAttemptKey) throw new Error("Checkout attempt does not match local payment session");
  if (local.providerSessionId && local.providerSessionId !== session.id) throw new Error("Provider checkout session does not match local attempt");
  if (local.user?.id !== metadata.userId || local.membershipTier?.id !== metadata.tierId || local.billingCycle !== metadata.billingCycle) throw new Error("Checkout ownership or commercial metadata does not match");
  if (Number(metadata.amount) !== local.amount || String(metadata.currencyCode).toUpperCase() !== local.currencyCode || String(session.currency).toUpperCase() !== local.currencyCode) throw new Error("Checkout amount or currency does not match local agreement");
  if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) throw new Error("Checkout payment is not settled");
}

// features/keystone/models/MembershipTier.ts
var validateMembershipTierTenant = validateTenantOwnership([]);
async function validateMembershipTierInput(args) {
  await validateMembershipTierTenant(args);
  const value = (field) => args.resolvedData[field] === void 0 ? args.item?.[field] : args.resolvedData[field];
  const monthlyPrice = Number(value("monthlyPrice"));
  const annualPrice = Number(value("annualPrice"));
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(annualPrice) || annualPrice < 0) {
    args.addValidationError("Membership prices must be non-negative numbers");
  }
  try {
    decimalToMinor(value("monthlyPrice"));
    decimalToMinor(value("annualPrice"));
  } catch (error) {
    args.addValidationError(error.message);
  }
  const credits = Number(value("classCreditsPerMonth"));
  if (!Number.isInteger(credits) || credits < -1) {
    args.addValidationError("Class credits must be -1 for unlimited or a non-negative whole number");
  }
  const monthlyPriceId = String(value("stripeMonthlyPriceId") || "").trim();
  const annualPriceId = String(value("stripeAnnualPriceId") || "").trim();
  const productId = String(value("stripeProductId") || "").trim();
  if (monthlyPriceId && !/^price_[A-Za-z0-9]+$/.test(monthlyPriceId)) {
    args.addValidationError("Monthly Stripe Price ID is invalid");
  }
  if (annualPriceId && !/^price_[A-Za-z0-9]+$/.test(annualPriceId)) {
    args.addValidationError("Annual Stripe Price ID is invalid");
  }
  if (productId && !/^prod_[A-Za-z0-9]+$/.test(productId)) {
    args.addValidationError("Stripe Product ID is invalid");
  }
  if ((monthlyPriceId || annualPriceId) && !productId) {
    args.addValidationError("A Stripe Product ID is required with checkout Price IDs");
  }
}
var MembershipTier = (0, import_core5.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: {
    validateInput: validateMembershipTierInput,
    async validateDelete({ context, item, addValidationError }) {
      const [memberships, sessions] = await Promise.all([
        context.prisma.membership.count({ where: { tierId: item.id } }),
        context.prisma.paymentSession.count({ where: { membershipTierId: item.id } })
      ]);
      if (memberships || sessions) addValidationError("A membership plan referenced by commercial records cannot be deleted");
    },
    resolveInput({ resolvedData, item }) {
      for (const [display, minor] of [["monthlyPrice", "monthlyPriceMinor"], ["annualPrice", "annualPriceMinor"]]) {
        const value = resolvedData[display] ?? item?.[display];
        if (value !== void 0) {
          try {
            resolvedData[minor] = decimalToMinor(value);
          } catch {
          }
        }
      }
      return resolvedData;
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter }
  },
  ui: {
    listView: {
      initialColumns: ["name", "monthlyPrice", "annualPrice", "classCreditsPerMonth"]
    }
  },
  fields: {
    organization: (0, import_fields6.relationship)({
      ref: "Organization.membershipTiers",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    name: (0, import_fields6.text)({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Basic, Premium, Unlimited"
      }
    }),
    description: (0, import_fields_document.document)({
      formatting: true,
      links: true
    }),
    monthlyPriceMinor: (0, import_fields6.integer)({ access: { create: import_access9.denyAll, update: import_access9.denyAll }, db: { isNullable: true } }),
    annualPriceMinor: (0, import_fields6.integer)({ access: { create: import_access9.denyAll, update: import_access9.denyAll }, db: { isNullable: true } }),
    monthlyPrice: (0, import_fields6.float)({
      validation: { isRequired: true },
      ui: {
        description: "Monthly subscription price"
      }
    }),
    annualPrice: (0, import_fields6.float)({
      validation: { isRequired: true },
      ui: {
        description: "Annual subscription price (with discount)"
      }
    }),
    classCreditsPerMonth: (0, import_fields6.integer)({
      validation: { isRequired: true },
      defaultValue: 0,
      ui: {
        description: "Number of class credits per month (-1 for unlimited)"
      }
    }),
    accessHours: (0, import_fields6.text)({
      defaultValue: "limited",
      ui: {
        description: "e.g., '24/7' or 'limited' (6am-10pm)"
      }
    }),
    guestPasses: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Number of guest passes per month"
      }
    }),
    personalTrainingSessions: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Number of personal training sessions included"
      }
    }),
    freezeAllowed: (0, import_fields6.checkbox)({
      defaultValue: false,
      ui: {
        description: "Can member freeze their membership?"
      }
    }),
    contractLength: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Contract length in months (0 for month-to-month)"
      }
    }),
    // Stripe integration
    stripeMonthlyPriceId: (0, import_fields6.text)({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for monthly billing"
      }
    }),
    stripeAnnualPriceId: (0, import_fields6.text)({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for annual billing"
      }
    }),
    stripeProductId: (0, import_fields6.text)({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Product ID"
      }
    }),
    // Additional fields from todo requirements
    price: (0, import_fields6.integer)({
      ui: {
        description: "Base price in cents (for backward compatibility)"
      }
    }),
    billingInterval: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Quarterly", value: "quarterly" },
        { label: "Annual", value: "annual" }
      ],
      defaultValue: "monthly",
      ui: {
        description: "Default billing interval for this tier"
      }
    }),
    features: (0, import_fields6.json)({
      defaultValue: [],
      ui: {
        views: "./fields/json-view",
        description: "List of features included in this tier (stored as JSON array)"
      }
    }),
    maxClassBookings: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Maximum number of concurrent class bookings allowed (0 = unlimited)"
      }
    }),
    hasGuestPrivileges: (0, import_fields6.checkbox)({
      defaultValue: false,
      ui: {
        description: "Can members bring guests?"
      }
    }),
    accessHoursJson: (0, import_fields6.json)({
      defaultValue: { type: "limited", hours: "6am-10pm" },
      ui: {
        views: "./fields/json-view",
        description: "Access hours configuration (stored as JSON)"
      }
    }),
    paymentSessions: (0, import_fields6.relationship)({
      ref: "PaymentSession.membershipTier",
      many: true,
      access: { create: import_access9.denyAll, update: import_access9.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Membership.ts
var import_core6 = require("@keystone-6/core");
var import_access11 = require("@keystone-6/core/access");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/mutations/gymLifecyclePolicy.ts
var MEMBERSHIP_TRANSITIONS = {
  active: /* @__PURE__ */ new Set(["frozen", "cancelled", "expired", "past-due"]),
  frozen: /* @__PURE__ */ new Set(["active", "cancelled", "expired", "past-due"]),
  "past-due": /* @__PURE__ */ new Set(["active", "frozen", "cancelled", "expired"]),
  cancelled: /* @__PURE__ */ new Set(),
  expired: /* @__PURE__ */ new Set()
};
var BOOKING_TRANSITIONS = {
  confirmed: /* @__PURE__ */ new Set(["cancelled"]),
  waitlist: /* @__PURE__ */ new Set(["confirmed", "cancelled"]),
  cancelled: /* @__PURE__ */ new Set()
};
function assertMembershipStatusTransition(previous, next) {
  if (previous === next) return;
  if (!MEMBERSHIP_TRANSITIONS[previous]?.has(next)) {
    throw new Error(`Invalid membership status transition: ${previous} -> ${next}`);
  }
}
function assertBookingStatusTransition(previous, next) {
  if (previous === next) return;
  if (!BOOKING_TRANSITIONS[previous]?.has(next)) {
    throw new Error(`Invalid booking status transition: ${previous} -> ${next}`);
  }
}
function normalizeAttendanceOutcome(value) {
  if (value === "attended" || value === "late" || value === "no-show") return value;
  throw new Error("Attendance outcome must be attended, late, or no-show");
}
function normalizeCheckInMethod(value) {
  if (value === "qr_code" || value === "rfid" || value === "manual" || value === "app") {
    return value;
  }
  throw new Error("Check-in method is not supported");
}
function addPolicyError(addValidationError, operation) {
  try {
    operation();
  } catch (error) {
    addValidationError(error instanceof Error ? error.message : String(error));
  }
}
var membershipLifecycleHooks = {
  validateInput({ operation, item, resolvedData, addValidationError }) {
    if (operation !== "update" || !item || resolvedData.status === void 0) return;
    addPolicyError(
      addValidationError,
      () => assertMembershipStatusTransition(item.status, resolvedData.status)
    );
  }
};
var bookingLifecycleHooks = {
  validateInput({ operation, item, resolvedData, addValidationError }) {
    if (operation !== "update" || !item || resolvedData.status === void 0) return;
    addPolicyError(
      addValidationError,
      () => assertBookingStatusTransition(item.status, resolvedData.status)
    );
  }
};

// features/keystone/models/Membership.ts
var Membership = (0, import_core6.list)({
  hooks: {
    async validateInput(args) {
      membershipLifecycleHooks.validateInput(args);
      await validateTenantOwnership([
        { field: "member", list: "user", required: true },
        { field: "tier", list: "membershipTier", required: true }
      ])(args);
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      // Membership state and credits are changed by checkout/webhook workflows only.
      create: import_access11.denyAll,
      update: import_access11.denyAll,
      delete: import_access11.denyAll
    },
    filter: {
      query: rules.canReadOwnMembership,
      update: rules.canReadOwnMembership,
      delete: rules.canReadOwnMembership
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "tier", "status", "billingCycle", "nextBillingDate"]
    }
  },
  fields: {
    organization: (0, import_fields7.relationship)({
      ref: "Organization.memberships",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields7.relationship)({
      ref: "User.membership",
      access: { update: import_access11.denyAll },
      ui: {
        displayMode: "select"
      }
    }),
    tier: (0, import_fields7.relationship)({
      ref: "MembershipTier",
      access: { update: import_access11.denyAll },
      ui: {
        displayMode: "select"
      }
    }),
    status: (0, import_fields7.select)({
      access: { update: import_access11.denyAll },
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Frozen", value: "frozen" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Expired", value: "expired" },
        { label: "Past Due", value: "past-due" }
      ],
      defaultValue: "active",
      validation: { isRequired: true }
    }),
    startDate: (0, import_fields7.timestamp)({
      access: { update: import_access11.denyAll },
      validation: { isRequired: true }
    }),
    billingCycle: (0, import_fields7.select)({
      access: { update: import_access11.denyAll },
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" }
      ],
      defaultValue: "monthly",
      validation: { isRequired: true }
    }),
    agreementSnapshot: (0, import_fields7.json)({ defaultValue: {}, access: { update: import_access11.denyAll } }),
    agreementHistory: (0, import_fields7.json)({ defaultValue: [], access: { update: import_access11.denyAll } }),
    creditPeriodStart: (0, import_fields7.timestamp)({ access: { update: import_access11.denyAll } }),
    creditPeriodEnd: (0, import_fields7.timestamp)({ access: { update: import_access11.denyAll } }),
    billingEventAt: (0, import_fields7.timestamp)({ access: { update: import_access11.denyAll } }),
    recoveryHistory: (0, import_fields7.json)({ defaultValue: [], access: { read: permissions.canManageAllRecords, update: import_access11.denyAll } }),
    nextBillingDate: (0, import_fields7.timestamp)({ access: { update: import_access11.denyAll } }),
    autoRenew: (0, import_fields7.checkbox)({
      access: { update: import_access11.denyAll },
      defaultValue: true
    }),
    classCreditsRemaining: (0, import_fields7.integer)({
      access: { update: import_access11.denyAll },
      defaultValue: 0,
      ui: {
        description: "Remaining class credits for current billing period"
      }
    }),
    freezeStartDate: (0, import_fields7.timestamp)({
      access: { update: import_access11.denyAll },
      ui: {
        description: "Start date of membership freeze"
      }
    }),
    freezeEndDate: (0, import_fields7.timestamp)({
      access: { update: import_access11.denyAll },
      ui: {
        description: "End date of membership freeze"
      }
    }),
    payments: (0, import_fields7.relationship)({
      ref: "MembershipPayment.membership",
      many: true,
      access: { create: import_access11.denyAll, update: import_access11.denyAll },
      ui: {
        description: "Payment history for this membership"
      }
    }),
    // Stripe integration - only set when membership is linked to Stripe subscription
    stripeSubscriptionId: (0, import_fields7.text)({
      access: {
        read: isSignedIn,
        create: permissions.canManageAllRecords,
        update: import_access11.denyAll
      },
      isIndexed: "unique",
      db: { isNullable: true },
      ui: {
        description: "Stripe Subscription ID (only for Stripe-billed memberships)"
      }
    }),
    cancelReason: (0, import_fields7.text)({
      access: { update: import_access11.denyAll },
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation"
      }
    }),
    cancelledAt: (0, import_fields7.timestamp)({
      access: { update: import_access11.denyAll },
      ui: {
        description: "When the membership was cancelled"
      }
    }),
    billingAttempts: (0, import_fields7.relationship)({
      ref: "MembershipBillingAttempt.membership",
      many: true,
      access: { create: import_access11.denyAll, update: import_access11.denyAll }
    }),
    // Monotonic membership-wide fence for all provider billing operations.
    // Durable attempt rows carry the matching generation; no generated CRUD
    // path may observe or mutate this internal coordination value.
    billingGeneration: (0, import_fields7.integer)({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: import_access11.denyAll, create: import_access11.denyAll, update: import_access11.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/MembershipPayment.ts
var import_core7 = require("@keystone-6/core");
var import_access13 = require("@keystone-6/core/access");
var import_fields8 = require("@keystone-6/core/fields");

// features/keystone/models/paymentEvidence.ts
var GYM_SETTLED = /* @__PURE__ */ new Set(["succeeded", "refunded"]);
var MEMBERSHIP_SETTLED = /* @__PURE__ */ new Set(["completed", "disputed", "refunded"]);
var GYM_TRANSITIONS = {
  pending: /* @__PURE__ */ new Set(["pending", "succeeded", "failed"]),
  failed: /* @__PURE__ */ new Set(["failed", "succeeded"]),
  succeeded: /* @__PURE__ */ new Set(["succeeded", "refunded"]),
  refunded: /* @__PURE__ */ new Set(["refunded"])
};
var MEMBERSHIP_TRANSITIONS2 = {
  pending: /* @__PURE__ */ new Set(["pending", "completed", "failed"]),
  failed: /* @__PURE__ */ new Set(["failed", "completed"]),
  completed: /* @__PURE__ */ new Set(["completed", "disputed", "refunded"]),
  disputed: /* @__PURE__ */ new Set(["disputed", "completed", "refunded"]),
  refunded: /* @__PURE__ */ new Set(["refunded"])
};
var GYM_EVIDENCE_FIELDS = [
  "member",
  "subscription",
  "paymentProvider",
  "paymentSession",
  "amount",
  "currencyCode",
  "paymentDate",
  "metadata",
  "stripePaymentIntentId",
  "stripeChargeId",
  "stripeInvoiceId",
  "receiptNumber",
  "description"
];
var MEMBERSHIP_EVIDENCE_FIELDS = [
  "member",
  "membership",
  "amount",
  "currencyCode",
  "paymentType",
  "paymentDate",
  "paymentMethod",
  "stripePaymentIntentId",
  "stripeChargeId",
  "stripeInvoiceId",
  "receiptNumber",
  "receiptUrl",
  "description",
  "isRecurring",
  "processedBy"
];
function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}
function validateTransition(model, currentStatus, nextStatus, transitions) {
  if (nextStatus === void 0 || nextStatus === currentStatus) return;
  if (typeof nextStatus !== "string" || !transitions[currentStatus]?.has(nextStatus)) {
    throw new Error(
      `${model} status transition ${currentStatus} -> ${String(nextStatus)} is not allowed.`
    );
  }
}
function validateImmutableEvidence(model, current, resolvedData, fields) {
  for (const field of fields) {
    if (!(field in resolvedData)) continue;
    const next = resolvedData[field];
    const previous = current[field];
    const relationshipWrite = next && typeof next === "object" && ("connect" in next || "disconnect" in next || "set" in next);
    if (relationshipWrite || JSON.stringify(comparable(next)) !== JSON.stringify(comparable(previous))) {
      throw new Error(`${model} settled evidence is immutable: ${field}.`);
    }
  }
}
function validateGymPaymentUpdate(current, resolvedData) {
  validateTransition("GymPayment", current.status, resolvedData.status, GYM_TRANSITIONS);
  if (GYM_SETTLED.has(current.status)) {
    validateImmutableEvidence("GymPayment", current, resolvedData, GYM_EVIDENCE_FIELDS);
  }
}
function validateMembershipPaymentUpdate(current, resolvedData) {
  validateTransition(
    "MembershipPayment",
    current.status,
    resolvedData.status,
    MEMBERSHIP_TRANSITIONS2
  );
  if (MEMBERSHIP_SETTLED.has(current.status)) {
    validateImmutableEvidence(
      "MembershipPayment",
      current,
      resolvedData,
      MEMBERSHIP_EVIDENCE_FIELDS
    );
  }
}
function validateSettledPaymentDelete(model, current) {
  const settled = model === "GymPayment" ? GYM_SETTLED : MEMBERSHIP_SETTLED;
  if (settled.has(current.status)) {
    throw new Error(`${model} settled evidence cannot be deleted.`);
  }
}
function paymentEvidenceHooks(model) {
  return {
    validateInput({ operation, item, resolvedData, addValidationError }) {
      if (operation !== "update" || !item) return;
      try {
        if (model === "GymPayment") validateGymPaymentUpdate(item, resolvedData);
        else validateMembershipPaymentUpdate(item, resolvedData);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    },
    validateDelete({ item, addValidationError }) {
      try {
        validateSettledPaymentDelete(model, item);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    }
  };
}

// features/keystone/models/MembershipPayment.ts
var MembershipPayment = (0, import_core7.list)({
  hooks: {
    async validateInput(args) {
      paymentEvidenceHooks("MembershipPayment").validateInput(args);
      await validateTenantOwnership([
        { field: "member", list: "user", required: true },
        { field: "membership", list: "membership" },
        { field: "processedBy", list: "user" }
      ])(args);
    },
    validateDelete: paymentEvidenceHooks("MembershipPayment").validateDelete
  },
  access: {
    operation: {
      query: isSignedIn,
      // Payment evidence is written by payment workflows, not generated CRUD.
      create: import_access13.denyAll,
      update: import_access13.denyAll,
      delete: import_access13.denyAll
    },
    filter: {
      query: rules.canReadOwnMembership,
      update: rules.canReadOwnMembership,
      delete: rules.canReadOwnMembership
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "amount", "status", "paymentDate", "paymentType"]
    }
  },
  fields: {
    organization: (0, import_fields8.relationship)({
      ref: "Organization.membershipPayments",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields8.relationship)({
      ref: "User.payments",
      ui: {
        displayMode: "select"
      }
    }),
    membership: (0, import_fields8.relationship)({
      ref: "Membership.payments",
      ui: {
        displayMode: "select",
        description: "Associated membership (if applicable)"
      }
    }),
    amount: (0, import_fields8.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in the currency minor unit"
      }
    }),
    currencyCode: (0, import_fields8.text)({
      validation: { isRequired: true },
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code" }
    }),
    paymentType: (0, import_fields8.select)({
      type: "string",
      options: [
        { label: "Membership", value: "membership" },
        { label: "Class Pack", value: "class-pack" },
        { label: "Personal Training", value: "personal-training" },
        { label: "Day Pass", value: "day-pass" },
        { label: "Late Cancel Fee", value: "late-cancel-fee" },
        { label: "Initiation Fee", value: "initiation-fee" },
        { label: "Freeze Fee", value: "freeze-fee" },
        { label: "Other", value: "other" }
      ],
      defaultValue: "membership",
      validation: { isRequired: true }
    }),
    status: (0, import_fields8.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" },
        { label: "Disputed", value: "disputed" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentDate: (0, import_fields8.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" }
    }),
    paymentMethod: (0, import_fields8.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit-card" },
        { label: "Debit Card", value: "debit-card" },
        { label: "ACH/Bank Transfer", value: "ach" },
        { label: "Cash", value: "cash" },
        { label: "Check", value: "check" }
      ],
      defaultValue: "credit-card"
    }),
    // Stripe-specific fields
    stripePaymentIntentId: (0, import_fields8.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: "Stripe Payment Intent ID"
      }
    }),
    stripeChargeId: (0, import_fields8.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: "Stripe Charge ID"
      }
    }),
    stripeInvoiceId: (0, import_fields8.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      isIndexed: "unique",
      ui: {
        description: "Stripe Invoice ID (for subscriptions)"
      }
    }),
    // Receipt information
    receiptNumber: (0, import_fields8.text)({
      isIndexed: true,
      ui: {
        description: "Internal receipt number"
      }
    }),
    receiptUrl: (0, import_fields8.text)({
      ui: {
        description: "URL to the receipt (from Stripe or generated)"
      }
    }),
    // Metadata
    description: (0, import_fields8.text)({
      ui: {
        description: "Description of the payment (e.g., 'Monthly Premium Membership')"
      }
    }),
    notes: (0, import_fields8.text)({
      access: { read: permissions.canManageAllRecords },
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    isRecurring: (0, import_fields8.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this part of a recurring subscription?"
      }
    }),
    refundedAt: (0, import_fields8.timestamp)({
      ui: {
        description: "When this payment was refunded"
      }
    }),
    refundAmount: (0, import_fields8.integer)({
      ui: {
        description: "Amount refunded (partial or full)"
      }
    }),
    refundReason: (0, import_fields8.text)({
      ui: {
        description: "Reason for refund"
      }
    }),
    processedBy: (0, import_fields8.relationship)({
      ref: "User",
      access: { read: permissions.canManageAllRecords },
      ui: {
        displayMode: "select",
        description: "Staff member who processed this payment (for manual payments)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Subscription.ts
var import_core8 = require("@keystone-6/core");
var import_access15 = require("@keystone-6/core/access");
var import_fields9 = require("@keystone-6/core/fields");
var Subscription = (0, import_core8.list)({
  access: {
    operation: {
      query: isSignedIn,
      // Subscription state is synchronized from the payment provider.
      create: import_access15.denyAll,
      update: import_access15.denyAll,
      delete: import_access15.denyAll
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "membershipTier", "status", "startDate", "nextBillingDate"]
    }
  },
  fields: {
    organization: (0, import_fields9.relationship)({
      ref: "Organization.subscriptions",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields9.relationship)({
      ref: "Member.subscriptions",
      ui: {
        displayMode: "select",
        description: "Member who owns this subscription"
      }
    }),
    membershipTier: (0, import_fields9.relationship)({
      ref: "MembershipTier",
      ui: {
        displayMode: "select",
        description: "Membership tier for this subscription"
      }
    }),
    status: (0, import_fields9.select)({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Past Due", value: "past_due" },
        { label: "Paused", value: "paused" }
      ],
      defaultValue: "active",
      validation: { isRequired: true },
      ui: {
        description: "Current subscription status"
      }
    }),
    startDate: (0, import_fields9.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      ui: {
        description: "Subscription start date"
      }
    }),
    nextBillingDate: (0, import_fields9.timestamp)({
      ui: {
        description: "Next scheduled billing date"
      }
    }),
    cancelledAt: (0, import_fields9.timestamp)({
      ui: {
        description: "Date subscription was cancelled"
      }
    }),
    pausedAt: (0, import_fields9.timestamp)({
      ui: {
        description: "Date subscription was paused"
      }
    }),
    paymentMethod: (0, import_fields9.relationship)({
      ref: "PaymentMethod.subscriptions",
      ui: {
        displayMode: "select",
        description: "Payment method used for billing"
      }
    }),
    billingHistory: (0, import_fields9.relationship)({
      ref: "GymPayment.subscription",
      many: true,
      access: { create: import_access15.denyAll, update: import_access15.denyAll },
      ui: {
        description: "Payment history for this subscription"
      }
    }),
    // Stripe integration - required because Subscription records are only created from Stripe webhooks
    stripeSubscriptionId: (0, import_fields9.text)({
      access: { read: permissions.canManageAllRecords },
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Stripe Subscription ID for automatic billing"
      }
    }),
    stripeCustomerId: (0, import_fields9.text)({
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: "Stripe Customer ID"
      }
    }),
    // Signed Stripe subscription events are reconciled under a subscription
    // lock. These internal fields are the durable event high-water mark.
    providerEventCreated: (0, import_fields9.integer)({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: import_access15.denyAll, create: import_access15.denyAll, update: import_access15.denyAll }
    }),
    providerEventId: (0, import_fields9.text)({
      defaultValue: "",
      access: { read: import_access15.denyAll, create: import_access15.denyAll, update: import_access15.denyAll }
    }),
    ...trackingFields
  },
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "member", list: "member", required: true },
      { field: "membershipTier", list: "membershipTier", required: true },
      { field: "paymentMethod", list: "paymentMethod" }
    ])
    // Automatic billing remains adapter-owned; this hook only enforces tenancy.
  }
});

// features/keystone/models/GymPayment.ts
var import_core9 = require("@keystone-6/core");
var import_access17 = require("@keystone-6/core/access");
var import_fields10 = require("@keystone-6/core/fields");
var GymPayment = (0, import_core9.list)({
  hooks: {
    async validateInput(args) {
      paymentEvidenceHooks("GymPayment").validateInput(args);
      await validateTenantOwnership([
        { field: "member", list: "member", required: true },
        { field: "subscription", list: "subscription" },
        { field: "paymentProvider", list: "paymentProvider" },
        { field: "paymentSession", list: "paymentSession" }
      ])(args);
    },
    validateDelete: paymentEvidenceHooks("GymPayment").validateDelete
  },
  access: {
    operation: {
      query: isSignedIn,
      // Payment records are provider/webhook-controlled; refunds use the guarded custom mutation.
      create: import_access17.denyAll,
      update: import_access17.denyAll,
      delete: import_access17.denyAll
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "amount", "status", "paymentDate", "subscription"]
    }
  },
  fields: {
    organization: (0, import_fields10.relationship)({
      ref: "Organization.gymPayments",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields10.relationship)({
      ref: "Member.payments",
      ui: {
        displayMode: "select",
        description: "Member who made the payment"
      }
    }),
    subscription: (0, import_fields10.relationship)({
      ref: "Subscription.billingHistory",
      ui: {
        displayMode: "select",
        description: "Associated subscription (if recurring payment)"
      }
    }),
    paymentProvider: (0, import_fields10.relationship)({
      ref: "PaymentProvider.payments",
      access: { read: permissions.canManageAllRecords }
    }),
    paymentSession: (0, import_fields10.relationship)({
      ref: "PaymentSession.payments",
      access: { read: permissions.canManageAllRecords }
    }),
    amount: (0, import_fields10.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in the currency minor unit"
      }
    }),
    currencyCode: (0, import_fields10.text)({
      validation: { isRequired: true },
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code" }
    }),
    status: (0, import_fields10.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      ui: {
        description: "Payment status"
      }
    }),
    paymentDate: (0, import_fields10.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Date payment was processed"
      }
    }),
    metadata: (0, import_fields10.json)({
      access: { read: permissions.canManageAllRecords },
      defaultValue: {},
      ui: {
        views: "./fields/json-view",
        description: "Additional payment data from Stripe/PayPal (stored as JSON)"
      }
    }),
    // Stripe integration fields
    stripePaymentIntentId: (0, import_fields10.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: "Stripe Payment Intent ID"
      }
    }),
    stripeChargeId: (0, import_fields10.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: "Stripe Charge ID"
      }
    }),
    stripeInvoiceId: (0, import_fields10.text)({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      isIndexed: "unique",
      ui: {
        description: "Stripe Invoice ID"
      }
    }),
    receiptNumber: (0, import_fields10.text)({
      isIndexed: true,
      ui: {
        description: "Receipt number for this payment"
      }
    }),
    description: (0, import_fields10.text)({
      ui: {
        displayMode: "textarea",
        description: "Payment description"
      }
    }),
    refundedAt: (0, import_fields10.timestamp)({
      ui: {
        description: "Date payment was refunded"
      }
    }),
    refundAmount: (0, import_fields10.integer)({
      ui: {
        description: "Refund amount in cents"
      }
    }),
    refundReason: (0, import_fields10.text)({
      ui: {
        description: "Operator-supplied reason for the refund"
      }
    }),
    refundLockUntil: (0, import_fields10.timestamp)({ access: { read: permissions.canManageAllRecords } }),
    refundLockToken: (0, import_fields10.text)({ access: { read: permissions.canManageAllRecords } }),
    // Virtual field for payment link to Stripe Dashboard
    paymentLink: (0, import_fields10.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core9.graphql.field({
        type: import_core9.graphql.String,
        resolve(item) {
          if (item.stripePaymentIntentId) {
            return `https://dashboard.stripe.com/payments/${item.stripePaymentIntentId}`;
          }
          return null;
        }
      }),
      ui: {
        description: "Link to payment in Stripe Dashboard"
      }
    }),
    refundAttempts: (0, import_fields10.relationship)({
      ref: "GymRefundAttempt.payment",
      many: true,
      access: { create: import_access17.denyAll, update: import_access17.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentMethod.ts
var import_core10 = require("@keystone-6/core");
var import_access19 = require("@keystone-6/core/access");
var import_fields11 = require("@keystone-6/core/fields");
var PaymentMethod = (0, import_core10.list)({
  hooks: { validateInput: validateTenantOwnership([
    { field: "member", list: "member", required: true }
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "type", "brand", "last4", "isDefault"]
    }
  },
  fields: {
    organization: (0, import_fields11.relationship)({
      ref: "Organization.paymentMethods",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields11.relationship)({
      ref: "Member",
      ui: {
        displayMode: "select",
        description: "Member who owns this payment method"
      }
    }),
    type: (0, import_fields11.select)({
      type: "string",
      options: [
        { label: "Card", value: "card" },
        { label: "Bank Account", value: "bank" }
      ],
      defaultValue: "card",
      validation: { isRequired: true },
      ui: {
        description: "Payment method type"
      }
    }),
    last4: (0, import_fields11.text)({
      validation: { isRequired: true },
      ui: {
        description: "Last 4 digits of card/account number"
      }
    }),
    brand: (0, import_fields11.text)({
      ui: {
        description: "Card brand (Visa, Mastercard, etc.) or bank name"
      }
    }),
    isDefault: (0, import_fields11.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this the default payment method?"
      }
    }),
    // Stripe integration - required because PaymentMethod records are only created from Stripe
    stripePaymentMethodId: (0, import_fields11.text)({
      access: { read: permissions.canManageAllRecords },
      isIndexed: "unique",
      validation: { isRequired: true },
      ui: {
        description: "Stripe Payment Method ID"
      }
    }),
    expiryMonth: (0, import_fields11.text)({
      ui: {
        description: "Card expiry month (for cards)"
      }
    }),
    expiryYear: (0, import_fields11.text)({
      ui: {
        description: "Card expiry year (for cards)"
      }
    }),
    subscriptions: (0, import_fields11.relationship)({
      ref: "Subscription.paymentMethod",
      many: true,
      access: { create: import_access19.denyAll, update: import_access19.denyAll },
      ui: {
        description: "Subscriptions using this payment method"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core11 = require("@keystone-6/core");
var import_access21 = require("@keystone-6/core/access");
var import_fields12 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core11.list)({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, code], map: "PaymentProvider_organization_code_key")\n}'
      );
    }
  },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: permissions.canManageAllRecords,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "adapterKey", "isInstalled"]
    }
  },
  fields: {
    organization: (0, import_fields12.relationship)({
      ref: "Organization.paymentProviders",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    name: (0, import_fields12.text)({ validation: { isRequired: true } }),
    code: (0, import_fields12.text)({
      isIndexed: true,
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-z0-9_-]+$/,
          explanation: "Payment provider code must start with pp_ and use lowercase letters, numbers, hyphens, or underscores."
        }
      }
    }),
    adapterKey: (0, import_fields12.text)({
      validation: { isRequired: true },
      ui: { description: "Registered server-side adapter key, such as stripe or manual." }
    }),
    providerAccountId: (0, import_fields12.text)({
      isIndexed: true,
      db: { isNullable: true },
      ui: { description: "Verified provider account identity used to route webhooks to this tenant." }
    }),
    isInstalled: (0, import_fields12.checkbox)({ defaultValue: true }),
    credentials: (0, import_fields12.json)({
      defaultValue: {},
      access: {
        read: import_access21.denyAll
      },
      ui: {
        description: "Write-only provider credentials. Gym's Stripe adapter normally reads secrets from environment variables."
      }
    }),
    metadata: (0, import_fields12.json)({
      defaultValue: {},
      access: { read: permissions.canManageAllRecords }
    }),
    sessions: (0, import_fields12.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true,
      access: { create: import_access21.denyAll, update: import_access21.denyAll }
    }),
    payments: (0, import_fields12.relationship)({
      ref: "GymPayment.paymentProvider",
      many: true,
      access: { create: import_access21.denyAll, update: import_access21.denyAll }
    }),
    events: (0, import_fields12.relationship)({
      ref: "PaymentEvent.paymentProvider",
      many: true,
      access: { create: import_access21.denyAll, update: import_access21.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core12 = require("@keystone-6/core");
var import_access23 = require("@keystone-6/core/access");
var import_fields13 = require("@keystone-6/core/fields");
var PaymentSession = (0, import_core12.list)({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, idempotencyKey], map: "PaymentSession_organization_idempotency_key")\n}'
      );
    }
  },
  hooks: { validateInput: validateTenantOwnership([
    { field: "user", list: "user", required: true },
    { field: "membershipTier", list: "membershipTier", required: true },
    { field: "paymentProvider", list: "paymentProvider", required: true }
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      // Checkout sessions are created and advanced only by the guarded payment workflow.
      create: import_access23.denyAll,
      update: import_access23.denyAll,
      delete: import_access23.denyAll
    },
    filter: {
      query: rules.canReadOwnPaymentSession,
      update: rules.canReadOwnPaymentSession,
      delete: rules.canReadOwnPaymentSession
    }
  },
  ui: {
    listView: {
      initialColumns: ["user", "paymentProvider", "status", "amount", "currencyCode", "expiresAt"]
    }
  },
  fields: {
    organization: (0, import_fields13.relationship)({
      ref: "Organization.paymentSessions",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    user: (0, import_fields13.relationship)({ ref: "User.paymentSessions" }),
    membershipTier: (0, import_fields13.relationship)({ ref: "MembershipTier.paymentSessions" }),
    paymentProvider: (0, import_fields13.relationship)({ ref: "PaymentProvider.sessions" }),
    status: (0, import_fields13.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Requires Action", value: "requires_action" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Expired", value: "expired" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    billingCycle: (0, import_fields13.select)({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" }
      ],
      validation: { isRequired: true }
    }),
    amount: (0, import_fields13.integer)({
      validation: { isRequired: true },
      ui: { description: "Backend-authoritative amount in the currency's minor unit." }
    }),
    currencyCode: (0, import_fields13.text)({ validation: { isRequired: true }, defaultValue: "USD" }),
    idempotencyKey: (0, import_fields13.text)({ isIndexed: true, validation: { isRequired: true } }),
    providerSessionId: (0, import_fields13.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords }
    }),
    providerCustomerId: (0, import_fields13.text)({ access: { read: permissions.canManageAllRecords } }),
    providerSubscriptionId: (0, import_fields13.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords }
    }),
    checkoutUrl: (0, import_fields13.text)({
      db: { isNullable: true },
      access: { read: rules.canReadOwnPaymentSessionField }
    }),
    data: (0, import_fields13.json)({
      defaultValue: {},
      access: { read: permissions.canManageAllRecords }
    }),
    expiresAt: (0, import_fields13.timestamp)(),
    completedAt: (0, import_fields13.timestamp)(),
    failedAt: (0, import_fields13.timestamp)(),
    cancelledAt: (0, import_fields13.timestamp)(),
    lastError: (0, import_fields13.text)({ access: { read: permissions.canManageAllRecords } }),
    provisioningLockedUntil: (0, import_fields13.timestamp)({ access: { read: permissions.canManageAllRecords } }),
    payments: (0, import_fields13.relationship)({
      ref: "GymPayment.paymentSession",
      many: true,
      access: { create: import_access23.denyAll, update: import_access23.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentEvent.ts
var import_access25 = require("@keystone-6/core/access");
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var PaymentEvent = (0, import_core13.list)({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([paymentProviderId, providerEventId], map: "PaymentEvent_provider_event_key")\n}'
      );
    }
  },
  hooks: { validateInput: validateTenantOwnership([
    { field: "paymentProvider", list: "paymentProvider", required: true }
  ]) },
  access: {
    operation: {
      query: permissions.canManageAllRecords,
      create: import_access25.denyAll,
      update: import_access25.denyAll,
      delete: import_access25.denyAll
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["providerEventId", "eventType", "status", "processedAt"]
    }
  },
  fields: {
    organization: (0, import_fields14.relationship)({
      ref: "Organization.paymentEvents",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    providerEventId: (0, import_fields14.text)({ validation: { isRequired: true } }),
    eventType: (0, import_fields14.text)({ validation: { isRequired: true } }),
    attempts: (0, import_fields14.integer)({ defaultValue: 0, access: { read: permissions.canManageAllRecords } }),
    lockedUntil: (0, import_fields14.timestamp)({ access: { read: permissions.canManageAllRecords } }),
    status: (0, import_fields14.select)({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    paymentProvider: (0, import_fields14.relationship)({ ref: "PaymentProvider.events" }),
    processedAt: (0, import_fields14.timestamp)(),
    lastError: (0, import_fields14.text)(),
    data: (0, import_fields14.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/CheckIn.ts
var import_core14 = require("@keystone-6/core");
var import_access27 = require("@keystone-6/core/access");
var import_fields15 = require("@keystone-6/core/fields");
var CheckIn = (0, import_core14.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, memberId, openCheckInKey") },
  access: {
    operation: {
      query: isSignedIn,
      create: import_access27.denyAll,
      update: import_access27.denyAll,
      delete: import_access27.denyAll
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "checkInTime", "checkOutTime", "method", "membershipValidated"]
    }
  },
  fields: {
    organization: (0, import_fields15.relationship)({
      ref: "Organization.checkIns",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields15.relationship)({
      ref: "Member.checkIns",
      ui: {
        displayMode: "select",
        description: "Member checking in"
      }
    }),
    checkInTime: (0, import_fields15.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Check-in timestamp"
      }
    }),
    checkOutTime: (0, import_fields15.timestamp)({
      ui: {
        description: "Check-out timestamp (optional)"
      }
    }),
    location: (0, import_fields15.relationship)({
      ref: "Location",
      ui: {
        displayMode: "select",
        description: "Gym location where check-in occurred"
      }
    }),
    method: (0, import_fields15.select)({
      type: "string",
      options: [
        { label: "QR Code", value: "qr_code" },
        { label: "RFID", value: "rfid" },
        { label: "Manual", value: "manual" },
        { label: "App", value: "app" }
      ],
      defaultValue: "app",
      validation: { isRequired: true },
      ui: {
        description: "Check-in method used"
      }
    }),
    isGuest: (0, import_fields15.checkbox)({
      defaultValue: false,
      ui: {
        description: "Is this a guest check-in?"
      }
    }),
    guestName: (0, import_fields15.text)({
      ui: {
        description: "Guest name (if isGuest is true)"
      }
    }),
    membershipValidated: (0, import_fields15.checkbox)({
      defaultValue: false,
      ui: {
        description: "Has membership status been validated?"
      }
    }),
    validationNotes: (0, import_fields15.text)({
      ui: {
        displayMode: "textarea",
        description: "Notes from validation (e.g., membership expired, special access)"
      }
    }),
    openCheckInKey: (0, import_fields15.text)({
      db: { isNullable: true },
      access: { read: import_access27.denyAll, create: import_access27.denyAll, update: import_access27.denyAll }
    }),
    ...trackingFields
  },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "member", list: "member" },
        { field: "location", list: "location" }
      ])(args);
    },
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === "create" && resolvedData.member) {
        const sudoContext = context.sudo();
        const member = await sudoContext.query.Member.findOne({
          where: { id: resolvedData.member.connect.id },
          query: `
            id
            status
            user {
              id
              membership {
                id
                status
              }
            }
            subscriptions(where: { status: { equals: "active" } }) {
              id
              status
            }
          `
        });
        if (!member) {
          throw new Error("Member not found");
        }
        if (member.status !== "active") {
          throw new Error(`Cannot check in: Member status is ${member.status}`);
        }
        const hasActiveMembership = member.user?.membership?.status === "active";
        const hasActiveSubscription = !!member.subscriptions?.length;
        if (!hasActiveMembership && !hasActiveSubscription) {
          throw new Error("Cannot check in: No active membership or subscription found");
        }
        resolvedData.membershipValidated = true;
      }
    }
  }
});

// features/keystone/models/Location.ts
var import_core15 = require("@keystone-6/core");
var import_access29 = require("@keystone-6/core/access");
var import_fields16 = require("@keystone-6/core/fields");
var tenantItem = (args) => tenantItemAccess(args);
var Location = (0, import_core15.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: { query: tenantFilter },
    item: { update: tenantItem, delete: tenantItem }
  },
  ui: {
    listView: {
      initialColumns: ["name", "address", "isActive"]
    }
  },
  fields: {
    organization: (0, import_fields16.relationship)({
      ref: "Organization.locations",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
      ui: { description: "Tenant organization for this location" }
    }),
    name: (0, import_fields16.text)({
      validation: { isRequired: true },
      ui: {
        description: "Location name (e.g., Downtown Gym, West Side Branch)"
      }
    }),
    address: (0, import_fields16.text)({
      ui: {
        displayMode: "textarea",
        description: "Physical address of the location"
      }
    }),
    phone: (0, import_fields16.text)({
      ui: {
        description: "Location phone number"
      }
    }),
    isActive: (0, import_fields16.checkbox)({
      defaultValue: true,
      ui: {
        description: "Is this location currently active?"
      }
    }),
    resources: (0, import_fields16.relationship)({
      ref: "GymResource.location",
      many: true,
      access: { create: import_access29.denyAll, update: import_access29.denyAll }
    }),
    trainerAvailability: (0, import_fields16.relationship)({
      ref: "TrainerAvailability.location",
      many: true,
      access: { create: import_access29.denyAll, update: import_access29.denyAll }
    }),
    trainerAppointments: (0, import_fields16.relationship)({
      ref: "TrainerAppointment.location",
      many: true,
      access: { create: import_access29.denyAll, update: import_access29.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/GymSettings.ts
var import_core16 = require("@keystone-6/core");
var import_access31 = require("@keystone-6/core/access");
var import_fields17 = require("@keystone-6/core/fields");

// features/keystone/utils/gymLogo.ts
var ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc"
]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio"
]);
var ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
var TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
var MAX_LOGO_LENGTH = 5e4;
function sanitizeGymLogoSvg(value) {
  if (typeof value !== "string") return "";
  const source = value.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > MAX_LOGO_LENGTH) {
    return "";
  }
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }
  let tagCount = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) continue;
    const attributes = match[2];
    let consumed = "";
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const attributeValue = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(attributeValue)) return "";
      if (/url\(/i.test(attributeValue) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(attributeValue)) return "";
    }
    if (attributes.replace(consumed, "").replace(/\//g, "").trim()) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}

// features/platform/store-settings/lib/storefront-branding.ts
var DEFAULT_STOREFRONT_HUE = 16;
function normalizeStorefrontHue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STOREFRONT_HUE;
  const rounded = Math.round(numeric);
  return (rounded % 360 + 360) % 360;
}

// features/keystone/models/GymSettings.ts
var GymSettings = (0, import_core16.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: import_access31.denyAll,
      update: import_access31.denyAll,
      delete: import_access31.denyAll
    },
    filter: { query: tenantFilter }
  },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId], map: "GymSettings_organization_key")\n}'
      );
    }
  },
  graphql: {
    plural: "gymSettingsItems"
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"]
    }
  },
  fields: {
    organization: (0, import_fields17.relationship)({
      ref: "Organization.gymSettings",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    name: (0, import_fields17.text)({
      validation: { isRequired: true },
      ui: { description: "Public gym/storefront name" }
    }),
    tagline: (0, import_fields17.text)({
      defaultValue: "",
      ui: { description: "Short brand tagline" }
    }),
    logoIcon: (0, import_fields17.text)({
      ui: {
        displayMode: "textarea",
        description: "Optional inline SVG logo; executable and external content is rejected"
      },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          if (value === void 0 || value === null || value === "") return value;
          return sanitizeGymLogoSvg(value);
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (typeof submitted === "string" && submitted.trim() && !resolvedData?.[fieldKey]) {
            addValidationError("Logo must be a valid, safe SVG document");
          }
        }
      }
    }),
    brandHue: (0, import_fields17.integer)({
      defaultValue: DEFAULT_STOREFRONT_HUE,
      validation: { isRequired: true, min: 0, max: 359 },
      ui: { description: "Storefront accent hue from 0 through 359" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === void 0 ? value : normalizeStorefrontHue(value);
        }
      }
    }),
    description: (0, import_fields17.text)({
      ui: {
        displayMode: "textarea",
        description: "Short public business description"
      }
    }),
    address: (0, import_fields17.text)({
      ui: { description: "Primary public address" }
    }),
    phone: (0, import_fields17.text)({
      ui: { description: "Primary public phone" }
    }),
    email: (0, import_fields17.text)({
      ui: { description: "Primary public email" }
    }),
    currencyCode: (0, import_fields17.text)({
      defaultValue: "USD"
    }),
    locale: (0, import_fields17.text)({
      defaultValue: "en-US"
    }),
    timezone: (0, import_fields17.text)({
      defaultValue: "America/New_York"
    }),
    countryCode: (0, import_fields17.text)({
      defaultValue: "US"
    }),
    hours: (0, import_fields17.json)({
      defaultValue: {},
      ui: { description: "Operating hours by day" }
    }),
    heroEyebrow: (0, import_fields17.text)({ defaultValue: "" }),
    heroHeadline: (0, import_fields17.text)({ defaultValue: "" }),
    heroSubheadline: (0, import_fields17.text)({ defaultValue: "" }),
    heroImageUrl: (0, import_fields17.text)({
      ui: { description: "Storefront hero image URL or local asset path" }
    }),
    heroPrimaryCtaLabel: (0, import_fields17.text)({ defaultValue: "" }),
    heroPrimaryCtaHref: (0, import_fields17.text)({ defaultValue: "" }),
    heroSecondaryCtaLabel: (0, import_fields17.text)({ defaultValue: "" }),
    heroSecondaryCtaHref: (0, import_fields17.text)({ defaultValue: "" }),
    promoBanner: (0, import_fields17.text)({ defaultValue: "" }),
    footerTagline: (0, import_fields17.text)({ defaultValue: "" }),
    copyrightName: (0, import_fields17.text)({ defaultValue: "" }),
    facilityHeadline: (0, import_fields17.text)({ defaultValue: "" }),
    facilityDescription: (0, import_fields17.text)({ defaultValue: "" }),
    facilityHighlights: (0, import_fields17.json)({
      defaultValue: [],
      ui: { description: "Public facility cards/sections" }
    }),
    heroStats: (0, import_fields17.json)({
      defaultValue: [],
      ui: { description: "Hero stat cards" }
    }),
    contactTopics: (0, import_fields17.json)({
      defaultValue: [],
      ui: { description: "Contact page topics/cards" }
    }),
    rating: (0, import_fields17.decimal)({
      precision: 2,
      scale: 1,
      defaultValue: "4.8"
    }),
    reviewCount: (0, import_fields17.integer)({
      defaultValue: 0
    }),
    ...trackingFields
  }
});

// features/keystone/models/WorkoutLog.ts
var import_core17 = require("@keystone-6/core");
var import_access33 = require("@keystone-6/core/access");
var import_fields18 = require("@keystone-6/core/fields");
var WorkoutLog = (0, import_core17.list)({
  hooks: { validateInput: validateTenantOwnership([
    { field: "member", list: "member", required: true }
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "title", "date", "duration"]
    }
  },
  fields: {
    organization: (0, import_fields18.relationship)({
      ref: "Organization.workoutLogs",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields18.relationship)({
      ref: "Member.workoutLogs",
      ui: {
        displayMode: "select",
        description: "Member who performed this workout"
      }
    }),
    date: (0, import_fields18.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "Workout date"
      }
    }),
    title: (0, import_fields18.text)({
      ui: {
        description: "Workout title (e.g., Chest Day, Full Body)"
      }
    }),
    duration: (0, import_fields18.integer)({
      ui: {
        description: "Workout duration in minutes"
      }
    }),
    notes: (0, import_fields18.text)({
      ui: {
        displayMode: "textarea",
        description: "Workout notes and observations"
      }
    }),
    workoutSets: (0, import_fields18.relationship)({
      ref: "WorkoutSet.workoutLog",
      many: true,
      access: { create: import_access33.denyAll, update: import_access33.denyAll },
      ui: {
        description: "Sets performed in this workout"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/WorkoutSet.ts
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var WorkoutSet = (0, import_core18.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, workoutLogId, exerciseId, setNumber") },
  hooks: { validateInput: validateTenantOwnership([
    { field: "workoutLog", list: "workoutLog", required: true },
    { field: "exercise", list: "exercise", required: true }
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: rules.canReadOwnWorkoutSet,
      update: rules.canReadOwnWorkoutSet,
      delete: rules.canReadOwnWorkoutSet
    }
  },
  ui: {
    listView: {
      initialColumns: ["workoutLog", "exercise", "setNumber", "reps", "weight"]
    }
  },
  fields: {
    organization: (0, import_fields19.relationship)({
      ref: "Organization.workoutSets",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    workoutLog: (0, import_fields19.relationship)({
      ref: "WorkoutLog.workoutSets",
      ui: {
        displayMode: "select",
        description: "Workout log this set belongs to"
      }
    }),
    exercise: (0, import_fields19.relationship)({
      ref: "Exercise",
      ui: {
        displayMode: "select",
        description: "Exercise performed"
      }
    }),
    setNumber: (0, import_fields19.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Set number in the workout"
      }
    }),
    reps: (0, import_fields19.integer)({
      ui: {
        description: "Number of repetitions"
      }
    }),
    weight: (0, import_fields19.float)({
      ui: {
        description: "Weight used (in pounds or kg)"
      }
    }),
    duration: (0, import_fields19.integer)({
      ui: {
        description: "Duration in seconds (for timed exercises)"
      }
    }),
    restTime: (0, import_fields19.integer)({
      ui: {
        description: "Rest time after this set (in seconds)"
      }
    }),
    notes: (0, import_fields19.text)({
      ui: {
        displayMode: "textarea",
        description: "Notes about this set (form, difficulty, etc.)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Exercise.ts
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var import_fields21 = require("@keystone-6/core/fields");
var Exercise = (0, import_core19.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "category", "equipment"]
    }
  },
  fields: {
    organization: (0, import_fields21.relationship)({
      ref: "Organization.exercises",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    name: (0, import_fields20.text)({
      validation: { isRequired: true },
      ui: {
        description: "Exercise name (e.g., Bench Press, Squats)"
      }
    }),
    category: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Strength", value: "strength" },
        { label: "Cardio", value: "cardio" },
        { label: "Flexibility", value: "flexibility" },
        { label: "Balance", value: "balance" },
        { label: "Functional", value: "functional" }
      ],
      validation: { isRequired: true },
      ui: {
        description: "Exercise category"
      }
    }),
    muscleGroup: (0, import_fields20.json)({
      defaultValue: [],
      ui: {
        views: "./fields/json-view",
        description: "Target muscle groups (stored as JSON array)"
      }
    }),
    equipment: (0, import_fields20.text)({
      ui: {
        description: "Equipment needed (e.g., Barbell, Dumbbells, None)"
      }
    }),
    description: (0, import_fields20.text)({
      ui: {
        displayMode: "textarea",
        description: "Exercise description and proper form instructions"
      }
    }),
    videoUrl: (0, import_fields20.text)({
      ui: {
        description: "URL to demonstration video"
      }
    }),
    difficulty: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" }
      ],
      defaultValue: "beginner",
      ui: {
        description: "Exercise difficulty level"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Waitlist.ts
var import_core20 = require("@keystone-6/core");
var import_access37 = require("@keystone-6/core/access");
var import_fields22 = require("@keystone-6/core/fields");
var Waitlist = (0, import_core20.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: import_access37.denyAll,
      update: import_access37.denyAll,
      delete: import_access37.denyAll
    },
    filter: {
      query: rules.canReadOwnWaitlist,
      update: rules.canReadOwnWaitlist,
      delete: rules.canReadOwnWaitlist
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "classSchedule", "position", "status", "addedAt"]
    }
  },
  fields: {
    organization: (0, import_fields22.relationship)({
      ref: "Organization.waitlists",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields22.relationship)({
      ref: "Member.waitlistEntries",
      ui: {
        displayMode: "select",
        description: "Member on the waitlist"
      }
    }),
    classSchedule: (0, import_fields22.relationship)({
      ref: "ClassSchedule",
      ui: {
        displayMode: "select",
        description: "Class the member is waiting for"
      }
    }),
    position: (0, import_fields22.integer)({
      ui: {
        description: "Position in the waitlist (auto-calculated based on addedAt)",
        itemView: { fieldMode: "read" },
        createView: { fieldMode: "hidden" }
      }
    }),
    addedAt: (0, import_fields22.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      ui: {
        description: "When the member joined the waitlist"
      }
    }),
    notifiedAt: (0, import_fields22.timestamp)({
      ui: {
        description: "When the member was notified of an available spot"
      }
    }),
    status: (0, import_fields22.select)({
      type: "string",
      options: [
        { label: "Waiting", value: "waiting" },
        { label: "Notified", value: "notified" },
        { label: "Converted", value: "converted" },
        { label: "Expired", value: "expired" }
      ],
      defaultValue: "waiting",
      validation: { isRequired: true },
      ui: {
        description: "Waitlist entry status"
      }
    }),
    expiresAt: (0, import_fields22.timestamp)({
      ui: {
        description: "When the notification expires (typically 2 hours after notification)"
      }
    }),
    // Virtual field to calculate estimated wait time
    estimatedWaitTime: (0, import_fields22.virtual)({
      field: import_core20.graphql.field({
        type: import_core20.graphql.String,
        async resolve(item) {
          const position = item.position;
          return position && position > 0 ? `Queue position ${position}; no time estimate available` : "No time estimate available";
        }
      }),
      ui: {
        description: "Queue position only; Gym does not estimate a conversion time"
      }
    }),
    ...trackingFields
  },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "member", list: "member", required: true },
        { field: "classSchedule", list: "classSchedule", required: true }
      ])(args);
    },
    // Calculate position automatically based on addedAt timestamp
    async beforeOperation({ operation, resolvedData, context, item }) {
      if (operation === "create" && resolvedData.classSchedule) {
        const sudoContext = context.sudo();
        const existingEntry = await sudoContext.query.Waitlist.findMany({
          where: {
            AND: [
              { member: { id: { equals: resolvedData.member.connect.id } } },
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { in: ["waiting", "notified"] } }
            ]
          },
          query: "id"
        });
        if (existingEntry && existingEntry.length > 0) {
          throw new Error("Member is already on the waitlist for this class");
        }
        const waitlistCount = await sudoContext.query.Waitlist.count({
          where: {
            AND: [
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { equals: "waiting" } }
            ]
          }
        });
        resolvedData.position = waitlistCount + 1;
      }
      if (operation === "update" && item && resolvedData.status) {
        if ((item.status === "waiting" || item.status === "notified") && (resolvedData.status === "converted" || resolvedData.status === "expired")) {
          const sudoContext = context.sudo();
          const classScheduleId = item.classScheduleId?.toString();
          const currentPosition = item.position;
          const allWaitingEntries = await sudoContext.query.Waitlist.findMany({
            where: {
              AND: [
                { classSchedule: { id: { equals: classScheduleId } } },
                { status: { equals: "waiting" } },
                { position: { gt: currentPosition } }
              ]
            },
            orderBy: { position: "asc" },
            query: "id position"
          });
          for (const entry of allWaitingEntries) {
            await sudoContext.query.Waitlist.updateOne({
              where: { id: entry.id },
              data: { position: entry.position - 1 }
            });
          }
        }
      }
    }
  }
});

// features/keystone/models/AttendanceRecord.ts
var import_core21 = require("@keystone-6/core");
var import_access39 = require("@keystone-6/core/access");
var import_fields23 = require("@keystone-6/core/fields");
var AttendanceRecord = (0, import_core21.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, bookingId") },
  access: {
    operation: {
      query: isSignedIn,
      create: import_access39.denyAll,
      update: import_access39.denyAll,
      delete: import_access39.denyAll
    },
    filter: {
      query: rules.canReadOwnAttendance,
      update: rules.canReadOwnAttendance,
      delete: rules.canReadOwnAttendance
    }
  },
  ui: {
    listView: {
      initialColumns: ["member", "classSchedule", "attended", "markedAt", "lateArrival"]
    }
  },
  fields: {
    organization: (0, import_fields23.relationship)({
      ref: "Organization.attendanceRecords",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    booking: (0, import_fields23.relationship)({
      ref: "ClassBooking",
      ui: {
        displayMode: "select",
        description: "Associated class booking"
      }
    }),
    classSchedule: (0, import_fields23.relationship)({
      ref: "ClassSchedule",
      ui: {
        displayMode: "select",
        description: "Class that was attended"
      }
    }),
    member: (0, import_fields23.relationship)({
      ref: "Member.attendanceRecords",
      ui: {
        displayMode: "select",
        description: "Member whose attendance is being tracked"
      }
    }),
    attended: (0, import_fields23.checkbox)({
      defaultValue: false,
      ui: {
        description: "Did the member attend?"
      }
    }),
    markedAt: (0, import_fields23.timestamp)({
      ui: {
        description: "When attendance was marked"
      }
    }),
    markedBy: (0, import_fields23.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who marked attendance"
      }
    }),
    noShowReason: (0, import_fields23.text)({
      ui: {
        displayMode: "textarea",
        description: "Reason for no-show (if applicable)"
      }
    }),
    lateArrival: (0, import_fields23.checkbox)({
      defaultValue: false,
      ui: {
        description: "Was the member late?"
      }
    }),
    minutesLate: (0, import_fields23.integer)({
      ui: {
        description: "How many minutes late (if lateArrival is true)"
      }
    }),
    // Virtual field for attendance rate per member
    // This would typically be calculated at the Member level, but included here as a reference
    memberAttendanceRate: (0, import_fields23.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core21.graphql.field({
        type: import_core21.graphql.Float,
        async resolve(item, args, context) {
          if (!item.memberId) return 0;
          const sudoContext = context.sudo();
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.memberId.toString() } } }
          });
          if (totalRecords === 0) return 0;
          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.memberId.toString() } } },
                { attended: { equals: true } }
              ]
            }
          });
          return attendedRecords / totalRecords * 100;
        }
      }),
      ui: {
        description: "Member attendance rate percentage"
      }
    }),
    ...trackingFields
  },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "booking", list: "classBooking" },
        { field: "classSchedule", list: "classSchedule", required: true },
        { field: "member", list: "member", required: true },
        { field: "markedBy", list: "user" }
      ])(args);
    },
    // Automatically create attendance records when class starts
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === "create") {
        if (!resolvedData.markedAt) {
          resolvedData.markedAt = /* @__PURE__ */ new Date();
        }
      }
    }
  }
});

// features/keystone/models/ClassType.ts
var import_core22 = require("@keystone-6/core");
var import_access41 = require("@keystone-6/core/access");
var import_fields24 = require("@keystone-6/core/fields");
var import_fields_document2 = require("@keystone-6/fields-document");
var import_fields25 = require("@keystone-6/core/fields");
var ClassType = (0, import_core22.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "difficulty", "duration", "caloriesBurn"]
    }
  },
  fields: {
    organization: (0, import_fields25.relationship)({
      ref: "Organization.classTypes",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    name: (0, import_fields24.text)({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Yoga, Spin, HIIT, Boxing"
      }
    }),
    description: (0, import_fields_document2.document)({
      formatting: true,
      links: true
    }),
    difficulty: (0, import_fields24.select)({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "All Levels", value: "all-levels" }
      ],
      defaultValue: "all-levels",
      validation: { isRequired: true }
    }),
    duration: (0, import_fields24.integer)({
      validation: { isRequired: true, min: 1, max: 1440 },
      defaultValue: 60,
      ui: {
        description: "Typical duration in minutes"
      }
    }),
    equipmentNeeded: (0, import_fields24.multiselect)({
      type: "string",
      options: [
        { label: "Mat", value: "mat" },
        { label: "Weights", value: "weights" },
        { label: "Resistance Bands", value: "resistance_bands" },
        { label: "Jump Rope", value: "jump_rope" },
        { label: "Boxing Gloves", value: "boxing_gloves" },
        { label: "Cycling Shoes", value: "cycling_shoes" },
        { label: "Kettlebells", value: "kettlebells" },
        { label: "Medicine Ball", value: "medicine_ball" },
        { label: "None", value: "none" }
      ],
      defaultValue: []
    }),
    caloriesBurn: (0, import_fields24.integer)({
      validation: { min: 0 },
      ui: {
        description: "Estimated calories burned per session"
      }
    }),
    schedules: (0, import_fields25.relationship)({
      ref: "ClassSchedule.classType",
      many: true,
      access: { create: import_access41.denyAll, update: import_access41.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassSchedule.ts
var import_core23 = require("@keystone-6/core");
var import_access43 = require("@keystone-6/core/access");
var import_fields26 = require("@keystone-6/core/fields");
var validateClassScheduleTenant = validateTenantOwnership([
  { field: "instructor", list: "instructor" },
  { field: "classType", list: "classType" }
]);
var ClassSchedule = (0, import_core23.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name, dayOfWeek, startTime, instructorId") },
  hooks: {
    async validateInput(args) {
      await validateClassScheduleTenant(args);
      const startTime = args.resolvedData.startTime ?? args.item?.startTime;
      const endTime = args.resolvedData.endTime ?? args.item?.endTime;
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (typeof startTime !== "string" || !timePattern.test(startTime)) {
        args.addValidationError("Start time must use 24-hour HH:MM format");
      }
      if (typeof endTime !== "string" || !timePattern.test(endTime)) {
        args.addValidationError("End time must use 24-hour HH:MM format");
      } else if (typeof startTime === "string" && timePattern.test(startTime) && endTime <= startTime) {
        args.addValidationError("End time must be later than start time");
      }
      const nextCapacity = args.resolvedData.maxCapacity;
      if (args.operation === "update" && typeof nextCapacity === "number" && args.item?.id) {
        const inheritedInstances = await args.context.prisma.classInstance.findMany({
          where: { classScheduleId: args.item.id, maxCapacity: null },
          select: { id: true }
        });
        const instanceIds = inheritedInstances.map((instance) => instance.id);
        if (instanceIds.length) {
          const counts = await args.context.prisma.classBooking.groupBy({
            by: ["classInstanceId"],
            where: { classInstanceId: { in: instanceIds }, status: "confirmed" },
            _count: { _all: true }
          });
          const highestConfirmed = counts.reduce((highest, row) => Math.max(highest, row._count._all), 0);
          if (nextCapacity < highestConfirmed) {
            args.addValidationError(`Capacity cannot be lower than the ${highestConfirmed} confirmed bookings on a class instance`);
          }
        }
      }
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: import_access43.denyAll,
      update: import_access43.denyAll,
      delete: import_access43.denyAll
    },
    filter: {
      query: rules.canReadClassSchedule,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "instructor", "dayOfWeek", "startTime", "endTime", "isActive"]
    }
  },
  fields: {
    organization: (0, import_fields26.relationship)({
      ref: "Organization.classSchedules",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    location: (0, import_fields26.relationship)({ ref: "Location" }),
    resource: (0, import_fields26.relationship)({ ref: "GymResource" }),
    name: (0, import_fields26.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the class (e.g., 'Morning Yoga', 'HIIT Blast')"
      }
    }),
    description: (0, import_fields26.text)({
      ui: {
        displayMode: "textarea",
        description: "Description of the class"
      }
    }),
    instructor: (0, import_fields26.relationship)({
      ref: "Instructor.classSchedules",
      ui: {
        displayMode: "select"
      }
    }),
    classType: (0, import_fields26.relationship)({
      ref: "ClassType.schedules",
      ui: {
        displayMode: "select",
        description: "Reusable class format for this recurring schedule"
      }
    }),
    dayOfWeek: (0, import_fields26.select)({
      type: "string",
      options: [
        { label: "Monday", value: "monday" },
        { label: "Tuesday", value: "tuesday" },
        { label: "Wednesday", value: "wednesday" },
        { label: "Thursday", value: "thursday" },
        { label: "Friday", value: "friday" },
        { label: "Saturday", value: "saturday" },
        { label: "Sunday", value: "sunday" }
      ],
      validation: { isRequired: true }
    }),
    startTime: (0, import_fields26.text)({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)"
      }
    }),
    endTime: (0, import_fields26.text)({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)"
      }
    }),
    maxCapacity: (0, import_fields26.integer)({
      access: { update: import_access43.denyAll },
      validation: { isRequired: true, min: 1, max: 1e4 },
      defaultValue: 20,
      ui: {
        description: "Maximum number of participants"
      }
    }),
    isActive: (0, import_fields26.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this class schedule is currently active"
      }
    }),
    // Relationship to specific instances
    instances: (0, import_fields26.relationship)({
      ref: "ClassInstance.classSchedule",
      many: true,
      access: { create: import_access43.denyAll, update: import_access43.denyAll }
    }),
    averageAttendance: (0, import_fields26.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core23.graphql.field({
        type: import_core23.graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const now = (/* @__PURE__ */ new Date()).toISOString();
          const [completedClasses, totalAttendance] = await Promise.all([
            sudoContext.query.ClassInstance.count({
              where: {
                classSchedule: { id: { equals: item.id.toString() } },
                date: { lte: now },
                isCancelled: { equals: false }
              }
            }),
            sudoContext.query.AttendanceRecord.count({
              where: {
                classSchedule: { id: { equals: item.id.toString() } },
                attended: { equals: true }
              }
            })
          ]);
          if (completedClasses === 0) return 0;
          return Math.round(totalAttendance / completedClasses * 10) / 10;
        }
      }),
      ui: { description: "Average number of attendees per class" }
    }),
    bookingRate: (0, import_fields26.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core23.graphql.field({
        type: import_core23.graphql.Float,
        async resolve(item, args, context) {
          const scheduleCapacity = item.maxCapacity;
          if (!scheduleCapacity) return 0;
          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: {
              classSchedule: { id: { equals: item.id.toString() } },
              isCancelled: { equals: false }
            },
            query: 'maxCapacity bookings(where: { status: { equals: "confirmed" } }) { id }'
          });
          if (instances.length === 0) return 0;
          const totalBooked = instances.reduce(
            (sum, inst) => sum + (inst.bookings?.length || 0),
            0
          );
          const totalCapacity = instances.reduce(
            (sum, instance) => sum + (instance.maxCapacity ?? scheduleCapacity),
            0
          );
          return totalCapacity > 0 ? Math.round(totalBooked / totalCapacity * 100) : 0;
        }
      }),
      ui: { description: "Booking rate as percentage of capacity" }
    }),
    totalRevenue: (0, import_fields26.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core23.graphql.field({
        type: import_core23.graphql.Float,
        async resolve() {
          return null;
        }
      }),
      ui: { description: "Unavailable until class-level pricing is modeled" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassBooking.ts
var import_core24 = require("@keystone-6/core");
var import_access45 = require("@keystone-6/core/access");
var import_fields27 = require("@keystone-6/core/fields");
var ClassBooking = (0, import_core24.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, classInstanceId, memberId, activeBookingKey") },
  hooks: {
    async validateInput(args) {
      bookingLifecycleHooks.validateInput(args);
      await validateTenantOwnership([
        { field: "classInstance", list: "classInstance", required: true },
        { field: "member", list: "member", required: true }
      ])(args);
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      // Booking state, capacity, credits, and waitlists are controlled only by custom mutations.
      create: import_access45.denyAll,
      update: import_access45.denyAll,
      delete: import_access45.denyAll
    },
    filter: {
      query: rules.canReadOwnBooking,
      update: rules.canReadOwnBooking,
      delete: rules.canReadOwnBooking
    }
  },
  ui: {
    listView: {
      initialColumns: ["classInstance", "member", "memberName", "status", "bookedAt"]
    }
  },
  fields: {
    organization: (0, import_fields27.relationship)({
      ref: "Organization.classBookings",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    // Link to specific class instance
    classInstance: (0, import_fields27.relationship)({
      ref: "ClassInstance.bookings",
      access: { update: import_access45.denyAll },
      ui: {
        displayMode: "select",
        description: "The class instance being booked"
      }
    }),
    // Link to member
    member: (0, import_fields27.relationship)({
      ref: "Member.bookings",
      access: { update: import_access45.denyAll },
      ui: {
        displayMode: "select",
        description: "The member who made the booking"
      }
    }),
    // Denormalized member info for quick access
    memberName: (0, import_fields27.text)({
      ui: {
        description: "Member's name at time of booking"
      }
    }),
    memberEmail: (0, import_fields27.text)({
      ui: {
        description: "Member's email at time of booking"
      }
    }),
    memberPhone: (0, import_fields27.text)({
      ui: {
        description: "Member's phone number"
      }
    }),
    eligibilityReviewReason: (0, import_fields27.text)({ access: { create: import_access45.denyAll, update: import_access45.denyAll } }),
    notes: (0, import_fields27.text)({
      ui: {
        displayMode: "textarea",
        description: "Special notes or requests for this booking"
      }
    }),
    activeBookingKey: (0, import_fields27.text)({
      db: { isNullable: true },
      access: { read: import_access45.denyAll, create: import_access45.denyAll, update: import_access45.denyAll }
    }),
    status: (0, import_fields27.select)({
      access: { update: import_access45.denyAll },
      type: "string",
      options: [
        { label: "Confirmed", value: "confirmed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Waitlist", value: "waitlist" }
      ],
      defaultValue: "confirmed",
      validation: { isRequired: true }
    }),
    waitlistPosition: (0, import_fields27.integer)({
      access: { update: import_access45.denyAll },
      ui: {
        description: "Position in waitlist (only applicable when status is 'waitlist')"
      }
    }),
    bookedAt: (0, import_fields27.timestamp)({
      access: { update: import_access45.denyAll },
      validation: { isRequired: true },
      defaultValue: { kind: "now" }
    }),
    cancelledAt: (0, import_fields27.timestamp)({
      access: { update: import_access45.denyAll },
      ui: {
        description: "When the booking was cancelled"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Instructor.ts
var import_core25 = require("@keystone-6/core");
var import_access47 = require("@keystone-6/core/access");
var import_fields28 = require("@keystone-6/core/fields");
var import_fields_document3 = require("@keystone-6/fields-document");

// features/keystone/mutations/gymSettingsLifecycle.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// lib/timezone.ts
function normalizeTimeZone(value, fallback = "UTC") {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(/* @__PURE__ */ new Date());
    return candidate;
  } catch {
    throw new Error("timezone must be a valid IANA time-zone name");
  }
}
function resolveGymTimeZone(gymSettingsTimeZone, organizationTimeZone) {
  return normalizeTimeZone(gymSettingsTimeZone || organizationTimeZone || "UTC");
}
function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}
function timeZoneOffsetMilliseconds(date, timeZone) {
  const parts = localDateParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(date.getTime() / 1e3) * 1e3;
}
function localTimeToUtc(parts, timeZone) {
  const localEpoch = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );
  let candidate = new Date(localEpoch);
  candidate = new Date(localEpoch - timeZoneOffsetMilliseconds(candidate, timeZone));
  candidate = new Date(localEpoch - timeZoneOffsetMilliseconds(candidate, timeZone));
  return candidate;
}
function zonedStartOfDay(date, timeZone) {
  const local = localDateParts(date, timeZone);
  return localTimeToUtc({ ...local, hour: 0, minute: 0, second: 0 }, timeZone);
}
function zonedStartOfNextDay(date, timeZone) {
  const local = localDateParts(date, timeZone);
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return localTimeToUtc({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0
  }, timeZone);
}
function zonedStartOfMonth(date, timeZone) {
  const local = localDateParts(date, timeZone);
  return localTimeToUtc({ year: local.year, month: local.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
}
function localWeekdayAtOffset(now, timeZone, dayOffset) {
  const local = localDateParts(now, timeZone);
  return new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset)).getUTCDay();
}
function futureLocalOccurrence(now, timeZone, dayOffset, hour, minute2) {
  const local = localDateParts(now, timeZone);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  return localTimeToUtc({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate(),
    hour,
    minute: minute2,
    second: 0
  }, timeZone);
}

// features/keystone/mutations/gymSettingsLifecycle.ts
var STRING_LIMITS = {
  name: 200,
  tagline: 300,
  description: 2e3,
  address: 500,
  phone: 50,
  email: 320,
  locale: 20,
  timezone: 100,
  heroEyebrow: 200,
  heroHeadline: 1e3,
  heroSubheadline: 2e3,
  heroImageUrl: 500,
  heroPrimaryCtaLabel: 100,
  heroPrimaryCtaHref: 500,
  heroSecondaryCtaLabel: 100,
  heroSecondaryCtaHref: 500,
  promoBanner: 500,
  footerTagline: 500,
  copyrightName: 200,
  facilityHeadline: 300,
  facilityDescription: 2e3
};
var JSON_FIELDS = ["hours", "facilityHighlights", "heroStats", "contactTopics"];
var INTERNAL_HREF_FIELDS = ["heroPrimaryCtaHref", "heroSecondaryCtaHref"];
var MAX_JSON_LENGTH = 2e4;
function normalizeOnboardingMediaPath(value) {
  if (typeof value !== "string") throw new Error("Media must use a local /images path");
  const path = value.trim();
  if (!path) return "";
  if (!path.startsWith("/images/") || path.startsWith("//") || path.includes("..") || path.includes("?") || path.includes("#") || path.includes("\\")) {
    throw new Error("Media must use a local /images path without traversal or URL parameters");
  }
  if (!(0, import_node_fs.existsSync)((0, import_node_path.join)(process.cwd(), "public", path.slice(1)))) {
    throw new Error("Media must reference an existing local /images asset");
  }
  return path;
}
function normalizeInternalHref(value, field) {
  if (typeof value !== "string") throw new Error(`${field} must be an internal path`);
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.includes("..")) {
    throw new Error(`${field} must be an internal path`);
  }
  return href;
}
function normalizeJson(value, field) {
  const serialized = JSON.stringify(value);
  if (serialized === void 0 || serialized.length > MAX_JSON_LENGTH) {
    throw new Error(`${field} is too large or invalid`);
  }
  return JSON.parse(serialized);
}
function normalizeGymSettingsInput(input) {
  const output = {};
  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    if (!(field in input) || input[field] == null) continue;
    if (typeof input[field] !== "string") throw new Error(`${field} must be a string`);
    const value = input[field].trim();
    if (field === "name" && !value) throw new Error("name is required");
    if (value.length > limit) throw new Error(`${field} is too long`);
    output[field] = value;
  }
  if ("timezone" in input && input.timezone != null) {
    output.timezone = normalizeTimeZone(input.timezone);
  }
  if ("currencyCode" in input && input.currencyCode != null) {
    const value = String(input.currencyCode).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) throw new Error("currencyCode must be a three-letter code");
    output.currencyCode = value;
  }
  if ("countryCode" in input && input.countryCode != null) {
    const value = String(input.countryCode).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) throw new Error("countryCode must be a two-letter code");
    output.countryCode = value;
  }
  if ("heroImageUrl" in input && input.heroImageUrl != null) {
    output.heroImageUrl = normalizeOnboardingMediaPath(input.heroImageUrl);
  }
  if ("logoIcon" in input && input.logoIcon != null) {
    if (typeof input.logoIcon !== "string") throw new Error("logoIcon must be a string");
    const submitted = input.logoIcon.trim();
    const sanitized = sanitizeGymLogoSvg(submitted);
    if (submitted && !sanitized) throw new Error("logoIcon must be a valid, safe SVG document");
    output.logoIcon = sanitized;
  }
  if ("brandHue" in input && input.brandHue != null) {
    output.brandHue = normalizeStorefrontHue(input.brandHue);
  }
  for (const field of INTERNAL_HREF_FIELDS) {
    if (field in input && input[field] != null) output[field] = normalizeInternalHref(input[field], field);
  }
  for (const field of JSON_FIELDS) {
    if (!(field in input) || input[field] == null) continue;
    if (field === "hours") {
      if (typeof input[field] !== "object" || Array.isArray(input[field])) {
        throw new Error("hours must be an object");
      }
    } else if (!Array.isArray(input[field])) {
      throw new Error(`${field} must be an array`);
    }
    output[field] = normalizeJson(input[field], field);
  }
  if ("rating" in input) {
    const value = input.rating;
    if (value == null || value === "") output.rating = null;
    else {
      const rating = Number(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw new Error("rating must be between 0 and 5");
      output.rating = rating.toFixed(1);
    }
  }
  if ("reviewCount" in input && input.reviewCount != null) {
    const count = Number(input.reviewCount);
    if (!Number.isInteger(count) || count < 0 || count > 1e6) {
      throw new Error("reviewCount must be a non-negative integer");
    }
    output.reviewCount = count;
  }
  return output;
}
async function upsertGymSettings(root, { data }, context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId || !(session.data?.role?.canManageOnboarding || session.data?.role?.canManageSettings)) {
    throw new Error("Gym settings management permission required");
  }
  const normalized = normalizeGymSettingsInput(data);
  const existing = await context.sudo().query.GymSettings.findMany({
    where: { organization: { id: { equals: organizationId } } },
    take: 2,
    orderBy: [{ createdAt: "asc" }],
    query: "id"
  });
  if (existing.length > 1) throw new Error("Gym settings singleton invariant is violated");
  if (!existing[0] && (!normalized.name || !normalized.heroImageUrl)) {
    throw new Error("Initial gym settings require a business name and canonical hero image");
  }
  if (existing[0]) {
    return context.sudo().db.GymSettings.updateOne({
      where: { id: existing[0].id },
      data: normalized
    });
  }
  return context.sudo().db.GymSettings.createOne({
    data: {
      ...normalized,
      organization: { connect: { id: organizationId } }
    }
  });
}

// features/keystone/models/Instructor.ts
var Instructor = (0, import_core25.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "user", list: "user" }
      ])(args);
      const { resolvedData, addValidationError } = args;
      if (resolvedData.photo === void 0) return;
      try {
        resolvedData.photo = normalizeOnboardingMediaPath(resolvedData.photo);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords
    },
    filter: {
      query: rules.canReadInstructor,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["user", "specialties", "isActive"]
    },
    labelField: "user"
  },
  fields: {
    organization: (0, import_fields28.relationship)({
      ref: "Organization.instructors",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
      ui: { description: "Tenant organization for this instructor" }
    }),
    // Link to User account
    user: (0, import_fields28.relationship)({
      ref: "User",
      access: { read: permissions.canManageAllRecords, update: import_access47.denyAll },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        displayMode: "select",
        description: "The user account for this instructor"
      }
    }),
    bio: (0, import_fields_document3.document)({
      formatting: true,
      links: true
    }),
    // JSON array of specialties
    specialties: (0, import_fields28.json)({
      defaultValue: [],
      ui: {
        description: "Array of specialties (e.g., ['yoga', 'pilates', 'strength'])"
      }
    }),
    // JSON array of certifications
    certifications: (0, import_fields28.json)({
      defaultValue: [],
      ui: {
        description: "Array of certifications (e.g., ['ACE', 'NASM', 'RYT-200'])"
      }
    }),
    photo: (0, import_fields28.text)({
      access: { create: permissions.canManageOnboarding, update: import_access47.denyAll },
      ui: {
        description: "URL to instructor's photo"
      }
    }),
    isActive: (0, import_fields28.checkbox)({
      defaultValue: true,
      ui: {
        description: "Whether this instructor is currently active"
      }
    }),
    // Relationships
    classSchedules: (0, import_fields28.relationship)({
      ref: "ClassSchedule.instructor",
      many: true,
      access: { create: import_access47.denyAll, update: import_access47.denyAll }
    }),
    classInstances: (0, import_fields28.relationship)({
      ref: "ClassInstance.instructor",
      many: true,
      access: { create: import_access47.denyAll, update: import_access47.denyAll }
    }),
    availability: (0, import_fields28.relationship)({
      ref: "TrainerAvailability.instructor",
      many: true,
      access: { create: import_access47.denyAll, update: import_access47.denyAll }
    }),
    appointments: (0, import_fields28.relationship)({
      ref: "TrainerAppointment.instructor",
      many: true,
      access: { create: import_access47.denyAll, update: import_access47.denyAll }
    }),
    displayName: (0, import_fields28.virtual)({
      access: { read: isSignedIn },
      field: import_core25.graphql.field({
        type: import_core25.graphql.String,
        async resolve(item, args, context) {
          const instructor = await context.sudo().query.Instructor.findOne({
            where: { id: item.id.toString() },
            query: "user { name }"
          });
          return instructor?.user?.name ?? "Coach";
        }
      }),
      ui: { description: "Public instructor display name" }
    }),
    totalClassesTaught: (0, import_fields28.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core25.graphql.field({
        type: import_core25.graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: (/* @__PURE__ */ new Date()).toISOString() },
              isCancelled: { equals: false }
            }
          });
          return count;
        }
      }),
      ui: { description: "Total number of classes taught" }
    }),
    averageRating: (0, import_fields28.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core25.graphql.field({
        type: import_core25.graphql.Float,
        async resolve() {
          return null;
        }
      }),
      ui: { description: "Unavailable until member ratings are modeled" }
    }),
    totalRevenue: (0, import_fields28.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core25.graphql.field({
        type: import_core25.graphql.Float,
        async resolve() {
          return null;
        }
      }),
      ui: { description: "Unavailable until instructor pricing is modeled" }
    }),
    upcomingClasses: (0, import_fields28.virtual)({
      access: { read: permissions.canManageAllRecords },
      field: import_core25.graphql.field({
        type: import_core25.graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { gte: (/* @__PURE__ */ new Date()).toISOString() },
              isCancelled: { equals: false }
            }
          });
          return count;
        }
      }),
      ui: { description: "Number of upcoming scheduled classes" }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ClassInstance.ts
var import_core26 = require("@keystone-6/core");
var import_access49 = require("@keystone-6/core/access");
var import_fields29 = require("@keystone-6/core/fields");
var validateClassInstanceTenant = validateTenantOwnership([
  { field: "classSchedule", list: "classSchedule", required: true },
  { field: "instructor", list: "instructor" }
]);
var ClassInstance = (0, import_core26.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, classScheduleId, date") },
  hooks: {
    async validateInput(args) {
      await validateClassInstanceTenant(args);
      const nextCapacity = args.resolvedData.maxCapacity;
      if (args.operation === "update" && typeof nextCapacity === "number" && args.item?.id) {
        const confirmed = await args.context.prisma.classBooking.count({
          where: { classInstanceId: args.item.id, status: "confirmed" }
        });
        if (nextCapacity < confirmed) {
          args.addValidationError(`Capacity cannot be lower than the ${confirmed} confirmed bookings`);
        }
      }
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: import_access49.denyAll,
      update: import_access49.denyAll,
      delete: import_access49.denyAll
    },
    filter: {
      query: rules.canReadClassInstance,
      update: tenantFilter,
      delete: tenantFilter
    }
  },
  ui: {
    listView: {
      initialColumns: ["classSchedule", "date", "instructor", "isCancelled"]
    }
  },
  fields: {
    organization: (0, import_fields29.relationship)({
      ref: "Organization.classInstances",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    location: (0, import_fields29.relationship)({ ref: "Location" }),
    resource: (0, import_fields29.relationship)({ ref: "GymResource" }),
    endsAt: (0, import_fields29.timestamp)(),
    changeHistory: (0, import_fields29.json)({ defaultValue: [] }),
    occurrenceKey: (0, import_fields29.text)({ isIndexed: "unique", db: { isNullable: true } }),
    // Reference to the recurring schedule
    classSchedule: (0, import_fields29.relationship)({
      ref: "ClassSchedule.instances",
      ui: {
        displayMode: "select"
      }
    }),
    // Specific date for this instance
    date: (0, import_fields29.timestamp)({
      validation: { isRequired: true },
      ui: {
        description: "Specific date and time of this class occurrence"
      }
    }),
    // Override instructor for this specific instance (if different from schedule)
    instructor: (0, import_fields29.relationship)({
      ref: "Instructor.classInstances",
      ui: {
        displayMode: "select",
        description: "Override instructor (leave empty to use schedule default)"
      }
    }),
    // Override capacity for this specific instance
    maxCapacity: (0, import_fields29.integer)({
      access: { update: import_access49.denyAll },
      validation: { min: 1, max: 1e4 },
      ui: {
        description: "Override max capacity (leave empty to use schedule default)"
      }
    }),
    isCancelled: (0, import_fields29.checkbox)({
      access: { update: import_access49.denyAll },
      defaultValue: false,
      ui: {
        description: "Whether this class instance has been cancelled"
      }
    }),
    cancellationReason: (0, import_fields29.text)({
      access: { read: permissions.canManageAllRecords, update: import_access49.denyAll },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation (if cancelled)"
      }
    }),
    // Bookings for this specific instance
    bookings: (0, import_fields29.relationship)({
      ref: "ClassBooking.classInstance",
      access: {
        read: permissions.canManageAllRecords,
        create: import_access49.denyAll,
        update: import_access49.denyAll
      },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/GymResource.ts
var import_core27 = require("@keystone-6/core");
var import_access51 = require("@keystone-6/core/access");
var import_fields30 = require("@keystone-6/core/fields");
var canManageFacilities = (args) => canManageTenant(args, "canManageFacilities");
var tenantItem2 = (args) => tenantItemAccess(args);
var GymResource = (0, import_core27.list)({
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([{ field: "location", list: "location", required: true }])(args);
      if (!args.item) return;
      const protectedFields = ["location", "capacity", "isExclusive", "isActive", "setupBufferMinutes", "cleanupBufferMinutes"];
      if (!protectedFields.some((field) => args.resolvedData[field] !== void 0)) return;
      for (const field of protectedFields) if (args.resolvedData[field] !== void 0) {
        const current = field === "location" ? args.item.locationId : args.item[field];
        if (args.resolvedData[field] !== current) args.addValidationError("Resource allocation settings are immutable; create a replacement resource and explicitly reassign future services");
      }
    }
  },
  access: {
    operation: {
      query: canManageFacilities,
      create: canManageFacilities,
      update: canManageFacilities,
      delete: import_access51.denyAll
    },
    filter: { query: tenantFilter },
    item: { update: tenantItem2, delete: tenantItem2 }
  },
  ui: {
    labelField: "name",
    listView: { initialColumns: ["name", "type", "location", "capacity", "isActive"] }
  },
  fields: {
    organization: (0, import_fields30.relationship)({
      ref: "Organization.resources",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    location: (0, import_fields30.relationship)({
      ref: "Location.resources",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") }
    }),
    name: (0, import_fields30.text)({ validation: { isRequired: true } }),
    type: (0, import_fields30.select)({
      type: "enum",
      options: [
        { label: "Training room", value: "room" },
        { label: "Court", value: "court" },
        { label: "Lane", value: "lane" },
        { label: "Equipment", value: "equipment" },
        { label: "Recovery station", value: "recovery" },
        { label: "Other", value: "other" }
      ],
      defaultValue: "room",
      validation: { isRequired: true }
    }),
    capacity: (0, import_fields30.integer)({ defaultValue: 1, validation: { min: 1, max: 500 } }),
    isExclusive: (0, import_fields30.checkbox)({ defaultValue: true }),
    isActive: (0, import_fields30.checkbox)({ defaultValue: true }),
    setupBufferMinutes: (0, import_fields30.integer)({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    cleanupBufferMinutes: (0, import_fields30.integer)({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    notes: (0, import_fields30.text)({ ui: { displayMode: "textarea" } }),
    metadata: (0, import_fields30.json)({ defaultValue: {} }),
    appointments: (0, import_fields30.relationship)({
      ref: "TrainerAppointment.resource",
      many: true,
      access: { create: import_access51.denyAll, update: import_access51.denyAll }
    }),
    ...trackingFields
  }
});

// features/keystone/models/TrainerAvailability.ts
var import_access52 = require("@keystone-6/core/access");
var import_core28 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
var canManageAppointments = (args) => canManageTenant(args, "canManageAppointments");
var tenantItem3 = (args) => tenantItemAccess(args);
function canReadTrainerAvailability({ session }) {
  if (canManageAppointments({ session })) return tenantFilter({ session });
  if (session?.data?.role?.isInstructor) {
    return tenantFilter({ session }, { instructor: { user: { id: { equals: session.itemId } } } });
  }
  return false;
}
var TrainerAvailability = (0, import_core28.list)({
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "instructor", list: "instructor", required: true },
      { field: "location", list: "location", required: true }
    ])
  },
  access: {
    operation: {
      query: ({ session }) => Boolean(session),
      create: import_access52.denyAll,
      update: import_access52.denyAll,
      delete: import_access52.denyAll
    },
    filter: { query: canReadTrainerAvailability },
    item: { update: tenantItem3, delete: tenantItem3 }
  },
  ui: {
    listView: { initialColumns: ["instructor", "type", "dayOfWeek", "startTime", "endTime", "isAvailable"] }
  },
  fields: {
    organization: (0, import_fields31.relationship)({
      ref: "Organization.trainerAvailability",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    instructor: (0, import_fields31.relationship)({
      ref: "Instructor.availability",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("instructor") }
    }),
    location: (0, import_fields31.relationship)({
      ref: "Location.trainerAvailability",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") }
    }),
    type: (0, import_fields31.select)({
      type: "enum",
      options: [
        { label: "Recurring", value: "recurring" },
        { label: "One time", value: "one_time" },
        { label: "Time off", value: "time_off" }
      ],
      defaultValue: "recurring",
      validation: { isRequired: true }
    }),
    dayOfWeek: (0, import_fields31.integer)({ validation: { min: 0, max: 6 } }),
    date: (0, import_fields31.timestamp)(),
    startTime: (0, import_fields31.text)({ validation: { isRequired: true } }),
    endTime: (0, import_fields31.text)({ validation: { isRequired: true } }),
    effectiveFrom: (0, import_fields31.timestamp)(),
    effectiveTo: (0, import_fields31.timestamp)(),
    isAvailable: (0, import_fields31.checkbox)({ defaultValue: true }),
    reason: (0, import_fields31.text)({ ui: { displayMode: "textarea" } }),
    ...trackingFields
  }
});

// features/keystone/models/TrainerAppointment.ts
var import_core29 = require("@keystone-6/core");
var import_access53 = require("@keystone-6/core/access");
var import_fields32 = require("@keystone-6/core/fields");
function canReadAppointment({ session }) {
  if (canManageTenant({ session }, "canManageAppointments")) {
    return tenantFilter({ session });
  }
  return tenantFilter(
    { session },
    {
      OR: [
        { member: { user: { id: { equals: session?.itemId } } } },
        { instructor: { user: { id: { equals: session?.itemId } } } }
      ]
    }
  );
}
var TrainerAppointment = (0, import_core29.list)({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, idempotencyKey], map: "TrainerAppointment_organization_idempotency_key")\n}'
      );
    }
  },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "member", list: "member", required: true },
        { field: "instructor", list: "instructor", required: true },
        { field: "location", list: "location", required: true },
        { field: "resource", list: "gymResource" }
      ])(args);
      await validateResourceLocation(args);
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: import_access53.denyAll,
      update: import_access53.denyAll,
      delete: import_access53.denyAll
    },
    filter: { query: canReadAppointment }
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: { initialColumns: ["startTime", "member", "instructor", "location", "status"] }
  },
  fields: {
    organization: (0, import_fields32.relationship)({
      ref: "Organization.appointments",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    member: (0, import_fields32.relationship)({
      ref: "Member.trainerAppointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("member") }
    }),
    instructor: (0, import_fields32.relationship)({
      ref: "Instructor.appointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("instructor") }
    }),
    location: (0, import_fields32.relationship)({
      ref: "Location.trainerAppointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") }
    }),
    resource: (0, import_fields32.relationship)({ ref: "GymResource.appointments" }),
    startTime: (0, import_fields32.timestamp)({ validation: { isRequired: true } }),
    endTime: (0, import_fields32.timestamp)({ validation: { isRequired: true } }),
    durationMinutes: (0, import_fields32.integer)({ validation: { isRequired: true, min: 15, max: 480 } }),
    status: (0, import_fields32.select)({
      type: "enum",
      options: [
        { label: "Scheduled", value: "scheduled" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Checked in", value: "checked_in" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No show", value: "no_show" }
      ],
      defaultValue: "scheduled",
      validation: { isRequired: true }
    }),
    serviceName: (0, import_fields32.text)({ validation: { isRequired: true } }),
    priceAmount: (0, import_fields32.integer)({ defaultValue: 0, validation: { min: 0 } }),
    currencyCode: (0, import_fields32.text)({ defaultValue: "USD", validation: { isRequired: true } }),
    idempotencyKey: (0, import_fields32.text)({
      isIndexed: true,
      access: { update: () => false },
      validation: { isRequired: true }
    }),
    requestHash: (0, import_fields32.text)({
      access: { update: () => false },
      validation: { isRequired: true }
    }),
    memberNotes: (0, import_fields32.text)({ ui: { displayMode: "textarea" } }),
    internalNotes: (0, import_fields32.text)({
      access: { read: permissions.canManageAllRecords },
      ui: { displayMode: "textarea" }
    }),
    cancellationReason: (0, import_fields32.text)({ ui: { displayMode: "textarea" } }),
    cancelledAt: (0, import_fields32.timestamp)(),
    checkedInAt: (0, import_fields32.timestamp)(),
    completedAt: (0, import_fields32.timestamp)(),
    payment: (0, import_fields32.relationship)({ ref: "GymPayment" }),
    trainingPackage: (0, import_fields32.relationship)({ ref: "TrainingPackage" }),
    replacesAppointment: (0, import_fields32.relationship)({ ref: "TrainerAppointment" }),
    resourceStartsAt: (0, import_fields32.timestamp)(),
    resourceEndsAt: (0, import_fields32.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/OnboardingRun.ts
var import_core30 = require("@keystone-6/core");
var import_access55 = require("@keystone-6/core/access");
var import_fields33 = require("@keystone-6/core/fields");
var OnboardingRun = (0, import_core30.list)({
  access: {
    operation: { query: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll, delete: import_access55.denyAll }
  },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId], map: "OnboardingRun_organization_key")\n}'
      );
    }
  },
  fields: {
    organization: (0, import_fields33.relationship)({
      ref: "Organization.onboardingRuns",
      access: { update: import_access55.denyAll },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    status: (0, import_fields33.select)({
      type: "string",
      options: [
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "running",
      validation: { isRequired: true },
      access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll }
    }),
    attempts: (0, import_fields33.integer)({ defaultValue: 0, access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    lastError: (0, import_fields33.text)({ defaultValue: "", access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    startedAt: (0, import_fields33.timestamp)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    completedAt: (0, import_fields33.timestamp)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    leaseUntil: (0, import_fields33.timestamp)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    leaseToken: (0, import_fields33.text)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } })
  }
});

// features/keystone/models/GymRefundAttempt.ts
var import_core31 = require("@keystone-6/core");
var import_access56 = require("@keystone-6/core/access");
var import_fields34 = require("@keystone-6/core/fields");
var GymRefundAttempt = (0, import_core31.list)({
  access: { operation: { query: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll, delete: import_access56.denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(/\n}/, '\n  @@unique([organizationId, requestKey], map: "GymRefundAttempt_organization_request_key")\n}');
    }
  },
  fields: {
    organization: (0, import_fields34.relationship)({ ref: "Organization.refundAttempts", access: { update: import_access56.denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    payment: (0, import_fields34.relationship)({ ref: "GymPayment.refundAttempts", access: { update: import_access56.denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("payment") } }),
    requestKey: (0, import_fields34.text)({ validation: { isRequired: true }, access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    claimToken: (0, import_fields34.text)({ defaultValue: "", access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    amount: (0, import_fields34.integer)({ validation: { isRequired: true }, access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    startingRefundAmount: (0, import_fields34.integer)({ defaultValue: 0, validation: { isRequired: true }, access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    status: (0, import_fields34.select)({ type: "string", options: [{ label: "Processing", value: "processing" }, { label: "Succeeded", value: "succeeded" }, { label: "Failed", value: "failed" }], defaultValue: "processing", access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    providerRefundId: (0, import_fields34.text)({ defaultValue: "", access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    lastError: (0, import_fields34.text)({ defaultValue: "", access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    requestedAt: (0, import_fields34.timestamp)({ access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    completedAt: (0, import_fields34.timestamp)({ access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } })
  }
});

// features/keystone/models/MembershipBillingAttempt.ts
var import_core32 = require("@keystone-6/core");
var import_access57 = require("@keystone-6/core/access");
var import_fields35 = require("@keystone-6/core/fields");
var MembershipBillingAttempt = (0, import_core32.list)({
  access: { operation: { query: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll, delete: import_access57.denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, membershipId, operation, idempotencyKey], map: "MembershipBillingAttempt_scope_operation_key")\n  @@index([membershipId, status, leaseUntil], map: "MembershipBillingAttempt_membership_status_lease")\n}'
      );
    }
  },
  fields: {
    organization: (0, import_fields35.relationship)({
      ref: "Organization.membershipBillingAttempts",
      access: { update: import_access57.denyAll },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    membership: (0, import_fields35.relationship)({
      ref: "Membership.billingAttempts",
      access: { update: import_access57.denyAll },
      db: { extendPrismaSchema: requiredRelationshipDb("membership") }
    }),
    operation: (0, import_fields35.select)({
      type: "string",
      options: [
        { label: "Cancel", value: "cancel" },
        { label: "Freeze", value: "freeze" },
        { label: "Unfreeze", value: "unfreeze" },
        { label: "Tier change", value: "tier-change" }
      ],
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    idempotencyKey: (0, import_fields35.text)({
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    requestHash: (0, import_fields35.text)({
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    claimToken: (0, import_fields35.text)({
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    generation: (0, import_fields35.integer)({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    status: (0, import_fields35.select)({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    leaseUntil: (0, import_fields35.timestamp)({ access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll } }),
    lastError: (0, import_fields35.text)({
      defaultValue: "",
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    requestedAt: (0, import_fields35.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll }
    }),
    completedAt: (0, import_fields35.timestamp)({ access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll } })
  }
});

// features/keystone/models/AuthRateLimitBucket.ts
var import_core33 = require("@keystone-6/core");
var import_access58 = require("@keystone-6/core/access");
var import_fields36 = require("@keystone-6/core/fields");
var AuthRateLimitBucket = (0, import_core33.list)({
  access: { operation: { query: import_access58.denyAll, create: import_access58.denyAll, update: import_access58.denyAll, delete: import_access58.denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(/(\skey\s+String)\s+@default\(""\)/, "$1").replace(/(\scount\s+)Int\?(\s+@default\(0\))/, "$1Int$2").replace(/\n}/, '\n  @@unique([key], map: "AuthRateLimitBucket_key")\n}');
    }
  },
  fields: {
    key: (0, import_fields36.text)({ validation: { isRequired: true }, access: { read: import_access58.denyAll, create: import_access58.denyAll, update: import_access58.denyAll } }),
    count: (0, import_fields36.integer)({ defaultValue: 0, access: { read: import_access58.denyAll, create: import_access58.denyAll, update: import_access58.denyAll } }),
    resetAt: (0, import_fields36.timestamp)({ access: { read: import_access58.denyAll, create: import_access58.denyAll, update: import_access58.denyAll } })
  }
});

// features/keystone/models/Operations.ts
var import_core34 = require("@keystone-6/core");
var import_fields37 = require("@keystone-6/core/fields");
var access = {
  operation: { query: permissions.canManageAllRecords, create: () => false, update: () => false, delete: () => false },
  filter: { query: tenantFilter }
};
var organization = () => (0, import_fields37.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } });
var OperationalNotice = (0, import_core34.list)({ access, fields: {
  organization: organization(),
  member: (0, import_fields37.relationship)({ ref: "Member" }),
  key: (0, import_fields37.text)({ isIndexed: "unique" }),
  kind: (0, import_fields37.text)(),
  message: (0, import_fields37.text)(),
  status: (0, import_fields37.text)({ defaultValue: "pending" }),
  attempts: (0, import_fields37.integer)({ defaultValue: 0 }),
  lastError: (0, import_fields37.text)(),
  resolvedAt: (0, import_fields37.timestamp)(),
  history: (0, import_fields37.json)({ defaultValue: [] }),
  ...trackingFields
} });
var ParticipationPolicy = (0, import_core34.list)({ access, fields: {
  organization: organization(),
  version: (0, import_fields37.text)(),
  documentReference: (0, import_fields37.text)(),
  enforceWaiver: (0, import_fields37.checkbox)({ defaultValue: true }),
  adultOnly: (0, import_fields37.checkbox)({ defaultValue: true }),
  healthPurpose: (0, import_fields37.text)(),
  retentionDays: (0, import_fields37.integer)({ defaultValue: 365 }),
  publishedBy: (0, import_fields37.text)(),
  ...trackingFields
} });
var ParticipationEvidence = (0, import_core34.list)({ access, fields: {
  organization: organization(),
  member: (0, import_fields37.relationship)({ ref: "Member" }),
  policy: (0, import_fields37.relationship)({ ref: "ParticipationPolicy" }),
  key: (0, import_fields37.text)({ isIndexed: "unique" }),
  requestHash: (0, import_fields37.text)(),
  documentReference: (0, import_fields37.text)(),
  verifiedBy: (0, import_fields37.text)(),
  acceptedAt: (0, import_fields37.timestamp)(),
  expiresAt: (0, import_fields37.timestamp)(),
  revokedAt: (0, import_fields37.timestamp)(),
  revocationReason: (0, import_fields37.text)(),
  healthConsent: (0, import_fields37.checkbox)({ defaultValue: false }),
  ...trackingFields
} });
var OperationsCase = (0, import_core34.list)({ access, fields: {
  organization: organization(),
  member: (0, import_fields37.relationship)({ ref: "Member" }),
  key: (0, import_fields37.text)({ isIndexed: "unique" }),
  requestHash: (0, import_fields37.text)(),
  kind: (0, import_fields37.text)(),
  reference: (0, import_fields37.text)(),
  locationId: (0, import_fields37.text)(),
  summary: (0, import_fields37.text)(),
  status: (0, import_fields37.text)({ defaultValue: "open" }),
  assignedTo: (0, import_fields37.text)(),
  history: (0, import_fields37.json)({ defaultValue: [] }),
  openedBy: (0, import_fields37.text)(),
  closedAt: (0, import_fields37.timestamp)(),
  ...trackingFields
} });
var IntegrationCredential = (0, import_core34.list)({ access, fields: {
  organization: organization(),
  label: (0, import_fields37.text)(),
  digest: (0, import_fields37.text)({ isIndexed: "unique", access: { read: () => false } }),
  scopes: (0, import_fields37.json)({ defaultValue: [] }),
  partner: (0, import_fields37.text)(),
  revokedAt: (0, import_fields37.timestamp)(),
  expiresAt: (0, import_fields37.timestamp)(),
  createdBy: (0, import_fields37.text)(),
  ...trackingFields
} });

// features/keystone/models/MembershipCreditGrant.ts
var import_core35 = require("@keystone-6/core");
var import_access60 = require("@keystone-6/core/access");
var import_fields38 = require("@keystone-6/core/fields");
var MembershipCreditGrant = (0, import_core35.list)({
  access: { operation: { query: permissions.canManageAllRecords, create: import_access60.denyAll, update: import_access60.denyAll, delete: import_access60.denyAll }, filter: { query: tenantFilter } },
  fields: {
    organization: (0, import_fields38.relationship)({ ref: "Organization" }),
    key: (0, import_fields38.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    membership: (0, import_fields38.relationship)({ ref: "Membership" }),
    periodStart: (0, import_fields38.timestamp)({ validation: { isRequired: true } }),
    periodEnd: (0, import_fields38.timestamp)({ validation: { isRequired: true } }),
    allowance: (0, import_fields38.integer)({ validation: { isRequired: true } }),
    remaining: (0, import_fields38.integer)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/MembershipCreditEntry.ts
var import_core36 = require("@keystone-6/core");
var import_access62 = require("@keystone-6/core/access");
var import_fields39 = require("@keystone-6/core/fields");
var MembershipCreditEntry = (0, import_core36.list)({
  access: { operation: { query: permissions.canManageAllRecords, create: import_access62.denyAll, update: import_access62.denyAll, delete: import_access62.denyAll }, filter: { query: tenantFilter } },
  fields: {
    organization: (0, import_fields39.relationship)({ ref: "Organization" }),
    key: (0, import_fields39.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    grant: (0, import_fields39.relationship)({ ref: "MembershipCreditGrant" }),
    booking: (0, import_fields39.relationship)({ ref: "ClassBooking" }),
    delta: (0, import_fields39.integer)({ validation: { isRequired: true } }),
    kind: (0, import_fields39.text)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/TrainingPackage.ts
var import_core37 = require("@keystone-6/core");
var import_access64 = require("@keystone-6/core/access");
var import_fields40 = require("@keystone-6/core/fields");
var TrainingPackage = (0, import_core37.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, purchaseReference") },
  access: {
    operation: { query: isSignedIn, create: import_access64.denyAll, update: import_access64.denyAll, delete: import_access64.denyAll },
    filter: { query: ({ session }) => tenantFilter({ session }, canManageTenant({ session }, "canManageAppointments") ? void 0 : { member: { user: { id: { equals: session?.itemId } } } }) }
  },
  fields: {
    organization: (0, import_fields40.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: (0, import_fields40.relationship)({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    location: (0, import_fields40.relationship)({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } }),
    serviceName: (0, import_fields40.text)({ validation: { isRequired: true } }),
    durationMinutes: (0, import_fields40.integer)({ validation: { isRequired: true, min: 15, max: 480 } }),
    totalCredits: (0, import_fields40.integer)({ validation: { isRequired: true, min: 1, max: 1e3 } }),
    creditsRemaining: (0, import_fields40.integer)({ validation: { isRequired: true, min: 0 } }),
    amount: (0, import_fields40.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields40.text)({ defaultValue: "USD" }),
    purchaseReference: (0, import_fields40.text)({ validation: { isRequired: true } }),
    purchasedAt: (0, import_fields40.timestamp)({ validation: { isRequired: true } }),
    expiresAt: (0, import_fields40.timestamp)({ validation: { isRequired: true } }),
    recordedBy: (0, import_fields40.relationship)({ ref: "User" }),
    status: (0, import_fields40.select)({ options: ["active", "refunded"], defaultValue: "active", validation: { isRequired: true } }),
    refundAmount: (0, import_fields40.integer)({ defaultValue: 0 }),
    refundReference: (0, import_fields40.text)(),
    refundedAt: (0, import_fields40.timestamp)(),
    terms: (0, import_fields40.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/TrainingCreditEntry.ts
var import_core38 = require("@keystone-6/core");
var import_access66 = require("@keystone-6/core/access");
var import_fields41 = require("@keystone-6/core/fields");
var TrainingCreditEntry = (0, import_core38.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  access: {
    operation: { query: isSignedIn, create: import_access66.denyAll, update: import_access66.denyAll, delete: import_access66.denyAll },
    filter: { query: ({ session }) => tenantFilter({ session }, canManageTenant({ session }, "canManageAppointments") ? void 0 : { trainingPackage: { member: { user: { id: { equals: session?.itemId } } } } }) }
  },
  fields: {
    organization: (0, import_fields41.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    trainingPackage: (0, import_fields41.relationship)({ ref: "TrainingPackage", db: { extendPrismaSchema: requiredRelationshipDb("trainingPackage") } }),
    appointment: (0, import_fields41.relationship)({ ref: "TrainerAppointment" }),
    eventKey: (0, import_fields41.text)({ validation: { isRequired: true } }),
    kind: (0, import_fields41.select)({ options: ["issued", "reserved", "restored", "refunded"], validation: { isRequired: true } }),
    quantity: (0, import_fields41.integer)({ validation: { isRequired: true } }),
    balanceAfter: (0, import_fields41.integer)({ validation: { isRequired: true, min: 0 } }),
    actor: (0, import_fields41.relationship)({ ref: "User" }),
    reason: (0, import_fields41.text)(),
    ...trackingFields
  }
});

// features/keystone/models/CoachingAssignment.ts
var import_core39 = require("@keystone-6/core");
var import_access68 = require("@keystone-6/core/access");
var import_fields42 = require("@keystone-6/core/fields");
var CoachingAssignment = (0, import_core39.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  access: {
    operation: { query: isSignedIn, create: import_access68.denyAll, update: import_access68.denyAll, delete: import_access68.denyAll },
    filter: { query: ({ session }) => tenantFilter({ session }, canManageTenant({ session }, "canManagePrograms") ? void 0 : { OR: [{ member: { user: { id: { equals: session?.itemId } } } }, { instructor: { user: { id: { equals: session?.itemId } } } }] }) }
  },
  fields: {
    organization: (0, import_fields42.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: (0, import_fields42.relationship)({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    instructor: (0, import_fields42.relationship)({ ref: "Instructor", db: { extendPrismaSchema: requiredRelationshipDb("instructor") } }),
    title: (0, import_fields42.text)({ validation: { isRequired: true } }),
    instructions: (0, import_fields42.text)({ validation: { isRequired: true } }),
    dueAt: (0, import_fields42.timestamp)({ validation: { isRequired: true } }),
    status: (0, import_fields42.select)({ options: ["assigned", "submitted", "reviewed", "cancelled"], defaultValue: "assigned" }),
    memberEvidence: (0, import_fields42.text)(),
    submittedAt: (0, import_fields42.timestamp)(),
    review: (0, import_fields42.text)(),
    reviewedAt: (0, import_fields42.timestamp)(),
    workoutLog: (0, import_fields42.relationship)({ ref: "WorkoutLog" }),
    requestKey: (0, import_fields42.text)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/TrainingLead.ts
var import_core40 = require("@keystone-6/core");
var import_access70 = require("@keystone-6/core/access");
var import_fields43 = require("@keystone-6/core/fields");
var TrainingLead = (0, import_core40.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, email") },
  access: {
    operation: { query: (args) => canManageTenant(args, "canManagePeople"), create: import_access70.denyAll, update: import_access70.denyAll, delete: import_access70.denyAll },
    filter: { query: tenantFilter }
  },
  fields: {
    organization: (0, import_fields43.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    name: (0, import_fields43.text)({ validation: { isRequired: true } }),
    email: (0, import_fields43.text)({ validation: { isRequired: true } }),
    source: (0, import_fields43.text)(),
    owner: (0, import_fields43.relationship)({ ref: "User" }),
    status: (0, import_fields43.select)({ options: ["new", "contacted", "trial_booked", "trial_attended", "converted", "closed"], defaultValue: "new" }),
    trialAt: (0, import_fields43.timestamp)(),
    nextActionAt: (0, import_fields43.timestamp)(),
    member: (0, import_fields43.relationship)({ ref: "Member" }),
    history: (0, import_fields43.json)({ defaultValue: [] }),
    ...trackingFields
  }
});

// features/keystone/models/MemberImportRecord.ts
var import_core41 = require("@keystone-6/core");
var import_access71 = require("@keystone-6/core/access");
var import_fields44 = require("@keystone-6/core/fields");
var MemberImportRecord = (0, import_core41.list)({
  access: { operation: { query: permissions.canManagePeople, create: import_access71.denyAll, update: import_access71.denyAll, delete: import_access71.denyAll }, filter: { query: tenantFilter } },
  hooks: { validateInput: validateTenantOwnership([{ field: "member", list: "member" }]) },
  fields: {
    organization: (0, import_fields44.relationship)({ ref: "Organization", access: { update: import_access71.denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    key: (0, import_fields44.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    source: (0, import_fields44.text)({ validation: { isRequired: true } }),
    externalId: (0, import_fields44.text)({ validation: { isRequired: true } }),
    payloadHash: (0, import_fields44.text)({ validation: { isRequired: true } }),
    status: (0, import_fields44.select)({ options: ["processing", "completed", "failed"], defaultValue: "processing" }),
    member: (0, import_fields44.relationship)({ ref: "Member" }),
    lastError: (0, import_fields44.text)(),
    completedAt: (0, import_fields44.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/RetailModels.ts
var import_core42 = require("@keystone-6/core");
var import_access73 = require("@keystone-6/core/access");
var import_fields45 = require("@keystone-6/core/fields");
var access2 = { operation: { query: (args) => canManageTenant(args, "canManageRetail"), create: import_access73.denyAll, update: import_access73.denyAll, delete: import_access73.denyAll }, filter: { query: tenantFilter } };
var organization2 = () => (0, import_fields45.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } });
var location = () => (0, import_fields45.relationship)({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } });
var RetailItem = (0, import_core42.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, locationId, sku") },
  fields: { organization: organization2(), location: location(), sku: (0, import_fields45.text)({ validation: { isRequired: true } }), name: (0, import_fields45.text)({ validation: { isRequired: true } }), unitAmount: (0, import_fields45.integer)({ validation: { isRequired: true, min: 0 } }), currencyCode: (0, import_fields45.text)({ defaultValue: "USD" }), stockOnHand: (0, import_fields45.integer)({ defaultValue: 0, validation: { min: 0 } }), isActive: (0, import_fields45.checkbox)({ defaultValue: true }), ...trackingFields }
});
var RetailSale = (0, import_core42.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), requestKey: (0, import_fields45.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields45.text)({ validation: { isRequired: true } }), lines: (0, import_fields45.json)({ defaultValue: [] }), totalAmount: (0, import_fields45.integer)({ validation: { isRequired: true, min: 0 } }), currencyCode: (0, import_fields45.text)({ defaultValue: "USD" }), tender: (0, import_fields45.text)({ validation: { isRequired: true } }), paymentReference: (0, import_fields45.text)(), soldAt: (0, import_fields45.timestamp)({ validation: { isRequired: true } }), recordedBy: (0, import_fields45.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailReturn = (0, import_core42.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), sale: (0, import_fields45.relationship)({ ref: "RetailSale", db: { extendPrismaSchema: requiredRelationshipDb("sale") } }), requestKey: (0, import_fields45.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields45.text)({ validation: { isRequired: true } }), lines: (0, import_fields45.json)({ defaultValue: [] }), refundAmount: (0, import_fields45.integer)({ validation: { isRequired: true, min: 0 } }), refundReference: (0, import_fields45.text)(), tender: (0, import_fields45.text)({ validation: { isRequired: true } }), reason: (0, import_fields45.text)({ validation: { isRequired: true } }), returnedAt: (0, import_fields45.timestamp)({ validation: { isRequired: true } }), recordedBy: (0, import_fields45.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailStockEntry = (0, import_core42.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  fields: { organization: organization2(), location: location(), item: (0, import_fields45.relationship)({ ref: "RetailItem", db: { extendPrismaSchema: requiredRelationshipDb("item") } }), eventKey: (0, import_fields45.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields45.text)(), quantity: (0, import_fields45.integer)({ validation: { isRequired: true } }), balanceAfter: (0, import_fields45.integer)({ validation: { isRequired: true, min: 0 } }), reason: (0, import_fields45.text)({ validation: { isRequired: true } }), recordedBy: (0, import_fields45.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailClose = (0, import_core42.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), requestKey: (0, import_fields45.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields45.text)({ validation: { isRequired: true } }), periodStart: (0, import_fields45.timestamp)({ validation: { isRequired: true } }), periodEnd: (0, import_fields45.timestamp)({ validation: { isRequired: true } }), openingAmount: (0, import_fields45.integer)({ validation: { min: 0 } }), expectedAmount: (0, import_fields45.integer)({ validation: { isRequired: true } }), countedAmount: (0, import_fields45.integer)({ validation: { isRequired: true, min: 0 } }), varianceAmount: (0, import_fields45.integer)({ validation: { isRequired: true } }), reason: (0, import_fields45.text)(), evidence: (0, import_fields45.json)({ defaultValue: {} }), recordedBy: (0, import_fields45.relationship)({ ref: "User" }), ...trackingFields }
});

// features/keystone/models/index.ts
var models = {
  RetailItem,
  RetailSale,
  RetailReturn,
  RetailStockEntry,
  RetailClose,
  MemberImportRecord,
  TrainingPackage,
  TrainingCreditEntry,
  CoachingAssignment,
  TrainingLead,
  MembershipCreditGrant,
  MembershipCreditEntry,
  OperationalNotice,
  ParticipationPolicy,
  ParticipationEvidence,
  OperationsCase,
  IntegrationCredential,
  Organization,
  User,
  Role,
  Member,
  MembershipTier,
  Membership,
  MembershipPayment,
  Subscription,
  GymPayment,
  PaymentMethod,
  PaymentProvider,
  PaymentSession,
  PaymentEvent,
  CheckIn,
  Location,
  GymSettings,
  WorkoutLog,
  WorkoutSet,
  Exercise,
  Waitlist,
  AttendanceRecord,
  ClassType,
  ClassSchedule,
  ClassBooking,
  Instructor,
  ClassInstance,
  GymResource,
  TrainerAvailability,
  TrainerAppointment,
  OnboardingRun,
  GymRefundAttempt,
  MembershipBillingAttempt,
  AuthRateLimitBucket
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/queries/billing.ts
async function getBillingStats(_root, _args, context) {
  if (!context.session?.data?.role?.canManageAllRecords) {
    throw new Error("Operator access required");
  }
  const organizationId = getTenantId(context.session);
  if (!organizationId) throw new Error("Organization context required");
  const now = /* @__PURE__ */ new Date();
  const [settings, organization3] = await Promise.all([
    context.prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, timezone: true }
    }),
    context.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true }
    })
  ]);
  const currencyCode = String(settings?.currencyCode || "USD").toUpperCase();
  const timeZone = resolveGymTimeZone(settings?.timezone, organization3?.timezone);
  const startOfMonth = zonedStartOfMonth(now, timeZone);
  const [
    activeSubscriptions,
    activeMemberships,
    pastDueMemberships,
    completedPayments,
    monthlyPayments
  ] = await Promise.all([
    context.prisma.subscription.count({ where: { organizationId, status: "active" } }),
    context.prisma.membership.count({ where: { organizationId, status: "active" } }),
    context.prisma.membership.count({ where: { organizationId, status: "past-due" } }),
    context.prisma.membershipPayment.aggregate({
      where: { organizationId, currencyCode, status: { in: ["completed", "refunded"] } },
      _sum: { amount: true, refundAmount: true }
    }),
    context.prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode,
        status: { in: ["completed", "refunded"] },
        paymentDate: { gte: startOfMonth, lte: now }
      },
      _sum: { amount: true, refundAmount: true }
    })
  ]);
  return {
    totalRevenue: (completedPayments._sum.amount ?? 0) - (completedPayments._sum.refundAmount ?? 0),
    monthlyRevenue: (monthlyPayments._sum.amount ?? 0) - (monthlyPayments._sum.refundAmount ?? 0),
    currencyCode,
    timeZone,
    activeSubscriptions,
    activeMemberships,
    pastDueCount: pastDueMemberships
  };
}
async function getBillingWorkspace(root, args, context) {
  if (!context.session?.data?.role?.canManageAllRecords) throw new Error("Operator access required");
  const organizationId = getTenantId(context.session);
  if (!organizationId) throw new Error("Organization context required");
  const tenant = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const [
    stats,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments
  ] = await Promise.all([
    getBillingStats(root, args, context),
    sudo.query.MembershipPayment.findMany({ where: tenant, take: 10, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount status paymentDate paymentType member { id name }" }),
    sudo.query.Subscription.findMany({ where: tenant, take: 10, orderBy: [{ startDate: "desc" }], query: "id status startDate member { id name } membershipTier { name }" }),
    sudo.query.Membership.findMany({ where: { AND: [tenant, { status: { in: ["active", "frozen", "past-due"] } }] }, take: 50, orderBy: [{ updatedAt: "desc" }], query: "id status billingCycle stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.MembershipTier.findMany({ where: tenant, take: 100, orderBy: [{ monthlyPrice: "asc" }], query: "id name" }),
    sudo.query.Membership.findMany({ where: { AND: [tenant, { status: { equals: "past-due" } }] }, take: 8, orderBy: [{ updatedAt: "desc" }], query: "id status nextBillingDate stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.GymPayment.findMany({ where: { AND: [tenant, { status: { equals: "succeeded" } }] }, take: 20, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount paymentDate receiptNumber description member { id name email }" }),
    sudo.query.MembershipPayment.findMany({ where: { AND: [tenant, { status: { equals: "failed" } }] }, take: 8, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode paymentDate description membership { id member { id name email } }" })
  ]);
  return {
    stats,
    timeZone: stats.timeZone,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments
  };
}

// lib/qrcode.ts
var import_qrcode = __toESM(require("qrcode"));
var import_crypto = __toESM(require("crypto"));
var QR_EXPIRY_SECONDS = 30;
var QR_CLOCK_SKEW_SECONDS = 5;
function qrSecret() {
  const secret = process.env.QR_CODE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("QR_CODE_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}
function generateQRSignature(memberId, organizationId, timestamp31) {
  const data = `${organizationId}:${memberId}:${timestamp31}`;
  return import_crypto.default.createHmac("sha256", qrSecret()).update(data).digest("hex");
}
function createQRCodeData(memberId, organizationId) {
  const timestamp31 = Date.now();
  const signature = generateQRSignature(memberId, organizationId, timestamp31);
  return { memberId, organizationId, timestamp: timestamp31, signature };
}
function encodeQRData(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}
function decodeQRData(encoded) {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
    const data = JSON.parse(decoded);
    if (typeof data.memberId !== "string" || !data.memberId || typeof data.organizationId !== "string" || !data.organizationId || !Number.isSafeInteger(data.timestamp) || typeof data.signature !== "string") return null;
    return data;
  } catch {
    return null;
  }
}
function validateQRCode(encoded) {
  const data = decodeQRData(encoded);
  if (!data) return { valid: false, error: "Invalid QR code format" };
  const now = Date.now();
  const ageSeconds = (now - data.timestamp) / 1e3;
  if (ageSeconds > QR_EXPIRY_SECONDS) return { valid: false, error: "QR code expired" };
  if (ageSeconds < -QR_CLOCK_SKEW_SECONDS) return { valid: false, error: "QR code timestamp is invalid" };
  const expectedSignature = generateQRSignature(data.memberId, data.organizationId, data.timestamp);
  const actual = Buffer.from(data.signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (actual.length !== expected.length || !import_crypto.default.timingSafeEqual(actual, expected)) {
    return { valid: false, error: "Invalid QR code signature" };
  }
  return { valid: true, memberId: data.memberId, organizationId: data.organizationId };
}
async function generateQRCodeDataURL(memberId, organizationId) {
  const data = createQRCodeData(memberId, organizationId);
  return import_qrcode.default.toDataURL(encodeQRData(data), {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M"
  });
}

// features/keystone/queries/memberExperience.ts
init_operational_policy();

// features/member/lib/check-in-eligibility.ts
function memberCheckInUnavailableReason(memberStatus, membershipStatus) {
  if (memberStatus !== "active") return "Your member account must be active before a check-in code is available.";
  if (membershipStatus !== "active") return "An active membership is required before a check-in code is available.";
  return null;
}

// features/keystone/queries/memberExperience.ts
var MAX_PROFILE_NAME_LENGTH = 120;
var MAX_PROFILE_PHONE_LENGTH = 40;
var MAX_PROFILE_DATE_LENGTH = 40;
var MAX_HEALTH_NOTE_ITEMS = 20;
var MAX_HEALTH_NOTE_ITEM_LENGTH = 120;
var MAX_HEALTH_NOTES_LENGTH = 2e3;
function actor(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  return { userId: session.itemId, organizationId };
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeHealthNotes(value) {
  if (value == null) return { conditions: [], injuries: [], notes: "" };
  if (!isJsonObject(value)) throw new Error("Health notes are invalid");
  const validStringArray = (items) => Array.isArray(items) && items.length <= MAX_HEALTH_NOTE_ITEMS && items.every((item) => typeof item === "string" && item.length <= MAX_HEALTH_NOTE_ITEM_LENGTH);
  if (!validStringArray(value.conditions) || !validStringArray(value.injuries)) {
    throw new Error("Health conditions and injuries are invalid or too long");
  }
  if (typeof value.notes !== "string" || value.notes.length > MAX_HEALTH_NOTES_LENGTH) {
    throw new Error("Health notes are invalid or too long");
  }
  return {
    conditions: value.conditions.map((item) => item.trim()).filter(Boolean),
    injuries: value.injuries.map((item) => item.trim()).filter(Boolean),
    notes: value.notes.trim()
  };
}
async function profileForActor(context) {
  const { userId, organizationId } = actor(context);
  const members = await context.sudo().query.Member.findMany({
    where: {
      AND: [
        { user: { id: { equals: userId } } },
        { organization: { id: { equals: organizationId } } }
      ]
    },
    take: 1,
    query: `
      id name email phone dateOfBirth joinDate status
      emergencyContactName emergencyContactPhone healthNotes
      profilePhoto { url }
      membershipTier { id name monthlyPrice }
      membershipLengthDays attendanceRate lastCheckIn
      organization { id }
      user { id membership { id status } }
    `
  });
  const member = members[0];
  if (!member || member.organization?.id !== organizationId || member.user?.id !== userId) {
    throw new Error("Member profile not found");
  }
  return member;
}
function projectProfile(member) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    phone: member.phone ?? null,
    dateOfBirth: member.dateOfBirth ?? null,
    joinDate: member.joinDate,
    status: member.status,
    emergencyContactName: member.emergencyContactName ?? null,
    emergencyContactPhone: member.emergencyContactPhone ?? null,
    healthNotes: member.healthNotes ?? { conditions: [], injuries: [], notes: "" },
    profilePhotoUrl: member.profilePhoto?.url ?? null,
    membershipTier: member.membershipTier ?? null,
    membershipLengthDays: member.membershipLengthDays ?? 0,
    attendanceRate: member.attendanceRate ?? 0,
    lastCheckIn: member.lastCheckIn ?? null
  };
}
async function getMemberProfile(_root, _args, context) {
  return projectProfile(await profileForActor(context));
}
async function updateMemberProfile(_root, { data }, context) {
  const current = await profileForActor(context);
  const { userId, organizationId } = actor(context);
  const name = data.name === void 0 ? current.name : String(data.name).trim();
  const email = data.email === void 0 ? current.email : String(data.email).trim().toLowerCase();
  const password2 = data.password === void 0 ? "" : String(data.password);
  const phone = data.phone === void 0 ? current.phone ?? "" : String(data.phone).trim();
  const dateOfBirth = data.dateOfBirth === void 0 ? current.dateOfBirth : String(data.dateOfBirth).trim();
  const emergencyContactName = data.emergencyContactName === void 0 ? current.emergencyContactName ?? "" : String(data.emergencyContactName).trim();
  const emergencyContactPhone = data.emergencyContactPhone === void 0 ? current.emergencyContactPhone ?? "" : String(data.emergencyContactPhone).trim();
  const healthNotes = data.healthNotes === void 0 ? current.healthNotes : normalizeHealthNotes(data.healthNotes);
  if (!name || name.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Name is required and must be 120 characters or fewer");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (password2 && (password2.length < 12 || password2.length > 128)) throw new Error("Password must be between 12 and 128 characters");
  if (phone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Phone number is too long");
  if (String(dateOfBirth ?? "").length > MAX_PROFILE_DATE_LENGTH) throw new Error("Date of birth is too long");
  if (emergencyContactName.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Emergency contact name is too long");
  if (emergencyContactPhone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Emergency contact phone is too long");
  if (dateOfBirth) {
    const parsed = new Date(String(dateOfBirth));
    if (Number.isNaN(parsed.getTime()) || parsed > /* @__PURE__ */ new Date()) throw new Error("Date of birth must be a valid past date");
  }
  await context.transaction(async (transactionContext) => {
    if (data.healthNotes !== void 0 && (healthNotes.notes || healthNotes.conditions?.length || healthNotes.injuries?.length)) {
      const tx = transactionContext.prisma;
      await lockParticipationPolicy(tx, organizationId);
      const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const consent = policy && await tx.participationEvidence.findFirst({ where: {
        organizationId,
        memberId: current.id,
        policyId: policy.id,
        healthConsent: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: /* @__PURE__ */ new Date() } }]
      } });
      if (!consent) throw new Error("Review the studio policy and record health-data consent in Participation and privacy before saving optional health information");
    }
    const member = await transactionContext.prisma.member.findFirst({
      where: { id: current.id, userId, organizationId },
      select: { id: true }
    });
    if (!member) throw new Error("Member profile not found");
    await transactionContext.prisma.member.update({
      where: { id: member.id },
      data: {
        name,
        email,
        phone: phone || null,
        dateOfBirth: dateOfBirth ? new Date(String(dateOfBirth)) : null,
        emergencyContactName,
        emergencyContactPhone,
        healthNotes
      }
    });
    await transactionContext.sudo().query.User.updateOne({
      where: { id: userId },
      data: { name, email, phone: phone || "", ...password2 ? { password: password2 } : {} },
      query: "id"
    });
  });
  return projectProfile(await profileForActor(context));
}
async function getMemberCheckInCode(_root, _args, context) {
  const member = await profileForActor(context);
  const membershipStatus = member.user?.membership?.status;
  const unavailableReason = memberCheckInUnavailableReason(member.status, membershipStatus);
  if (unavailableReason) {
    return { qrDataUrl: null, expiresIn: 0, error: unavailableReason };
  }
  return {
    qrDataUrl: await generateQRCodeDataURL(member.id, member.organization.id),
    expiresIn: 30,
    error: null
  };
}

// features/platform/scheduling/lib/time.ts
var TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function scheduleDurationMinutes(startTime, endTime) {
  if (!startTime || !endTime || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return 60;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration > 0 ? duration : 60;
}

// features/keystone/queries/scheduling.ts
function schedulingActor(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  const isInstructor = Boolean(session?.data?.role?.isInstructor);
  const canManageAllRecords = Boolean(session?.data?.role?.canManageAllRecords);
  if (!session?.itemId || !organizationId || !session.data?.role?.canAccessDashboard || !isInstructor && !canManageAllRecords) {
    throw new Error("Scheduling dashboard access required");
  }
  return {
    userId: session.itemId,
    organizationId,
    isInstructor,
    canManageAllRecords
  };
}
function boundedDate(value, label) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date`);
  return date;
}
async function getSchedulingWorkspace(_root, { start, end, userId }, context) {
  const actor2 = schedulingActor(context);
  const startsAt = boundedDate(start, "start");
  const endsAt = boundedDate(end, "end");
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 370 * 24 * 60 * 60 * 1e3) {
    throw new Error("Scheduling range must be positive and no longer than 370 days");
  }
  const restrictedInstructor = actor2.isInstructor && !actor2.canManageAllRecords;
  const effectiveUserId = restrictedInstructor ? actor2.userId : userId || void 0;
  const isInstructorOnly = Boolean((restrictedInstructor || userId) && effectiveUserId);
  const sudo = context.sudo();
  const tenant = { organization: { id: { equals: actor2.organizationId } } };
  const instructorFilter = { instructor: { user: { id: { equals: effectiveUserId } } } };
  const eventWhere = {
    AND: [tenant, { date: { gte: startsAt.toISOString(), lte: endsAt.toISOString() } }]
  };
  if (effectiveUserId) {
    eventWhere.AND.push({ OR: [
      { instructor: { user: { id: { equals: effectiveUserId } } } },
      { AND: [{ instructor: null }, { classSchedule: instructorFilter }] }
    ] });
  }
  const schedulesWhere = isInstructorOnly ? { AND: [tenant, instructorFilter] } : tenant;
  const instructorsWhere = isInstructorOnly ? { AND: [tenant, { isActive: { equals: true } }, { user: { id: { equals: effectiveUserId } } }] } : { AND: [tenant, { isActive: { equals: true } }] };
  const upcomingWhere = {
    AND: [tenant, { date: { gte: (/* @__PURE__ */ new Date()).toISOString() } }]
  };
  if (isInstructorOnly) {
    upcomingWhere.AND.push({ OR: [
      { instructor: { user: { id: { equals: effectiveUserId } } } },
      { AND: [{ instructor: null }, { classSchedule: instructorFilter }] }
    ] });
  }
  const [instances, schedules, instructors, classTypes, upcomingInstances, settings, organizations, locations, resources] = await Promise.all([
    sudo.query.ClassInstance.findMany({
      where: eventWhere,
      take: 1e3,
      orderBy: [{ date: "asc" }],
      query: `
        id date endsAt isCancelled maxCapacity bookingsCount location { id name } resource { id name }
        classSchedule { id name startTime endTime maxCapacity instructor { user { name } } }
        instructor { user { name } }
      `
    }),
    sudo.query.ClassSchedule.findMany({
      where: schedulesWhere,
      take: 500,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      query: `
        id name description dayOfWeek startTime endTime maxCapacity isActive location { id name } resource { id name }
        instructor { id user { id name email } }
        classType { id name }
      `
    }),
    sudo.query.Instructor.findMany({
      where: instructorsWhere,
      take: 500,
      query: "id user { id name email }"
    }),
    sudo.query.ClassType.findMany({
      where: tenant,
      take: 500,
      orderBy: [{ name: "asc" }],
      query: "id name"
    }),
    sudo.query.ClassInstance.findMany({
      where: upcomingWhere,
      orderBy: [{ date: "asc" }],
      take: 30,
      query: `
        id date endsAt isCancelled cancellationReason bookingsCount maxCapacity location { id name } resource { id name }
        classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name } } }
        instructor { id user { name } }
      `
    }),
    sudo.query.GymSettings.findMany({
      where: tenant,
      take: 1,
      query: "timezone"
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: actor2.organizationId } },
      take: 1,
      query: "timezone"
    }),
    sudo.query.Location.findMany({ where: { AND: [tenant, { isActive: { equals: true } }] }, take: 200, query: "id name" }),
    sudo.query.GymResource.findMany({ where: { AND: [tenant, { isActive: { equals: true } }] }, take: 500, query: "id name capacity location { id }" })
  ]);
  const timeZone = resolveGymTimeZone(settings[0]?.timezone, organizations[0]?.timezone);
  const events = instances.map((instance) => {
    const schedule = instance.classSchedule || {};
    const startDate = new Date(instance.date);
    const endDate = instance.endsAt ? new Date(instance.endsAt) : new Date(startDate.getTime() + scheduleDurationMinutes(schedule.startTime, schedule.endTime) * 60 * 1e3);
    return {
      id: instance.id,
      title: schedule.name || "Untitled Class",
      start: instance.date,
      end: endDate.toISOString(),
      instructor: instance.instructor?.user?.name || schedule.instructor?.user?.name || "TBA",
      capacity: `${instance.bookingsCount || 0}/${instance.maxCapacity || schedule.maxCapacity || 0}`,
      type: schedule.name?.toLowerCase().includes("yoga") ? "yoga" : "class",
      color: instance.isCancelled ? "zinc" : "violet",
      isCancelled: instance.isCancelled,
      rosterHref: `/dashboard/platform/rosters/${instance.id}`,
      scheduleId: schedule.id
    };
  });
  return { events, schedules, instructors, classTypes, upcomingInstances, timeZone, locations, resources };
}

// features/keystone/queries/rosters.ts
function rosterActor(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  const isInstructor = Boolean(session?.data?.role?.isInstructor);
  const canManageAllRecords = Boolean(session?.data?.role?.canManageAllRecords);
  if (!session?.itemId || !organizationId || !session.data?.role?.canAccessDashboard || !isInstructor && !canManageAllRecords) {
    throw new Error("Roster dashboard access required");
  }
  return {
    userId: session.itemId,
    organizationId,
    instructorOnly: isInstructor && !canManageAllRecords
  };
}
function assignmentFilter(userId) {
  return { OR: [
    { instructor: { user: { id: { equals: userId } } } },
    { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { id: { equals: userId } } } } }] }
  ] };
}
var ROSTER_GYM_SETTINGS_PROJECTION = "name address timezone";
var ROSTER_ORGANIZATION_PROJECTION = "name timezone";
var ROSTER_LOCATION_PROJECTION = "id name address";
var ROSTER_SESSION_PROJECTION = `
  id date maxCapacity bookingsCount
  classSchedule { id name maxCapacity startTime endTime instructor { user { name } } }
  instructor { user { name } }
  bookings(where: { status: { equals: "waitlist" } }, take: 1000) { id }
`;
var ROSTER_DETAIL_PROJECTION = `
  id date maxCapacity isCancelled cancellationReason
  classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name email } } }
  instructor { id user { name email } }
  bookings(orderBy: [{ waitlistPosition: asc }, { bookedAt: asc }], take: 1000) {
    id status eligibilityReviewReason bookedAt waitlistPosition memberName memberEmail memberPhone
    member { id name email phone user { id } }
  }
`;
var ROSTER_ATTENDANCE_PROJECTION = "id booking { id } attended lateArrival minutesLate noShowReason markedAt";
function rosterInstructorAccountProjection(from) {
  const boundedFrom = JSON.stringify(from);
  return `
    id specialties certifications
    classSchedules(take: 30) {
      id name dayOfWeek startTime endTime maxCapacity
      instances(
        where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false }, instructor: null }
        orderBy: [{ date: asc }]
        take: 20
      ) { id date maxCapacity instructor { id } bookings { id status waitlistPosition } }
    }
    classInstances(
      where: { date: { gte: ${boundedFrom} }, isCancelled: { equals: false } }
      orderBy: [{ date: asc }]
      take: 20
    ) {
      id date maxCapacity instructor { id }
      classSchedule { id name maxCapacity dayOfWeek startTime endTime }
      bookings { id status waitlistPosition }
    }
  `;
}
async function getRosterPresentation(context, organizationId) {
  const sudo = context.sudo();
  const [settings, organizations, locations] = await Promise.all([
    sudo.query.GymSettings.findMany({
      where: { organization: { id: { equals: organizationId } } },
      take: 1,
      query: ROSTER_GYM_SETTINGS_PROJECTION
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: organizationId } },
      take: 1,
      query: ROSTER_ORGANIZATION_PROJECTION
    }),
    sudo.query.Location.findMany({
      where: {
        AND: [
          { organization: { id: { equals: organizationId } } },
          { isActive: { equals: true } }
        ]
      },
      orderBy: [{ createdAt: "asc" }],
      take: 1,
      query: ROSTER_LOCATION_PROJECTION
    })
  ]);
  const gym = settings[0];
  const organization3 = organizations[0];
  const location2 = locations[0];
  const locationName = location2?.name || gym?.name || organization3?.name || "Main studio";
  const address = location2?.address || gym?.address;
  return {
    gymLocation: [locationName, address].filter(Boolean).join(" \xB7 "),
    gymTimezone: resolveGymTimeZone(gym?.timezone, organization3?.timezone)
  };
}
async function getInstructorAccount(_root, _args, context) {
  const actor2 = rosterActor(context);
  if (!context.session?.data?.role?.isInstructor) throw new Error("Instructor access required");
  const instructors = await context.sudo().query.Instructor.findMany({
    where: {
      AND: [
        { organization: { id: { equals: actor2.organizationId } } },
        { user: { id: { equals: actor2.userId } } },
        { isActive: { equals: true } }
      ]
    },
    take: 1,
    query: rosterInstructorAccountProjection((/* @__PURE__ */ new Date()).toISOString())
  });
  return instructors[0] ?? null;
}
async function getRosterSessions(_root, _args, context) {
  const actor2 = rosterActor(context);
  const tenant = { organization: { id: { equals: actor2.organizationId } } };
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  const where = {
    AND: [
      tenant,
      { date: { gte: recentCutoff } },
      { isCancelled: { equals: false } },
      ...actor2.instructorOnly ? [assignmentFilter(actor2.userId)] : []
    ]
  };
  const [sessions, presentation] = await Promise.all([
    context.sudo().query.ClassInstance.findMany({
      where,
      orderBy: [{ date: "asc" }],
      take: 20,
      query: ROSTER_SESSION_PROJECTION
    }),
    getRosterPresentation(context, actor2.organizationId)
  ]);
  return sessions.map((session) => ({ ...session, ...presentation }));
}
async function getRosterDetail(_root, { classInstanceId }, context) {
  const actor2 = rosterActor(context);
  const where = {
    AND: [
      { id: { equals: classInstanceId } },
      { organization: { id: { equals: actor2.organizationId } } },
      ...actor2.instructorOnly ? [assignmentFilter(actor2.userId)] : []
    ]
  };
  const [instances, presentation] = await Promise.all([
    context.sudo().query.ClassInstance.findMany({
      where,
      take: 1,
      query: ROSTER_DETAIL_PROJECTION
    }),
    getRosterPresentation(context, actor2.organizationId)
  ]);
  const instance = instances[0];
  if (!instance) return null;
  const bookings = instance.bookings ?? [];
  const bookingIds = bookings.map((booking) => booking.id).filter(Boolean);
  const attendanceByBookingId = /* @__PURE__ */ new Map();
  if (bookingIds.length) {
    const records = await context.sudo().query.AttendanceRecord.findMany({
      where: {
        AND: [
          { booking: { id: { in: bookingIds } } },
          { organization: { id: { equals: actor2.organizationId } } }
        ]
      },
      take: Math.min(bookingIds.length, 1e3),
      query: ROSTER_ATTENDANCE_PROJECTION
    });
    for (const record of records) {
      if (!attendanceByBookingId.has(record.booking?.id)) attendanceByBookingId.set(record.booking.id, record);
    }
  }
  return {
    ...instance,
    ...presentation,
    bookings: bookings.map((booking) => ({
      ...booking,
      attendance: attendanceByBookingId.get(booking.id) ?? null
    }))
  };
}

// features/keystone/queries/checkIn.ts
init_membership_credits();
function frontDeskOrganizationId(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  if (!session.data?.role?.canManageAllRecords && !session.data?.role?.canManageFacilities && !session.data?.role?.canManageCheckIns) {
    throw new Error("Facility check-in management permission required");
  }
  return organizationId;
}
async function getFrontDeskWorkspace(_root, { query }, context) {
  const organizationId = frontDeskOrganizationId(context);
  const search = typeof query === "string" ? query.trim() : "";
  if (search.length === 1) throw new Error("Search with at least two characters");
  if (search.length > 100) throw new Error("Member search must be 100 characters or fewer");
  const memberWhere = {
    AND: [
      { organization: { id: { equals: organizationId } } },
      ...search ? [{ OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } }
      ] }] : []
    ]
  };
  const tenantWhere2 = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const [members, checkIns, locations, gymSettings] = await Promise.all([
    search ? sudo.query.Member.findMany({
      where: memberWhere,
      take: 10,
      orderBy: [{ joinDate: "desc" }],
      query: `
        id name status
        user { membership { status creditPeriodStart creditPeriodEnd startDate nextBillingDate freezeStartDate freezeEndDate } }
      `
    }) : Promise.resolve([]),
    sudo.query.CheckIn.findMany({
      where: { AND: [tenantWhere2, { checkOutTime: { equals: null } }] },
      take: 12,
      orderBy: [{ checkInTime: "desc" }],
      query: "id checkInTime method membershipValidated member { name } location { id name }"
    }),
    sudo.query.Location.findMany({
      where: { AND: [tenantWhere2, { isActive: { equals: true } }] },
      take: 200,
      orderBy: [{ name: "asc" }],
      query: "id name"
    }),
    sudo.query.GymSettings.findMany({
      where: tenantWhere2,
      take: 1,
      query: "timezone organization { timezone }"
    })
  ]);
  const checkedAt = /* @__PURE__ */ new Date();
  return {
    members: members.map((member) => {
      const membership = member.user?.membership;
      let membershipEligible = false;
      let entitlementReason = "No membership found";
      if (member.status !== "active") entitlementReason = `Member account is ${member.status || "unavailable"}`;
      else if (membership) {
        try {
          assertMembershipServiceEligibility(membership, checkedAt);
          membershipEligible = true;
          entitlementReason = "";
        } catch (error) {
          entitlementReason = error instanceof Error ? error.message : "Membership eligibility requires review";
        }
      }
      return {
        id: member.id,
        name: member.name,
        status: member.status,
        membershipEligible,
        entitlementReason
      };
    }),
    checkIns: checkIns.map((checkIn) => ({
      id: checkIn.id,
      checkInTime: new Date(checkIn.checkInTime).toISOString(),
      method: checkIn.method,
      membershipValidated: checkIn.membershipValidated,
      member: checkIn.member ? { name: checkIn.member.name } : null,
      location: checkIn.location ? { id: checkIn.location.id, name: checkIn.location.name } : null
    })),
    locations,
    gymSettings
  };
}

// features/keystone/queries/reports.ts
function reportManager(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canViewReports && !session.data?.role?.canManageAllRecords) {
    throw new Error("Report access required");
  }
  return organizationId;
}
function toPercent(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 100) : 0;
}
async function getReportsDashboard(_root, _args, context) {
  const organizationId = reportManager(context);
  const organizationWhere = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const now = /* @__PURE__ */ new Date();
  const [settings, organization3] = await Promise.all([
    context.prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, timezone: true }
    }),
    context.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true }
    })
  ]);
  const timeZone = resolveGymTimeZone(settings?.timezone, organization3?.timezone);
  const reportCurrency = String(settings?.currencyCode || "USD").toUpperCase();
  const todayStart = zonedStartOfDay(now, timeZone);
  const todayEnd = zonedStartOfNextDay(now, timeZone);
  const monthStart = zonedStartOfMonth(now, timeZone);
  const soonThreshold = new Date(now.getTime() + 90 * 60 * 1e3);
  const attendanceWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1e3);
  const [
    activeMembers,
    todayCheckIns,
    upcomingSessionsToday,
    liveOrStartingSoon,
    pastDueMemberships,
    completedPaymentAggregate,
    monthlyPaymentAggregate,
    totalMarked,
    attendedCount,
    lateCount,
    noShowCount,
    upcomingInstances,
    activeMembershipMembers
  ] = await Promise.all([
    context.prisma.member.count({ where: { organizationId, status: "active", user: { membership: {
      status: "active",
      OR: [
        { creditPeriodStart: { lte: now }, creditPeriodEnd: { gt: now } },
        { creditPeriodEnd: null, startDate: { lte: now }, nextBillingDate: { gt: now } }
      ]
    } } } }),
    sudo.query.CheckIn.count({ where: { ...organizationWhere, checkInTime: { gte: todayStart.toISOString(), lt: todayEnd.toISOString() } } }),
    sudo.query.ClassInstance.count({ where: { ...organizationWhere, date: { gte: todayStart.toISOString(), lt: todayEnd.toISOString() }, isCancelled: { equals: false } } }),
    sudo.query.ClassInstance.count({ where: { ...organizationWhere, date: { gte: now.toISOString(), lte: soonThreshold.toISOString() }, isCancelled: { equals: false } } }),
    sudo.query.Membership.count({ where: { ...organizationWhere, status: { equals: "past-due" } } }),
    context.prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { lt: now }
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true }
    }),
    context.prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { gte: monthStart, lt: now }
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true }
    }),
    context.prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now } } }),
    context.prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: true } }),
    context.prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, lateArrival: true } }),
    context.prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: false } }),
    sudo.query.ClassInstance.findMany({
      where: { ...organizationWhere, date: { gte: now.toISOString() }, isCancelled: { equals: false } },
      take: 12,
      orderBy: [{ date: "asc" }],
      query: "id date maxCapacity classSchedule { id name maxCapacity } instructor { user { name } } bookings { id status }"
    }),
    sudo.query.Member.findMany({
      where: { ...organizationWhere, status: { equals: "active" }, user: { membership: { status: { equals: "active" } } } },
      take: 8,
      orderBy: [{ joinDate: "desc" }],
      query: "id name email attendanceRate lastCheckIn user { membership { id status classCreditsRemaining tier { id name } } }"
    })
  ]);
  const totalRevenue = (completedPaymentAggregate._sum.amount ?? 0) - (completedPaymentAggregate._sum.refundAmount ?? 0);
  const monthlyRevenue = (monthlyPaymentAggregate._sum.amount ?? 0) - (monthlyPaymentAggregate._sum.refundAmount ?? 0);
  const settledPayments = completedPaymentAggregate._count._all;
  const utilization = upcomingInstances.map((instance) => {
    const confirmedBookings = (instance.bookings || []).filter((booking) => booking.status === "confirmed").length;
    const waitlistCount = (instance.bookings || []).filter((booking) => booking.status === "waitlist").length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    return {
      id: instance.id,
      name: instance.classSchedule?.name ?? "Class",
      instructorName: instance.instructor?.user?.name ?? "Instructor TBD",
      nextSessionDate: instance.date ?? null,
      maxCapacity,
      confirmedBookings,
      waitlistCount,
      utilizationPercent: toPercent(confirmedBookings, maxCapacity)
    };
  });
  const membershipHealth = activeMembershipMembers.map((member) => ({
    id: member.id,
    name: member.name ?? "Member",
    email: member.email ?? "\u2014",
    membershipStatus: member.user?.membership?.status ?? "unknown",
    planName: member.user?.membership?.tier?.name ?? "No tier",
    creditsRemaining: member.user?.membership?.classCreditsRemaining ?? null,
    attendanceRate: member.attendanceRate ?? 0,
    lastCheckIn: member.lastCheckIn ?? null
  }));
  return {
    timeZone,
    operator: {
      activeMembers,
      checkInsToday: todayCheckIns,
      upcomingSessionsToday,
      liveOrStartingSoon,
      waitlistPressure: utilization.reduce((sum, row) => sum + row.waitlistCount, 0),
      pastDueMemberships
    },
    revenue: {
      monthlyRevenue,
      totalRevenue,
      currencyCode: reportCurrency,
      settledPayments,
      monthlySettledPayments: monthlyPaymentAggregate._count._all,
      averagePayment: settledPayments ? Math.round(totalRevenue / settledPayments) : 0
    },
    attendance: {
      totalMarked,
      attendedCount,
      lateCount,
      noShowCount,
      attendanceRate: toPercent(attendedCount, totalMarked),
      noShowRate: toPercent(noShowCount, totalMarked)
    },
    utilization,
    membershipHealth
  };
}

// features/keystone/queries/publicGym.ts
var DEFAULT_INSTANCE_WINDOW_DAYS = 14;
var MAX_INSTANCE_WINDOW_DAYS = 90;
var DEFAULT_LIST_LIMIT = 50;
var MAX_LIST_LIMIT = 100;
function documentToPlainText(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object") return null;
  const document4 = value.document;
  const text42 = document4?.flatMap((node) => node.children ?? []).map((child) => typeof child.text === "string" ? child.text : "").join(" ").replace(/\s+/g, " ").trim();
  return text42 || null;
}
function normalizePublicLimit(value) {
  if (!Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIST_LIMIT);
}
function resolvePublicInstanceWindow(from, to, now = /* @__PURE__ */ new Date()) {
  const requestedStart = from ? new Date(from) : now;
  if (Number.isNaN(requestedStart.getTime())) throw new Error("Invalid public class start date.");
  const start = new Date(Math.max(requestedStart.getTime(), now.getTime()));
  const maximumEnd = new Date(start.getTime() + MAX_INSTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1e3);
  const requestedEnd = to ? new Date(to) : new Date(start.getTime() + DEFAULT_INSTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1e3);
  if (Number.isNaN(requestedEnd.getTime())) throw new Error("Invalid public class end date.");
  if (requestedEnd < start) throw new Error("Public class end date must be after the start date.");
  return {
    from: start.toISOString(),
    to: new Date(Math.min(requestedEnd.getTime(), maximumEnd.getTime())).toISOString()
  };
}
function normalizePublicMediaPath(value) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/images/") || path.startsWith("//") || path.includes("..") || path.includes("?") || path.includes("#") || path.includes("\\")) {
    return null;
  }
  return path;
}
function publicText(value, limit) {
  if (typeof value !== "string") return null;
  const text42 = value.trim();
  return text42 ? text42.slice(0, limit) : null;
}
function publicInternalHref(value) {
  const href = publicText(value, 500);
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.includes("..") || href.includes("\\")) {
    return null;
  }
  return href;
}
function publicHours(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 1e4) return null;
  return JSON.parse(serialized);
}
function publicHeroStats(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const valueText = publicText(item.value, 50);
    const label = publicText(item.label, 100);
    return valueText && label ? [{ value: valueText, label }] : [];
  });
}
function publicContactTopics(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = publicText(item.title, 100);
    const details = Array.isArray(item.details) ? item.details.slice(0, 12).flatMap((detail) => {
      const text42 = publicText(detail, 300);
      return text42 ? [text42] : [];
    }) : [];
    return title && details.length ? [{ title, details }] : [];
  });
}
function publicFacilityHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = publicText(item.title, 200);
    const description = publicText(item.description, 1e3);
    const features = Array.isArray(item.features) ? item.features.slice(0, 20).flatMap((feature) => {
      const text42 = publicText(feature, 100);
      return text42 ? [text42] : [];
    }) : [];
    return title && description ? [{ title, description, features }] : [];
  });
}
function projectPublicGymSettings(settings, organizationTimeZone) {
  if (!settings) return null;
  const name = publicText(settings.name, 200);
  if (!name) return null;
  const logoIcon = sanitizeGymLogoSvg(settings.logoIcon);
  return {
    id: String(settings.id),
    name,
    tagline: publicText(settings.tagline, 300),
    logoIcon: logoIcon || null,
    brandHue: normalizeStorefrontHue(settings.brandHue),
    description: publicText(settings.description, 2e3),
    address: publicText(settings.address, 500),
    phone: publicText(settings.phone, 50),
    email: publicText(settings.email, 320),
    currencyCode: publicText(settings.currencyCode, 3),
    locale: publicText(settings.locale, 20),
    timezone: resolveGymTimeZone(
      publicText(settings.timezone, 100),
      publicText(organizationTimeZone, 100)
    ),
    countryCode: publicText(settings.countryCode, 2),
    hours: publicHours(settings.hours),
    heroEyebrow: publicText(settings.heroEyebrow, 200),
    heroHeadline: publicText(settings.heroHeadline, 1e3),
    heroSubheadline: publicText(settings.heroSubheadline, 2e3),
    heroImagePath: normalizePublicMediaPath(settings.heroImageUrl),
    heroPrimaryCtaLabel: publicText(settings.heroPrimaryCtaLabel, 100),
    heroPrimaryCtaHref: publicInternalHref(settings.heroPrimaryCtaHref),
    heroSecondaryCtaLabel: publicText(settings.heroSecondaryCtaLabel, 100),
    heroSecondaryCtaHref: publicInternalHref(settings.heroSecondaryCtaHref),
    promoBanner: publicText(settings.promoBanner, 500),
    footerTagline: publicText(settings.footerTagline, 500),
    copyrightName: publicText(settings.copyrightName, 200),
    facilityHeadline: publicText(settings.facilityHeadline, 300),
    facilityDescription: publicText(settings.facilityDescription, 2e3),
    facilityHighlights: publicFacilityHighlights(settings.facilityHighlights),
    heroStats: publicHeroStats(settings.heroStats),
    contactTopics: publicContactTopics(settings.contactTopics)
  };
}
function publicContext(context) {
  return context.sudo();
}
async function publicOrganizationId(context) {
  const configuredId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  const organizations = await publicContext(context).query.Organization.findMany({
    where: configuredId ? { AND: [{ id: { equals: configuredId } }, { status: { equals: "active" } }] } : { status: { equals: "active" } },
    take: configuredId ? 1 : 2,
    orderBy: [{ createdAt: "asc" }],
    query: "id"
  });
  if (!configuredId && organizations.length !== 1) return null;
  return organizations[0]?.id ?? null;
}
function publicTenantWhere(organizationId, where = {}) {
  if (!organizationId) return { id: { equals: "__no_public_organization__" } };
  return {
    AND: [
      { organization: { id: { equals: organizationId } } },
      where
    ]
  };
}
function publicInstructor(instructor) {
  if (!instructor) return null;
  return {
    id: instructor.id,
    name: instructor.displayName || instructor.user?.name || "Coach",
    bio: documentToPlainText(instructor.bio),
    specialties: Array.isArray(instructor.specialties) ? instructor.specialties.map(String) : [],
    certifications: Array.isArray(instructor.certifications) ? instructor.certifications.map(String) : [],
    imagePath: normalizePublicMediaPath(instructor.photo)
  };
}
function publicSchedule(schedule) {
  if (!schedule) return null;
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description || null,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    maxCapacity: schedule.maxCapacity,
    classType: publicClassType(schedule.classType),
    instructor: publicInstructor(schedule.instructor)
  };
}
function publicClassType(classType) {
  if (!classType) return null;
  return {
    id: classType.id,
    name: classType.name,
    description: documentToPlainText(classType.description),
    difficulty: classType.difficulty,
    duration: classType.duration,
    caloriesBurn: classType.caloriesBurn ?? null,
    equipmentNeeded: Array.isArray(classType.equipmentNeeded) ? classType.equipmentNeeded.map(String) : []
  };
}
function publicMembershipTier(tier, providerEnabled = false) {
  if (!tier) return null;
  return {
    id: tier.id,
    name: tier.name,
    description: documentToPlainText(tier.description),
    monthlyPrice: tier.monthlyPrice,
    annualPrice: tier.annualPrice,
    classCreditsPerMonth: tier.classCreditsPerMonth,
    accessHours: tier.accessHours,
    guestPasses: tier.guestPasses,
    personalTrainingSessions: tier.personalTrainingSessions,
    freezeAllowed: tier.freezeAllowed,
    contractLength: tier.contractLength,
    monthlyCheckoutAvailable: providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeMonthlyPriceId),
    annualCheckoutAvailable: providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeAnnualPriceId)
  };
}
function publicClassInstance(instance) {
  if (!instance) return null;
  const confirmedBookings = (instance.bookings ?? []).filter(
    (booking) => booking.status === "confirmed"
  ).length;
  const waitlistCount = (instance.bookings ?? []).filter(
    (booking) => booking.status === "waitlist"
  ).length;
  const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
  const instructor = instance.instructor ?? instance.classSchedule?.instructor ?? null;
  return {
    id: instance.id,
    startsAt: instance.date,
    schedule: publicSchedule(instance.classSchedule),
    instructor: publicInstructor(instructor),
    availability: {
      maxCapacity,
      confirmedBookings,
      waitlistCount,
      spotsRemaining: Math.max(maxCapacity - confirmedBookings, 0),
      state: maxCapacity > confirmedBookings ? "open" : "waitlist"
    }
  };
}
async function getPublicGymSettings(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const [settingsItems, organizations] = await Promise.all([
    publicContext(context).query.GymSettings.findMany({
      where: publicTenantWhere(organizationId),
      take: 1,
      query: `
        id
        name
        tagline
        logoIcon
        brandHue
        description
        address
        phone
        email
        currencyCode
        locale
        timezone
        countryCode
        hours
        heroEyebrow
        heroHeadline
        heroSubheadline
        heroImageUrl
        heroPrimaryCtaLabel
        heroPrimaryCtaHref
        heroSecondaryCtaLabel
        heroSecondaryCtaHref
        promoBanner
        footerTagline
        copyrightName
        facilityHeadline
        facilityDescription
        facilityHighlights
        heroStats
        contactTopics
      `
    }),
    organizationId ? publicContext(context).query.Organization.findMany({
      where: { id: { equals: organizationId } },
      take: 1,
      query: "timezone"
    }) : Promise.resolve([])
  ]);
  const settings = settingsItems[0];
  const organization3 = organizations[0];
  return projectPublicGymSettings(settings, organization3?.timezone);
}
async function getPublicGymClassTypes(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ name: "asc" }],
    query: `id name description { document } difficulty duration caloriesBurn equipmentNeeded`
  });
  return records.map(publicClassType);
}
async function getPublicGymClassType(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `id name description { document } difficulty duration caloriesBurn equipmentNeeded`
  });
  return publicClassType(record);
}
async function getPublicGymSchedules(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.ClassSchedule.findMany({
    where: publicTenantWhere(organizationId, {
      isActive: { equals: true },
      ...args.dayOfWeek ? { dayOfWeek: { equals: args.dayOfWeek } } : {},
      ...args.instructorId ? { instructor: { id: { equals: args.instructorId } } } : {}
    }),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    query: `
      id name description dayOfWeek startTime endTime maxCapacity
      classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
      instructor { id displayName bio { document } specialties certifications photo }
    `
  });
  return records.map(publicSchedule);
}
async function getPublicGymSchedule(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassSchedule.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id name description dayOfWeek startTime endTime maxCapacity isActive
      classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
      instructor { id displayName bio { document } specialties certifications photo }
    `
  });
  return record?.isActive ? publicSchedule(record) : null;
}
async function getPublicGymClassInstances(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const window = resolvePublicInstanceWindow(args.from, args.to);
  const records = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, {
      date: { gte: window.from, lte: window.to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...args.scheduleId ? { id: { equals: args.scheduleId } } : {}
      },
      ...args.instructorId ? {
        OR: [
          { instructor: { id: { equals: args.instructorId } } },
          { classSchedule: { instructor: { id: { equals: args.instructorId } } } }
        ]
      } : {}
    }),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ date: "asc" }],
    query: `
      id date maxCapacity
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity
        classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
        instructor { id displayName bio { document } specialties certifications photo }
      }
      bookings { id status }
    `
  });
  return records.map(publicClassInstance);
}
async function getPublicGymClassInstance(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id date maxCapacity isCancelled
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity isActive
        classType { id name description { document } difficulty duration caloriesBurn equipmentNeeded }
        instructor { id displayName bio { document } specialties certifications photo }
      }
      bookings { id status }
    `
  });
  if (!record || record.isCancelled || !record.classSchedule?.isActive || new Date(record.date).getTime() < Date.now()) {
    return null;
  }
  return publicClassInstance(record);
}
async function getPublicGymInstructors(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.Instructor.findMany({
    where: publicTenantWhere(organizationId, { isActive: { equals: true } }),
    take: normalizePublicLimit(args.limit),
    query: `id displayName bio { document } specialties certifications photo`
  });
  return records.map(publicInstructor).filter((instructor) => Boolean(instructor)).sort((left, right) => left.name.localeCompare(right.name));
}
async function getPublicGymInstructor(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const [record] = await publicContext(context).query.Instructor.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `id displayName bio { document } specialties certifications photo isActive`
  });
  return record?.isActive ? publicInstructor(record) : null;
}
async function publicCheckoutProviderEnabled(context, organizationId) {
  if (!organizationId) return false;
  const providers = await publicContext(context).query.PaymentProvider.findMany({
    where: publicTenantWhere(organizationId, {
      AND: [{ code: { equals: "pp_stripe" } }, { isInstalled: { equals: true } }]
    }),
    take: 1,
    query: "id"
  });
  return Boolean(providers[0]);
}
async function getPublicGymMembershipTiers(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const providerEnabled = await publicCheckoutProviderEnabled(context, organizationId);
  const records = await publicContext(context).query.MembershipTier.findMany({
    where: publicTenantWhere(organizationId),
    take: normalizePublicLimit(args.limit),
    orderBy: [{ monthlyPrice: "asc" }],
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId
    `
  });
  return records.map((record) => publicMembershipTier(record, providerEnabled));
}
async function getPublicGymMembershipTier(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const providerEnabled = await publicCheckoutProviderEnabled(context, organizationId);
  const [record] = await publicContext(context).query.MembershipTier.findMany({
    where: publicTenantWhere(organizationId, { id: { equals: args.id } }),
    take: 1,
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId
    `
  });
  return publicMembershipTier(record, providerEnabled);
}

// features/keystone/mutations/classBooking.ts
init_classCapacity();
async function checkClassAvailability(root, args, context) {
  const { classInstanceId } = args;
  const session = context.session;
  if (!session?.itemId || !session.data?.organization?.id) throw new Error("Authentication required");
  const organizationId = session.data.organization.id;
  const [classInstance] = await context.sudo().query.ClassInstance.findMany({
    where: {
      AND: [
        { id: { equals: classInstanceId } },
        { organization: { id: { equals: organizationId } } }
      ]
    },
    take: 1,
    query: "id date maxCapacity isCancelled organization { id } classSchedule { maxCapacity }"
  });
  if (!classInstance) {
    throw new Error("Class instance not found");
  }
  if (classInstance.isCancelled || new Date(classInstance.date).getTime() <= Date.now()) {
    return {
      available: false,
      spotsRemaining: 0,
      waitlistPosition: null,
      reason: classInstance.isCancelled ? "Class has been cancelled" : "Class has already started"
    };
  }
  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;
  const existingBookings = await context.sudo().query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      organization: { id: { equals: organizationId } },
      status: { equals: "confirmed" }
    }
  });
  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;
  let waitlistPosition = null;
  if (!available) {
    const waitlistCount = await context.sudo().query.ClassBooking.count({
      where: {
        classInstance: { id: { equals: classInstanceId } },
        organization: { id: { equals: organizationId } },
        status: { equals: "waitlist" }
      }
    });
    waitlistPosition = waitlistCount + 1;
  }
  return {
    available,
    spotsRemaining: Math.max(0, spotsRemaining),
    waitlistPosition,
    reason: available ? null : "Class is at capacity"
  };
}
function assertOperatorSession(context) {
  const session = context.session;
  if (!session?.itemId) throw new Error("Authentication required");
  if (session.data?.role?.canManageAllRecords) return;
  throw new Error("Operator access required");
}
async function bookClass(root, args, context) {
  if (!context.session?.itemId) throw new Error("Authentication required");
  const { classInstanceId, memberId } = args;
  const session = context.session;
  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error("Organization context required");
  const result = await createCapacityControlledBooking(context.prisma, {
    classInstanceId,
    memberId,
    actorUserId: session.itemId,
    actorOrganizationId: organizationId,
    actorCanManageAllRecords: Boolean(session.data?.role?.canManageAllRecords),
    capacityMode: "waitlist"
  });
  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: "id status waitlistPosition bookedAt"
  });
  return { booking, creditsRemaining: result.creditsRemaining };
}
async function promoteFromWaitlist(root, args, context) {
  assertOperatorSession(context);
  const organizationId = context.session?.data?.organization?.id;
  if (!organizationId) throw new Error("Organization context required");
  const result = await promoteCapacityControlledWaitlistBooking(
    context.prisma,
    args.classInstanceId,
    organizationId
  );
  if (!result.promoted || !result.bookingId) return result;
  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: "id status member { id name email }"
  });
  return { ...result, booking };
}

// features/integrations/payment/index.ts
var paymentProviderAdapters = {
  stripe: () => Promise.resolve().then(() => (init_stripe_adapter(), stripe_adapter_exports)),
  test: () => Promise.resolve().then(() => (init_test_adapter(), test_adapter_exports))
};
async function getPaymentProviderAdapter(adapterKey) {
  const loadAdapter = paymentProviderAdapters[adapterKey];
  if (!loadAdapter) throw new Error(`Unsupported payment provider adapter: ${adapterKey}`);
  const loadedAdapter = await loadAdapter();
  if (adapterKey === "stripe") return loadedAdapter.stripePaymentProviderAdapter;
  return loadedAdapter.testPaymentProviderAdapter;
}

// features/keystone/utils/paymentProviderAdapter.ts
var PROVIDER_QUERY = "id code adapterKey providerAccountId isInstalled organization { id }";
async function getPaymentProvider(context, providerCode, organizationId) {
  if (!organizationId) throw new Error("Payment provider organization is required.");
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      AND: [
        { code: { equals: providerCode } },
        { isInstalled: { equals: true } },
        { organization: { id: { equals: organizationId } } }
      ]
    },
    take: 1,
    query: PROVIDER_QUERY
  });
  const provider = providers[0];
  if (!provider) throw new Error(`Payment provider ${providerCode} is not installed.`);
  return provider;
}
async function getAdapterForProvider(context, providerCode, organizationId) {
  const provider = await getPaymentProvider(context, providerCode, organizationId);
  const adapterKey = process.env.PAYMENT_TEST_MODE === "true" && provider.adapterKey === "stripe" ? "test" : provider.adapterKey;
  const adapter = await getPaymentProviderAdapter(adapterKey);
  return { provider, adapter };
}

// features/keystone/mutations/membershipBillingAttempts.ts
var import_node_crypto4 = require("node:crypto");
init_membership_credits();
init_operational_notices();
init_classCapacity();
var LEASE_MS = 10 * 60 * 1e3;
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function membershipBillingRequestHash(operation, evidence) {
  return (0, import_node_crypto4.createHash)("sha256").update(canonicalJson({ operation, evidence })).digest("hex");
}
function normalizeScope(scope) {
  const idempotencyKey = scope.idempotencyKey.trim();
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("A unique billing idempotency key is required");
  }
  if (!/^[a-f0-9]{64}$/.test(scope.requestHash)) throw new Error("Billing request evidence is invalid");
  return { ...scope, idempotencyKey };
}
function providerIdempotencyKey(scope) {
  const digest2 = (0, import_node_crypto4.createHash)("sha256").update(`${scope.organizationId}:${scope.membershipId}:${scope.operation}:${scope.idempotencyKey}`).digest("hex");
  return `gym-membership-${scope.operation}:${digest2}`;
}
function uniqueAttemptWhere(scope) {
  return {
    organizationId_membershipId_operation_idempotencyKey: {
      organizationId: scope.organizationId,
      membershipId: scope.membershipId,
      operation: scope.operation,
      idempotencyKey: scope.idempotencyKey
    }
  };
}
function assertMatchingEvidence(attempt, requestHash) {
  if (attempt && attempt.requestHash !== requestHash) {
    throw new Error("This billing idempotency key was already used with different request evidence");
  }
}
async function isCompletedMembershipBillingAttempt(context, rawScope) {
  const scope = normalizeScope(rawScope);
  const attempt = await context.prisma.membershipBillingAttempt.findUnique({
    where: uniqueAttemptWhere(scope),
    select: { requestHash: true, status: true }
  });
  assertMatchingEvidence(attempt, scope.requestHash);
  return attempt?.status === "completed";
}
async function claimMembershipBillingAttempt(context, rawScope, expectedMembership = {}) {
  const scope = normalizeScope(rawScope);
  const claimToken = (0, import_node_crypto4.randomUUID)();
  return context.prisma.$transaction(async (transaction) => {
    await lockTransactionKey(transaction, `membership-billing:${scope.organizationId}:${scope.membershipId}`);
    const membership = await transaction.membership.findFirst({
      where: { id: scope.membershipId, organizationId: scope.organizationId },
      select: {
        id: true,
        status: true,
        autoRenew: true,
        stripeSubscriptionId: true,
        tierId: true,
        billingGeneration: true
      }
    });
    if (!membership) throw new Error("Membership not found");
    for (const [field, expected] of Object.entries(expectedMembership)) {
      if (membership[field] !== expected) {
        throw new Error("Membership changed while claiming the billing operation; retry");
      }
    }
    const existing = await transaction.membershipBillingAttempt.findUnique({
      where: uniqueAttemptWhere(scope)
    });
    assertMatchingEvidence(existing, scope.requestHash);
    if (existing?.status === "completed") {
      return {
        ...scope,
        attemptId: existing.id,
        claimToken: existing.claimToken,
        generation: existing.generation,
        providerIdempotencyKey: providerIdempotencyKey(scope),
        replay: true
      };
    }
    const now = /* @__PURE__ */ new Date();
    const active = await transaction.membershipBillingAttempt.findFirst({
      where: {
        organizationId: scope.organizationId,
        membershipId: scope.membershipId,
        status: "processing",
        leaseUntil: { gt: now }
      },
      select: { id: true }
    });
    if (active) throw new Error("Another billing operation is processing; retry shortly");
    await transaction.membershipBillingAttempt.updateMany({
      where: {
        organizationId: scope.organizationId,
        membershipId: scope.membershipId,
        status: "processing",
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }]
      },
      data: {
        status: "failed",
        leaseUntil: null,
        lastError: "Superseded by a newer membership billing generation"
      }
    });
    const generation = membership.billingGeneration + 1;
    const generationUpdate = await transaction.membership.updateMany({
      where: {
        id: scope.membershipId,
        organizationId: scope.organizationId,
        billingGeneration: membership.billingGeneration
      },
      data: { billingGeneration: generation }
    });
    if (generationUpdate.count !== 1) {
      throw new Error("Membership billing generation changed while claiming; retry");
    }
    const data = {
      requestHash: scope.requestHash,
      claimToken,
      generation,
      status: "processing",
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      lastError: "",
      requestedAt: now,
      completedAt: null
    };
    const attempt = existing ? await transaction.membershipBillingAttempt.update({ where: { id: existing.id }, data }) : await transaction.membershipBillingAttempt.create({
      data: {
        organizationId: scope.organizationId,
        membershipId: scope.membershipId,
        operation: scope.operation,
        idempotencyKey: scope.idempotencyKey,
        ...data
      }
    });
    return {
      ...scope,
      attemptId: attempt.id,
      claimToken,
      generation,
      providerIdempotencyKey: providerIdempotencyKey(scope),
      replay: false
    };
  });
}
async function finishMembershipBillingAttempt(context, claim, membershipData) {
  const finalized = await context.prisma.$transaction(async (transaction) => {
    await lockTransactionKey(transaction, `membership-billing:${claim.organizationId}:${claim.membershipId}`);
    const attempt = await transaction.membershipBillingAttempt.findUnique({ where: { id: claim.attemptId } });
    if (!attempt || attempt.organizationId !== claim.organizationId || attempt.membershipId !== claim.membershipId || attempt.operation !== claim.operation || attempt.idempotencyKey !== claim.idempotencyKey || attempt.requestHash !== claim.requestHash || attempt.status !== "processing" || attempt.claimToken !== claim.claimToken || attempt.generation !== claim.generation) return false;
    const membership = await transaction.membership.findFirst({ where: { id: claim.membershipId, organizationId: claim.organizationId } });
    const member = membership && await transaction.member.findFirst({ where: { organizationId: claim.organizationId, userId: membership.memberId } });
    if (!member) throw new Error("Membership member disappeared while finalizing billing");
    await lockTransactionKey(transaction, `member:${member.id}`);
    const membershipUpdate = await transaction.membership.updateMany({
      where: {
        id: claim.membershipId,
        organizationId: claim.organizationId,
        billingGeneration: claim.generation
      },
      data: membershipData
    });
    if (membershipUpdate.count !== 1) throw new Error("Membership disappeared while finalizing billing operation");
    const updated = await transaction.membership.findFirst({ where: { id: claim.membershipId } });
    await reviewFutureMembershipBookings(transaction, updated);
    await enqueueOperationalNotice(transaction, {
      organizationId: claim.organizationId,
      memberId: member.id,
      key: `billing:${claim.attemptId}`,
      kind: "membership",
      message: `Membership ${claim.operation} completed. Review your membership and affected bookings.`
    });
    const attemptUpdate = await transaction.membershipBillingAttempt.updateMany({
      where: {
        id: claim.attemptId,
        status: "processing",
        claimToken: claim.claimToken,
        generation: claim.generation
      },
      data: { status: "completed", leaseUntil: null, lastError: "", completedAt: /* @__PURE__ */ new Date() }
    });
    if (attemptUpdate.count !== 1) throw new Error("Billing operation claim was lost while finalizing");
    return true;
  });
  if (!finalized) throw new Error("Billing operation claim was replaced; retry with the same idempotency key");
}
async function failMembershipBillingAttempt(context, claim, error) {
  await context.prisma.membershipBillingAttempt.updateMany({
    where: {
      id: claim.attemptId,
      organizationId: claim.organizationId,
      membershipId: claim.membershipId,
      status: "processing",
      claimToken: claim.claimToken
    },
    data: {
      status: "failed",
      leaseUntil: null,
      lastError: error instanceof Error ? error.message.slice(0, 2e3) : "Billing operation failed"
    }
  });
}

// features/keystone/mutations/stripeSubscription.ts
var PROVIDER_CODE = "pp_stripe";
function actorOrganizationId(context) {
  const organizationId = context.session?.data?.organization?.id;
  if (typeof organizationId !== "string" || !organizationId) throw new Error("Organization context required");
  return organizationId;
}
function assertUserSessionAccess(context, userId) {
  const session = context.session;
  if (!session?.itemId) throw new Error("Authentication required");
  if (session.itemId === userId || session.data?.role?.canManageAllRecords) return;
  throw new Error("You cannot manage another member's billing");
}
async function getAuthorizedMembership(context, membershipId) {
  const organizationId = actorOrganizationId(context);
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id agreementSnapshot agreementHistory organization { id defaultCurrency } stripeSubscriptionId billingCycle status autoRenew nextBillingDate member { id stripeCustomerId organization { id } } tier { id freezeAllowed organization { id } }"
  });
  const membership = memberships[0];
  if (!membership || membership.organization?.id !== organizationId || membership.member?.organization?.id !== organizationId) {
    throw new Error("Membership not found");
  }
  assertUserSessionAccess(context, membership.member?.id);
  return membership;
}
async function getAdapter(context, organizationId) {
  return getAdapterForProvider(context, PROVIDER_CODE, organizationId);
}
function billingAttemptScope(organizationId, membershipId, operation, idempotencyKey, evidence) {
  return {
    organizationId,
    membershipId,
    operation,
    idempotencyKey,
    requestHash: membershipBillingRequestHash(operation, evidence)
  };
}
async function currentMembership(context, membershipId) {
  return context.db.Membership.findOne({ where: { id: membershipId } });
}
async function createStripeSetupIntent(root, { userId }, context) {
  const organizationId = actorOrganizationId(context);
  assertUserSessionAccess(context, userId);
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }"
  });
  const user = users[0];
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");
  const { adapter } = await getAdapter(context, organizationId);
  const intent = await adapter.createSetupIntent(user.stripeCustomerId);
  if (!intent.clientSecret) throw new Error("Payment provider did not return a setup client secret");
  return { clientSecret: intent.clientSecret, setupIntentId: intent.id };
}
async function cancelMembership(root, { membershipId, reason, idempotencyKey }, context) {
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer");
  const scope = billingAttemptScope(organizationId, membershipId, "cancel", idempotencyKey, { reason: normalizedReason });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership renewal cancellation already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Membership is already ${membership.status}`);
  if (!membership.autoRenew) throw new Error("Membership renewal is already cancelled");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership cancellation already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    const providerSubscription = await adapter.cancelSubscriptionAtPeriodEnd(
      membership.stripeSubscriptionId,
      attempt.providerIdempotencyKey
    );
    const providerPeriodEnd = providerSubscription.current_period_end ? new Date(providerSubscription.current_period_end * 1e3) : membership.nextBillingDate ? new Date(membership.nextBillingDate) : null;
    await finishMembershipBillingAttempt(context, attempt, {
      autoRenew: false,
      nextBillingDate: providerPeriodEnd,
      cancelReason: normalizedReason,
      cancelledAt: null
    });
    return { membership: await currentMembership(context, membershipId), message: "Membership renewal cancelled at the end of the paid period" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
}
async function freezeMembership(root, { membershipId, endDate, idempotencyKey }, context) {
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const endsAt = new Date(endDate);
  if (Number.isNaN(endsAt.getTime())) throw new Error("Freeze end date must be in the future");
  const scope = billingAttemptScope(organizationId, membershipId, "freeze", idempotencyKey, { endDate: endsAt.toISOString() });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  }
  if (membership.status !== "active") throw new Error("Only active memberships can be frozen");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot be frozen");
  if (!(membership.agreementSnapshot?.freezeAllowed ?? membership.tier?.freezeAllowed)) throw new Error("This membership tier does not allow freezes");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const startsAt = /* @__PURE__ */ new Date();
  const maximumEnd = new Date(startsAt.getTime() + 365 * 24 * 60 * 60 * 1e3);
  if (endsAt <= startsAt) throw new Error("Freeze end date must be in the future");
  if (endsAt > maximumEnd) throw new Error("Freeze duration cannot exceed one year");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    await adapter.pauseSubscription(membership.stripeSubscriptionId, endsAt, attempt.providerIdempotencyKey);
    await finishMembershipBillingAttempt(context, attempt, { status: "frozen", freezeStartDate: startsAt, freezeEndDate: endsAt });
    return { membership: await currentMembership(context, membershipId), message: "Membership frozen immediately" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
}
async function unfreezeMembership(root, { membershipId, idempotencyKey }, context) {
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const scope = billingAttemptScope(organizationId, membershipId, "unfreeze", idempotencyKey, {});
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  }
  if (membership.status !== "frozen") throw new Error("Only frozen memberships can be resumed");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    stripeSubscriptionId: membership.stripeSubscriptionId
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    await adapter.resumeSubscription(membership.stripeSubscriptionId, attempt.providerIdempotencyKey);
    await finishMembershipBillingAttempt(context, attempt, { status: "active", freezeStartDate: null, freezeEndDate: null });
    return { membership: await currentMembership(context, membershipId), message: "Membership resumed successfully" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
}
async function changeMembershipTier(root, { membershipId, newTierId, idempotencyKey }, context) {
  if (!context.session?.data?.role?.canManageAllRecords) {
    throw new Error("Contact the front desk to change membership tiers");
  }
  const membership = await getAuthorizedMembership(context, membershipId);
  const organizationId = actorOrganizationId(context);
  const scope = billingAttemptScope(organizationId, membershipId, "tier-change", idempotencyKey, { newTierId });
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Cannot change a ${membership.status} membership`);
  if (membership.tier?.id === newTierId) throw new Error("Membership is already on this tier");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot change tiers");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const newTiers = await context.sudo().query.MembershipTier.findMany({ where: { AND: [{ id: { equals: newTierId } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id name classCreditsPerMonth monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor freezeAllowed contractLength accessHours accessHoursJson guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }" });
  const newTier = newTiers[0];
  if (!newTier) throw new Error("New membership tier not found");
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) throw new Error("Stripe price not configured for this tier");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  try {
    const { adapter } = await getAdapter(context, organizationId);
    const planAmount = membership.billingCycle === "monthly" ? newTier.monthlyPrice : newTier.annualPrice;
    if (!Number.isFinite(planAmount) || planAmount < 0) throw new Error("Membership tier has an invalid price");
    await adapter.validateMembershipPrice({
      priceId: newPriceId,
      productId: newTier.stripeProductId,
      amount: tierAmountMinor(newTier, membership.billingCycle),
      currencyCode: membership.organization.defaultCurrency || "USD",
      billingCycle: membership.billingCycle === "annual" ? "annual" : "monthly"
    });
    await adapter.changeSubscriptionPrice(
      membership.stripeSubscriptionId,
      newPriceId,
      { tierId: newTierId, billingCycle: membership.billingCycle },
      attempt.providerIdempotencyKey
    );
    const agreementSnapshot = snapshotMembershipAgreement(newTier, membership.billingCycle, membership.organization.defaultCurrency || "USD");
    await finishMembershipBillingAttempt(context, attempt, {
      tierId: newTierId,
      agreementSnapshot,
      agreementHistory: [...Array.isArray(membership.agreementHistory) ? membership.agreementHistory : [], membership.agreementSnapshot]
    });
    await context.prisma.member.updateMany({
      where: { organizationId, userId: membership.member.id },
      data: { membershipTierId: newTierId }
    });
    return { membership: await currentMembership(context, membershipId), message: "Membership tier updated; included class allowance applies from the next service month" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
}
function validateReturnUrl(returnUrl) {
  const configuredBaseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configuredBaseUrl) throw new Error("Application base URL is not configured");
  const requested = new URL(returnUrl, configuredBaseUrl);
  const allowed2 = new URL(configuredBaseUrl);
  if (requested.origin !== allowed2.origin) throw new Error("Billing portal return URL must use the Gym origin");
  return requested.toString();
}
async function markPaymentRecoveryContacted(root, { membershipId }, context) {
  const session = context.session;
  if (!session?.itemId || !session.data?.role?.canManageAllRecords) {
    throw new Error("Payment recovery management permission required");
  }
  const organizationId = actorOrganizationId(context);
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id recoveryHistory organization { id }"
  });
  const membership = memberships[0];
  if (!membership) throw new Error("Membership not found");
  return context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`membership-recovery:${organizationId}:${membershipId}`}, 0))`;
    const current = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!current) throw new Error("Membership not found");
    return tx.membership.update({ where: { id: membershipId }, data: {
      recoveryHistory: [...Array.isArray(current.recoveryHistory) ? current.recoveryHistory : [], { contactedAt: (/* @__PURE__ */ new Date()).toISOString(), actorId: session.itemId }]
    } });
  });
}
async function getStripeBillingPortal(root, { userId, returnUrl }, context) {
  const organizationId = actorOrganizationId(context);
  assertUserSessionAccess(context, userId);
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }"
  });
  const user = users[0];
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");
  const safeReturnUrl = validateReturnUrl(returnUrl);
  const { adapter } = await getAdapter(context, organizationId);
  return adapter.createBillingPortalSession(user.stripeCustomerId, safeReturnUrl);
}

// features/keystone/mutations/paymentLifecycle.ts
var import_node_crypto6 = __toESM(require("node:crypto"));

// features/integrations/payment/lifecycle.ts
var import_node_crypto5 = require("node:crypto");
function createMembershipCheckoutIdempotencyKey(input) {
  return `gym-membership:${(0, import_node_crypto5.createHash)("sha256").update(input.userId).digest("hex")}`;
}
function mapStripeStatusToMembership(status, collectionPaused = false) {
  if (collectionPaused) return "frozen";
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past-due";
    case "canceled":
      return "cancelled";
    case "paused":
      return "frozen";
    default:
      return "past-due";
  }
}

// features/integrations/payment/membership-checkout-core.ts
var PROVIDER_CODE2 = "pp_stripe";
var REUSABLE_SESSION_STATUSES = /* @__PURE__ */ new Set(["pending", "requires_action"]);
function assertSingleMerchantCheckout(providers, organizationId) {
  if (providers.length !== 1 || providers[0].organization?.id !== organizationId || providers[0].providerAccountId) {
    throw new Error("Online checkout requires exactly one installed Stripe merchant organization; connected-account checkout is not supported");
  }
}
function tierPriceId(tier, billingCycle) {
  const configured = billingCycle === "annual" ? tier.stripeAnnualPriceId : tier.stripeMonthlyPriceId;
  if (configured) return configured;
  if (process.env.PAYMENT_TEST_MODE === "true") return `test_price_${tier.id}_${billingCycle}`;
  throw new Error(`Payment provider price is not configured for the ${billingCycle} plan on ${tier.name}.`);
}
async function ensureMemberProfile(context, user) {
  const ctx = context.sudo();
  const existing = await ctx.query.Member.findMany({
    where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization.id } } }] },
    take: 1,
    query: "id status"
  });
  if (existing[0]) {
    if (existing[0].status !== "active") {
      throw new Error("Member profile must be active before membership checkout.");
    }
    return existing[0].id;
  }
  const created = await ctx.query.Member.createOne({
    data: {
      name: user.name,
      email: user.email,
      ...user.phone ? { phone: user.phone } : {},
      status: "active",
      joinDate: (/* @__PURE__ */ new Date()).toISOString(),
      organization: { connect: { id: user.organization.id } },
      user: { connect: { id: user.id } }
    },
    query: "id"
  });
  return created.id;
}
async function initiateMembershipCheckoutForUser(input) {
  const ctx = input.context.sudo();
  const user = await ctx.query.User.findOne({
    where: { id: input.userId },
    query: "id name email phone stripeCustomerId organization { id }"
  });
  if (!user) throw new Error("User account not found.");
  const tier = await ctx.query.MembershipTier.findOne({
    where: { id: input.tierId },
    query: "id name monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor classCreditsPerMonth freezeAllowed contractLength accessHours accessHoursJson guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }"
  });
  if (!tier) throw new Error("Membership tier not found.");
  if (!user.organization?.id) throw new Error("User account is not assigned to an organization.");
  if (tier.organization?.id !== user.organization.id) throw new Error("Membership tier is not in the user's organization.");
  const [currentMemberships, legacySubscriptions] = await Promise.all([
    ctx.query.Membership.findMany({
      where: {
        AND: [
          { member: { id: { equals: user.id } } },
          { organization: { id: { equals: user.organization.id } } },
          { status: { in: ["active", "frozen", "past-due"] } }
        ]
      },
      take: 1,
      query: "id status"
    }),
    ctx.query.Subscription.findMany({
      where: {
        AND: [
          { member: { user: { id: { equals: user.id } } } },
          { organization: { id: { equals: user.organization.id } } },
          { status: { in: ["active", "past_due", "paused"] } }
        ]
      },
      take: 1,
      query: "id status"
    })
  ]);
  if (currentMemberships[0] || legacySubscriptions[0]) {
    throw new Error("This account already has a current membership. Contact the front desk for plan changes.");
  }
  const settings = await ctx.query.GymSettings.findMany({
    where: { organization: { id: { equals: user.organization.id } } },
    take: 1,
    query: "id currencyCode"
  });
  const currencyCode = String(settings[0]?.currencyCode || "USD").toUpperCase();
  if (currencyCode !== "USD") {
    throw new Error("This initial launch supports Stripe membership checkout in USD only.");
  }
  const { provider, adapter } = await getAdapterForProvider(input.context, PROVIDER_CODE2, user.organization.id);
  if (provider.adapterKey === "stripe" && process.env.PAYMENT_TEST_MODE !== "true") {
    const merchants = await ctx.query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: PROVIDER_CODE2 } }, { adapterKey: { equals: "stripe" } }, { isInstalled: { equals: true } }] },
      take: 2,
      query: "id providerAccountId organization { id }"
    });
    assertSingleMerchantCheckout(merchants, user.organization.id);
  }
  const amount = tierAmountMinor(tier, input.billingCycle);
  const agreementSnapshot = snapshotMembershipAgreement(tier, input.billingCycle, currencyCode);
  const priceId = tierPriceId(tier, input.billingCycle);
  await adapter.validateMembershipPrice({
    priceId,
    productId: tier.stripeProductId,
    amount,
    currencyCode,
    billingCycle: input.billingCycle
  });
  const idempotencyKey = createMembershipCheckoutIdempotencyKey({
    userId: user.id,
    tierId: tier.id,
    billingCycle: input.billingCycle
  });
  const existing = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ user: { id: { equals: user.id } } }, { organization: { id: { equals: user.organization.id } } }] },
    orderBy: [{ createdAt: "desc" }],
    take: 1,
    query: "id idempotencyKey status checkoutUrl expiresAt billingCycle amount currencyCode data provisioningLockedUntil membershipTier { id }"
  });
  const existingSession = existing[0];
  const existingMatchesRequest = existingSession?.membershipTier?.id === tier.id && existingSession?.billingCycle === input.billingCycle && existingSession?.amount === amount && existingSession?.currencyCode === currencyCode && existingSession?.data?.priceId === priceId && existingSession?.data?.productId === tier.stripeProductId;
  const checkoutLeaseIsActive = existingSession?.status === "processing" && existingSession?.provisioningLockedUntil && new Date(existingSession.provisioningLockedUntil).getTime() > Date.now();
  if (checkoutLeaseIsActive) {
    throw new Error("Membership checkout is already being prepared for this account.");
  }
  const existingIsLive = existingSession && REUSABLE_SESSION_STATUSES.has(existingSession.status) && (!existingSession.expiresAt || new Date(existingSession.expiresAt).getTime() > Date.now());
  if (existingIsLive && !existingMatchesRequest) {
    throw new Error("A different membership checkout is already in progress for this account.");
  }
  if (existingIsLive && existingSession.checkoutUrl) {
    return {
      id: existingSession.id,
      status: existingSession.status,
      checkoutUrl: existingSession.checkoutUrl,
      reused: true
    };
  }
  if (existingSession?.status !== "completed" && existingSession?.expiresAt && new Date(existingSession.expiresAt).getTime() <= Date.now()) {
    await ctx.query.PaymentSession.updateOne({
      where: { id: existingSession.id },
      data: { status: "expired" },
      query: "id"
    });
  }
  await ensureMemberProfile(input.context, user);
  const previousAttempt = Number(existingSession?.data?.checkoutAttempt) || 0;
  const reuseProviderAttempt = existingMatchesRequest && ["pending", "processing", "failed"].includes(existingSession?.status);
  const checkoutAttempt = reuseProviderAttempt ? Math.max(previousAttempt, 1) : previousAttempt + 1;
  const providerIdempotencyKey2 = reuseProviderAttempt ? /:attempt:\d+$/.test(existingSession.idempotencyKey) ? existingSession.idempotencyKey : `${existingSession.idempotencyKey}:attempt:${checkoutAttempt}` : `${idempotencyKey}:attempt:${checkoutAttempt}`;
  const checkoutLeaseUntil = new Date(Date.now() + 10 * 60 * 1e3);
  if (existingSession && reuseProviderAttempt) {
    const claim = await input.context.prisma.paymentSession.updateMany({
      where: {
        id: existingSession.id,
        OR: [
          { provisioningLockedUntil: null },
          { provisioningLockedUntil: { lt: /* @__PURE__ */ new Date() } }
        ]
      },
      data: { status: "processing", provisioningLockedUntil: checkoutLeaseUntil }
    });
    if (!claim.count) throw new Error("Membership checkout is already being prepared for this account.");
  }
  const paymentSession = existingSession && reuseProviderAttempt ? await ctx.query.PaymentSession.updateOne({
    where: { id: existingSession.id },
    data: { status: "processing", provisioningLockedUntil: checkoutLeaseUntil.toISOString(), lastError: "" },
    query: "id"
  }) : await ctx.query.PaymentSession.createOne({
    data: {
      organization: { connect: { id: user.organization.id } },
      user: { connect: { id: user.id } },
      membershipTier: { connect: { id: tier.id } },
      paymentProvider: { connect: { id: provider.id } },
      status: "processing",
      provisioningLockedUntil: checkoutLeaseUntil.toISOString(),
      billingCycle: input.billingCycle,
      amount,
      currencyCode,
      idempotencyKey: providerIdempotencyKey2,
      data: { checkoutAttempt, priceId, productId: tier.stripeProductId, agreementSnapshot }
    },
    query: "id"
  });
  try {
    const providerSession = await adapter.createMembershipCheckout({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      tierId: tier.id,
      billingCycle: input.billingCycle,
      amount,
      currencyCode,
      priceId,
      customerId: user.stripeCustomerId,
      successUrl: `${input.baseUrl}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${input.baseUrl}/join/cancelled?tier=${tier.id}`,
      idempotencyKey: providerIdempotencyKey2
    });
    if (!user.stripeCustomerId) {
      await ctx.query.User.updateOne({
        where: { id: user.id },
        data: { stripeCustomerId: providerSession.providerCustomerId },
        query: "id"
      });
    }
    await input.context.prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "processing" },
      data: {
        status: "requires_action",
        providerSessionId: providerSession.providerSessionId,
        providerCustomerId: providerSession.providerCustomerId,
        checkoutUrl: providerSession.checkoutUrl,
        expiresAt: providerSession.expiresAt ? new Date(providerSession.expiresAt) : null,
        provisioningLockedUntil: null
      }
    });
    return {
      id: paymentSession.id,
      status: "requires_action",
      checkoutUrl: providerSession.checkoutUrl,
      reused: false
    };
  } catch (error) {
    await input.context.prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "processing" },
      data: {
        status: "failed",
        failedAt: /* @__PURE__ */ new Date(),
        lastError: error instanceof Error ? error.message : "Payment provider checkout failed.",
        provisioningLockedUntil: null
      }
    });
    throw error;
  }
}

// features/integrations/payment/provision-membership.ts
init_classCapacity();
init_membership_credits();
async function provisionMembershipFromCheckoutSession(providerSessionId, expectedOrganizationId, context) {
  const ctx = context.sudo();
  const known = await ctx.query.PaymentSession.findMany({ where: { providerSessionId: { equals: providerSessionId } }, take: 2, query: "id organization { id }" });
  if (known.length > 1) throw new Error("Provider session is ambiguously assigned");
  const organizationId = expectedOrganizationId || known[0]?.organization?.id;
  if (!organizationId || known[0] && known[0].organization.id !== organizationId) throw new Error("Provider session organization does not match");
  const { provider, adapter } = await getAdapterForProvider(ctx, "pp_stripe", organizationId);
  const session = await adapter.retrieveMembershipCheckout(providerSessionId);
  if (session.id !== providerSessionId) throw new Error("Provider returned a different checkout session");
  const key = session.metadata?.paymentSessionKey;
  if (!key) throw new Error("Checkout metadata is missing payment session key");
  const legacyKey = key.replace(/:attempt:\d+$/, "");
  const locals = await ctx.query.PaymentSession.findMany({
    where: { AND: [{ organization: { id: { equals: organizationId } } }, { OR: [{ idempotencyKey: { equals: key } }, { idempotencyKey: { equals: legacyKey } }] }] },
    take: 2,
    query: "id idempotencyKey providerSessionId status amount currencyCode billingCycle data organization { id } user { id } membershipTier { id name }"
  });
  const local = locals.find((entry) => entry.idempotencyKey === key) || locals[0];
  assertCheckoutCorrelation(local, session, organizationId);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) throw new Error("Checkout subscription is missing");
  const subscription = await adapter.retrieveSubscription(subscriptionId);
  if (subscription.id !== subscriptionId) throw new Error("Provider returned a different subscription");
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionCustomer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId || subscriptionCustomer !== customerId) throw new Error("Subscription customer does not match checkout");
  const billingCycle = local.billingCycle === "annual" ? "annual" : "monthly";
  const status = mapStripeStatusToMembership(subscription.status, Boolean(subscription.pause_collection));
  const startDate = new Date(subscription.current_period_start * 1e3);
  const nextBillingDate = new Date(subscription.current_period_end * 1e3);
  if (!Number.isFinite(startDate.getTime()) || nextBillingDate <= startDate) throw new Error("Subscription service period is invalid");
  const membershipId = await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `stripe-subscription:${organizationId}:${subscriptionId}`);
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${local.user.id}`);
    const currentSession = await tx.paymentSession.findFirst({ where: { id: local.id, organizationId } });
    if (!currentSession || currentSession.providerSessionId && currentSession.providerSessionId !== session.id) throw new Error("Checkout attempt changed during reconciliation");
    const user = await tx.user.findFirst({ where: { id: local.user.id, organizationId } });
    if (!user || user.stripeCustomerId && user.stripeCustomerId !== customerId) throw new Error("Checkout customer does not match user");
    const member = await tx.member.findFirst({ where: { userId: user.id, organizationId } });
    if (!member) throw new Error("Checkout member profile is not available; retry reconciliation");
    await lockTransactionKey(tx, `member:${member.id}`);
    const existing = await tx.membership.findFirst({ where: { memberId: user.id, organizationId } });
    const replacingEndedAgreement = existing && existing.stripeSubscriptionId !== subscriptionId && ["cancelled", "expired"].includes(existing.status) && new Date(currentSession.data?.agreementSnapshot?.acceptedAt || 0) > new Date(existing.agreementSnapshot?.acceptedAt || 0);
    if (existing && existing.stripeSubscriptionId !== subscriptionId && !replacingEndedAgreement) throw new Error("Another subscription already owns this membership; reconciliation required");
    if (currentSession.status === "completed" && existing) return existing.id;
    const snapshot = currentSession.data?.agreementSnapshot;
    if (!snapshot?.version) throw new Error("Checkout agreement snapshot is missing; operator reconciliation required");
    const data = {
      organizationId,
      memberId: user.id,
      tierId: local.membershipTier.id,
      status,
      billingCycle,
      startDate,
      nextBillingDate,
      autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
      stripeSubscriptionId: subscriptionId,
      agreementSnapshot: !replacingEndedAgreement && existing?.agreementSnapshot?.version ? existing.agreementSnapshot : snapshot,
      creditPeriodStart: !replacingEndedAgreement && existing?.creditPeriodStart || startDate,
      creditPeriodEnd: !replacingEndedAgreement && existing?.creditPeriodEnd || nextBillingDate,
      ...existing && !replacingEndedAgreement ? {} : { classCreditsRemaining: status === "active" ? snapshot.classCreditsPerMonth : 0 }
    };
    const membership = existing ? await tx.membership.update({ where: { id: existing.id }, data: replacingEndedAgreement ? { ...data, agreementHistory: [...existing.agreementHistory || [], existing.agreementSnapshot] } : { agreementSnapshot: data.agreementSnapshot, creditPeriodStart: data.creditPeriodStart, creditPeriodEnd: data.creditPeriodEnd } }) : await tx.membership.create({ data });
    if (membership.status === "active" && new Date(membership.creditPeriodStart) <= /* @__PURE__ */ new Date() && new Date(membership.creditPeriodEnd) > /* @__PURE__ */ new Date()) await ensureMonthlyCreditGrant(tx, membership, /* @__PURE__ */ new Date());
    await tx.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    await tx.member.update({ where: { id: member.id }, data: { membershipTierId: membership.tierId } });
    const projection = await tx.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
    if (projection && projection.organizationId !== organizationId) throw new Error("Subscription projection organization mismatch");
    if (!projection) await tx.subscription.create({ data: {
      organizationId,
      memberId: member.id,
      membershipTierId: membership.tierId,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      startDate,
      nextBillingDate,
      status: status === "active" ? "active" : status === "frozen" ? "paused" : status === "past-due" ? "past_due" : "cancelled"
    } });
    await tx.paymentSession.update({ where: { id: local.id }, data: {
      status: "completed",
      provisioningLockedUntil: null,
      completedAt: /* @__PURE__ */ new Date(),
      providerSessionId: session.id,
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      data: { ...currentSession.data, providerSubscriptionId: subscriptionId, paymentStatus: session.payment_status }
    } });
    return membership.id;
  });
  return { membershipId, paymentProviderId: provider.id, paymentSessionId: local.id, subscriptionId, tierName: local.data?.agreementSnapshot?.tierName || local.membershipTier.name, billingCycle };
}

// features/keystone/mutations/paymentLifecycle.ts
var PROVIDER_CODE3 = "pp_stripe";
function reconcileProviderRefundCumulative(paymentAmount, currentRefundAmount, startingRefundAmount, attemptAmount) {
  const intendedCumulativeRefund = startingRefundAmount + attemptAmount;
  const totalRefunded = Math.max(currentRefundAmount ?? 0, intendedCumulativeRefund);
  if (![paymentAmount, currentRefundAmount ?? 0, startingRefundAmount, attemptAmount, totalRefunded].every(Number.isInteger) || startingRefundAmount < 0 || attemptAmount <= 0 || totalRefunded > paymentAmount) {
    throw new Error("Cumulative refund exceeds the payment total");
  }
  return totalRefunded;
}
function requireSession(context) {
  const session = context.session;
  if (!session?.itemId) throw new Error("Authentication required");
  return session;
}
async function initiateMembershipCheckout(root, { tierId, billingCycle }, context) {
  const session = requireSession(context);
  const cycle = billingCycle === "annual" ? "annual" : billingCycle === "monthly" ? "monthly" : null;
  if (!cycle) throw new Error("Billing cycle must be monthly or annual");
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!baseUrl) throw new Error("Application base URL is not configured");
  return initiateMembershipCheckoutForUser({
    context,
    userId: session.itemId,
    tierId,
    billingCycle: cycle,
    baseUrl
  });
}
async function completeMembershipCheckout(_root, { providerSessionId }, context) {
  const session = requireSession(context);
  const organizationId = session.data?.organization?.id;
  const normalizedSessionId = providerSessionId.trim();
  if (!organizationId || !normalizedSessionId || normalizedSessionId.length > 500) {
    throw new Error("Checkout session is invalid");
  }
  const owned = await context.sudo().query.PaymentSession.findMany({
    where: {
      AND: [
        { providerSessionId: { equals: normalizedSessionId } },
        { organization: { id: { equals: organizationId } } },
        { user: { id: { equals: session.itemId } } }
      ]
    },
    take: 1,
    query: "id"
  });
  if (!owned[0]) throw new Error("Checkout session was not found for this account");
  return provisionMembershipFromCheckoutSession(normalizedSessionId, organizationId, context);
}
async function refundGymPayment(root, { paymentId, amount, reason, idempotencyKey }, context) {
  const session = requireSession(context);
  if (!session.data?.role?.canManageAllRecords) throw new Error("Payment management permission required");
  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error("Organization context required");
  const requestId = idempotencyKey.trim();
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Refund reason must be 500 characters or fewer");
  if (requestId.length < 12 || requestId.length > 200) throw new Error("A unique refund idempotency key is required");
  const requestKey = `gym-refund:${paymentId}:${requestId}`;
  const { adapter } = await getAdapterForProvider(context, PROVIDER_CODE3, organizationId);
  const deadline = Date.now() + 3e4;
  let claim;
  while (Date.now() < deadline) {
    const refundToken = import_node_crypto6.default.randomUUID();
    claim = await context.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${paymentId}`}, 0))) AS acquired`;
      const payment = await transaction.gymPayment.findFirst({
        where: { id: paymentId, organizationId }
      });
      if (!payment) throw new Error("Payment not found");
      if (!payment.stripePaymentIntentId) throw new Error("Payment has no provider payment intent");
      const existing = await transaction.gymRefundAttempt.findUnique({ where: { organizationId_requestKey: { organizationId, requestKey } } });
      if (existing && amount != null && amount !== existing.amount) {
        throw new Error("This refund idempotency key was already used with a different amount");
      }
      if (existing?.status === "succeeded") return { done: true, paymentId: payment.id, attemptId: existing.id, refundAmount: existing.amount };
      const alreadyRefunded = Math.max(0, Math.min(payment.amount, payment.refundAmount ?? 0));
      const startingRefundAmount = existing?.startingRefundAmount ?? alreadyRefunded;
      const remaining = payment.amount - startingRefundAmount;
      const refundAmount = existing?.amount ?? amount ?? remaining;
      if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
        throw new Error("Refund amount must be a positive minor-unit amount within the remaining payment total");
      }
      const intendedCumulativeRefund = startingRefundAmount + refundAmount;
      if (existing && alreadyRefunded >= intendedCumulativeRefund) {
        await transaction.gymRefundAttempt.update({
          where: { id: existing.id },
          data: {
            status: "succeeded",
            providerRefundId: existing.providerRefundId || "reconciled-cumulative-provider-evidence",
            completedAt: /* @__PURE__ */ new Date(),
            lastError: ""
          }
        });
        await transaction.gymPayment.update({
          where: { id: payment.id },
          data: { refundLockUntil: null, refundLockToken: "" }
        });
        return { done: true, paymentId: payment.id, attemptId: existing.id, refundAmount: existing.amount };
      }
      if (payment.status !== "succeeded") throw new Error("Only succeeded payments can be refunded");
      const lockActive = Boolean(payment.refundLockUntil && payment.refundLockUntil > /* @__PURE__ */ new Date());
      if (lockActive) return { wait: true };
      const attempt = existing ? await transaction.gymRefundAttempt.update({
        where: { id: existing.id },
        data: { status: "processing", claimToken: refundToken, lastError: "", requestedAt: /* @__PURE__ */ new Date() }
      }) : await transaction.gymRefundAttempt.create({
        data: {
          organizationId,
          paymentId: payment.id,
          requestKey,
          claimToken: refundToken,
          amount: refundAmount,
          startingRefundAmount,
          status: "processing",
          requestedAt: /* @__PURE__ */ new Date()
        }
      });
      await transaction.gymPayment.update({ where: { id: payment.id }, data: { refundLockUntil: new Date(Date.now() + 10 * 60 * 1e3), refundLockToken: refundToken } });
      return {
        done: false,
        paymentId: payment.id,
        attemptId: attempt.id,
        claimToken: refundToken,
        refundAmount,
        startingRefundAmount,
        paymentIntentId: payment.stripePaymentIntentId
      };
    });
    if (!claim.wait) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claim || claim.wait) throw new Error("Refund remained busy; retry with the same idempotency key");
  if (claim.done) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  try {
    const providerRefund = await adapter.refundPayment(claim.paymentIntentId, claim.refundAmount, requestKey);
    if (providerRefund.status !== "succeeded") {
      throw new Error(`Refund was not confirmed by the payment provider (status: ${providerRefund.status || "unknown"})`);
    }
    const finalized = await context.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${claim.paymentId}`}, 0))) AS acquired`;
      const payment = await transaction.gymPayment.findFirst({
        where: { id: claim.paymentId, organizationId }
      });
      const attempt = await transaction.gymRefundAttempt.findUnique({ where: { id: claim.attemptId } });
      if (!payment || !attempt || attempt.status !== "processing" || attempt.claimToken !== claim.claimToken || payment.refundLockToken !== claim.claimToken) return false;
      const totalRefunded = reconcileProviderRefundCumulative(
        payment.amount,
        payment.refundAmount,
        claim.startingRefundAmount,
        claim.refundAmount
      );
      const attemptUpdate = await transaction.gymRefundAttempt.updateMany({
        where: { id: attempt.id, status: "processing", claimToken: claim.claimToken },
        data: { status: "succeeded", providerRefundId: providerRefund.id, completedAt: /* @__PURE__ */ new Date(), lastError: "" }
      });
      if (!attemptUpdate.count) return false;
      const refundedAt = /* @__PURE__ */ new Date();
      const fullyRefunded = totalRefunded >= payment.amount;
      const paymentUpdate = await transaction.gymPayment.updateMany({
        where: { id: payment.id, refundLockToken: claim.claimToken },
        data: {
          status: fullyRefunded ? "refunded" : "succeeded",
          refundAmount: totalRefunded,
          refundedAt,
          refundReason: normalizedReason,
          refundLockUntil: null,
          refundLockToken: ""
        }
      });
      if (paymentUpdate.count === 1 && payment.stripePaymentIntentId) {
        const membershipPayments = await transaction.membershipPayment.findMany({
          where: {
            organizationId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            status: { in: ["completed", "refunded"] }
          }
        });
        for (const membershipPayment of membershipPayments) {
          const membershipRefundAmount = Math.max(membershipPayment.refundAmount ?? 0, totalRefunded);
          const membershipFullyRefunded = membershipRefundAmount >= membershipPayment.amount;
          await transaction.membershipPayment.update({
            where: { id: membershipPayment.id },
            data: {
              status: membershipFullyRefunded ? "refunded" : "completed",
              refundAmount: Math.min(membershipRefundAmount, membershipPayment.amount),
              refundedAt,
              refundReason: normalizedReason
            }
          });
        }
      }
      return paymentUpdate.count === 1;
    });
    if (!finalized) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  } catch (error) {
    await context.prisma.$transaction(async (transaction) => {
      await transaction.gymRefundAttempt.updateMany({ where: { id: claim.attemptId, status: "processing", claimToken: claim.claimToken }, data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 2e3) : "Refund provider failed" } });
      await transaction.gymPayment.updateMany({ where: { id: claim.paymentId, refundLockToken: claim.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    });
    throw error;
  }
  return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
}

// features/keystone/lib/membership-access-hours.ts
var weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function minute(value) {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) throw new Error("Access hours need a supported time range; ask staff to review the policy");
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) throw new Error("Access hours have an invalid clock hour");
    hour = hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23 || !match[2]) throw new Error("Use HH:mm for 24-hour access times");
  return hour * 60 + Number(match[2] || 0);
}
function parseAccessWindow(value) {
  if (typeof value !== "string") throw new Error("Access hours are not configured; staff review is required");
  const normalized = value.trim().toLowerCase();
  if (normalized === "24/7" || normalized === "24 hours") return "all";
  if (normalized === "closed") return "closed";
  const range = normalized.split(/\s*[-–—]\s*/);
  if (range.length !== 2) throw new Error("Access hours need a supported time range; staff review is required");
  const start = minute(range[0]);
  const end = minute(range[1]);
  if (start === end) throw new Error("Equal access opening and closing times are ambiguous; use 24/7 or Closed");
  return { start, end };
}
function localClock(at, timezone) {
  if (!Number.isFinite(at.getTime()) || !timezone) throw new Error("A valid facility timezone and admission time are required");
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  } catch {
    throw new Error("Facility timezone is invalid; staff review is required");
  }
  const get = (name) => parts.find((part) => part.type === name)?.value || "";
  return { day: get("weekday").toLowerCase(), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
function includes(window, current) {
  if (window === "all") return true;
  if (window === "closed") return false;
  return window.start < window.end ? current >= window.start && current < window.end : current >= window.start || current < window.end;
}
function isWithinOperatingHours(hours, at, timezone) {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) throw new Error("Facility operating hours are not configured; staff review is required");
  const clock = localClock(at, timezone);
  const daily = Object.fromEntries(Object.entries(hours).map(([key, value]) => [key.toLowerCase(), value]));
  const today = parseAccessWindow(daily[clock.day]);
  const previousDay = weekdays[(weekdays.indexOf(clock.day) + 6) % 7];
  const previous = parseAccessWindow(daily[previousDay]);
  const todayOpen = today === "all" || today !== "closed" && (today.start < today.end ? clock.minute >= today.start && clock.minute < today.end : clock.minute >= today.start);
  const overnightCarry = previous !== "all" && previous !== "closed" && previous.start > previous.end && clock.minute < previous.end;
  return todayOpen || overnightCarry;
}
function membershipAccessWindow(agreement) {
  const published = typeof agreement?.accessHours === "string" ? agreement.accessHours.trim().toLowerCase() : "";
  if (published === "staffed hours") return "all";
  if (published && published !== "limited") return parseAccessWindow(published);
  const configuration = agreement?.accessHoursJson;
  if (configuration?.type === "24/7") return "all";
  if (configuration?.hours) return parseAccessWindow(configuration.hours);
  if (published === "limited" || configuration?.type === "limited") return { start: 6 * 60, end: 22 * 60 };
  throw new Error("Membership access hours are unknown; staff review is required");
}
async function assertFacilityAccessHours(tx, organizationId, membership, at) {
  if (!organizationId || membership && membership.organizationId !== organizationId) throw new Error("Facility admission organization mismatch");
  const settings = await tx.gymSettings.findMany({ where: { organizationId }, take: 2, select: { timezone: true, hours: true } });
  if (settings.length !== 1) throw new Error("Facility operating configuration requires staff review");
  const organization3 = settings[0].timezone ? null : await tx.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  const timezone = settings[0].timezone || organization3?.timezone;
  if (!isWithinOperatingHours(settings[0].hours, at, timezone)) throw new Error("The facility is closed at this admission time");
  if (!membership) return;
  const agreement = membership.agreementSnapshot?.version ? membership.agreementSnapshot : membership.tier || await tx.membershipTier.findFirst({ where: { id: membership.tierId, organizationId }, select: { accessHours: true, accessHoursJson: true } });
  if (!includes(membershipAccessWindow(agreement), localClock(at, timezone).minute)) throw new Error("This admission is outside the membership access hours");
}

// features/keystone/mutations/trainerQualifications.ts
function assertInstructorQualifications(instructor, at) {
  const entries = Array.isArray(instructor.certifications) ? instructor.certifications : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || entry.required !== true) continue;
    const expiresAt = new Date(entry.expiresAt);
    const verifiedAt = new Date(entry.verifiedAt);
    if (!entry.name || !entry.evidenceReference || !Number.isFinite(expiresAt.getTime()) || expiresAt <= at || !Number.isFinite(verifiedAt.getTime()) || verifiedAt > at || entry.revoked === true) throw new Error("A required instructor qualification is expired, revoked or unverified");
  }
}

// features/keystone/mutations/gymLifecycle.ts
init_membership_credits();
init_operational_policy();
init_operational_notices();
init_classCapacity();
function assertFacilityStaff(actor2) {
  if (actor2.canManageAllRecords || actor2.canManageCheckIns || actor2.canManageFacilities || actor2.trustedKiosk) return;
  throw new Error("Facility check-in management permission required");
}
function assertActorOrganization(actor2, organizationId) {
  if (!organizationId || !actor2.organizationId || actor2.organizationId !== organizationId) {
    throw new Error("Actor is not in the record organization");
  }
}
function assertOwnerOrOperator(actor2, ownerUserId) {
  if (actor2.canManageAllRecords || actor2.trustedKiosk || actor2.userId === ownerUserId) return;
  throw new Error("You cannot manage another member's records");
}
async function cancelCapacityControlledBooking(prisma, input) {
  const result = await prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId);
    const identity = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      select: { classInstanceId: true, memberId: true }
    });
    if (!identity?.classInstanceId || !identity.memberId) throw new Error("Booking not found");
    await lockTransactionKey(transaction, `class-instance:${identity.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${identity.memberId}`);
    const booking = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      include: {
        classInstance: { select: { id: true, date: true, organizationId: true } },
        member: {
          include: {
            user: {
              include: {
                membership: {
                  include: { tier: { select: { classCreditsPerMonth: true } } }
                }
              }
            }
          }
        }
      }
    });
    if (!booking?.member?.user?.id || !booking.classInstance) {
      throw new Error("Booking owner or class instance is missing");
    }
    assertActorOrganization(input.actor, booking.classInstance.organizationId);
    assertActorOrganization(input.actor, booking.member.organizationId);
    assertOwnerOrOperator(input.actor, booking.member.user.id);
    if (booking.status === "cancelled") {
      return {
        bookingId: booking.id,
        classInstanceId: booking.classInstance.id,
        cancelled: false,
        releasedConfirmedSpot: false,
        promotion: { promoted: false, message: "No confirmed spot was released" }
      };
    }
    if (!["confirmed", "waitlist"].includes(booking.status)) {
      throw new Error(`Booking cannot be cancelled from ${booking.status}`);
    }
    if (booking.classInstance.date.getTime() <= Date.now()) {
      throw new Error("A class booking cannot be cancelled after the class starts");
    }
    await transaction.classBooking.update({
      where: { id: booking.id },
      data: {
        status: "cancelled",
        activeBookingKey: null,
        cancelledAt: /* @__PURE__ */ new Date(),
        waitlistPosition: null
      }
    });
    if (booking.status === "confirmed") await restoreBookingCredit(transaction, booking.id);
    await enqueueOperationalNotice(transaction, {
      organizationId: input.actor.organizationId,
      memberId: booking.memberId,
      key: `booking:${booking.id}:cancelled`,
      kind: "cancellation",
      message: "Your class booking has been cancelled. Any restorable credit returns to its original service month."
    });
    const waiting = await transaction.classBooking.findMany({
      where: {
        classInstanceId: booking.classInstance.id,
        status: "waitlist"
      },
      orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
      select: { id: true }
    });
    await Promise.all(
      waiting.map(
        (entry, index) => transaction.classBooking.update({
          where: { id: entry.id },
          data: { waitlistPosition: index + 1 }
        })
      )
    );
    const releasedConfirmedSpot = booking.status === "confirmed";
    const promotion = releasedConfirmedSpot ? await promoteCapacityControlledWaitlistBookingInTransaction(
      transaction,
      booking.classInstance.id,
      input.actor.organizationId,
      true
    ) : { promoted: false, message: "No confirmed spot was released" };
    return {
      bookingId: booking.id,
      classInstanceId: booking.classInstance.id,
      cancelled: true,
      releasedConfirmedSpot,
      promotion
    };
  });
  return result;
}
async function cancelCapacityControlledClassInstance(prisma, input) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1e3) {
    throw new Error("Class cancellation reason must be between 3 and 1000 characters");
  }
  if (!input.actor.canManageAllRecords) {
    throw new Error("Class cancellation management permission required");
  }
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    const loadClassInstance = () => transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actor.organizationId },
      include: {
        bookings: {
          where: { status: { in: ["confirmed", "waitlist"] } },
          include: {
            member: {
              include: {
                user: {
                  include: {
                    membership: {
                      include: { tier: { select: { classCreditsPerMonth: true } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    let classInstance = await loadClassInstance();
    if (!classInstance) throw new Error("Class instance not found");
    assertActorOrganization(input.actor, classInstance.organizationId);
    if (classInstance.date.getTime() <= Date.now()) {
      throw new Error("A class instance cannot be cancelled after it starts");
    }
    if (classInstance.isCancelled) {
      return {
        classInstanceId: classInstance.id,
        cancelledBookings: 0,
        refundedCredits: 0,
        reused: true
      };
    }
    const memberIds = [...new Set(
      classInstance.bookings.map((booking) => booking.memberId).filter((id) => typeof id === "string" && id.length > 0)
    )].sort();
    for (const memberId of memberIds) {
      await lockTransactionKey(transaction, `member:${memberId}`);
    }
    classInstance = await loadClassInstance();
    if (!classInstance || classInstance.isCancelled) throw new Error("Class instance changed during cancellation");
    let refundedCredits = 0;
    for (const booking of classInstance.bookings) {
      if (booking.status !== "confirmed") continue;
      if (await restoreBookingCredit(transaction, booking.id)) refundedCredits += 1;
    }
    for (const booking of classInstance.bookings) await enqueueOperationalNotice(transaction, {
      organizationId: input.actor.organizationId,
      memberId: booking.memberId,
      key: `booking:${booking.id}:class-cancelled`,
      kind: "cancellation",
      message: `Your class has been cancelled: ${reason}`
    });
    const cancelledAt = /* @__PURE__ */ new Date();
    await transaction.classBooking.updateMany({
      where: {
        classInstanceId: classInstance.id,
        status: { in: ["confirmed", "waitlist"] }
      },
      data: {
        status: "cancelled",
        activeBookingKey: null,
        cancelledAt,
        waitlistPosition: null
      }
    });
    await transaction.classInstance.update({
      where: { id: classInstance.id },
      data: { isCancelled: true, cancellationReason: reason }
    });
    return {
      classInstanceId: classInstance.id,
      cancelledBookings: classInstance.bookings.length,
      refundedCredits,
      reused: false
    };
  });
}
async function markCapacityControlledAttendance(prisma, input) {
  const outcome = normalizeAttendanceOutcome(input.outcome);
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId);
    await lockTransactionKey(transaction, `attendance:${input.bookingId}`);
    const booking = await transaction.classBooking.findFirst({
      where: { id: input.bookingId, organizationId: input.actor.organizationId },
      include: {
        member: { include: { user: { include: { membership: true } } } },
        classInstance: {
          include: {
            instructor: { include: { user: { select: { id: true } } } },
            classSchedule: {
              include: { instructor: { include: { user: { select: { id: true } } } } }
            }
          }
        }
      }
    });
    if (!booking?.memberId || !booking.classInstance?.classScheduleId) {
      throw new Error("Attendance booking is missing its member or schedule");
    }
    assertActorOrganization(input.actor, booking.member.organizationId);
    assertActorOrganization(input.actor, booking.classInstance.organizationId);
    if (booking.status !== "confirmed") {
      throw new Error("Attendance can only be marked for a confirmed booking");
    }
    if (booking.classInstance.isCancelled) throw new Error("Attendance cannot be marked for a cancelled class");
    if (booking.classInstance.date.getTime() > Date.now()) {
      throw new Error("Attendance cannot be marked before the class starts");
    }
    const assignedInstructorIds = [booking.classInstance.instructor?.user?.id ?? booking.classInstance.classSchedule?.instructor?.user?.id].filter(Boolean);
    if (!input.actor.canManageAllRecords && !(input.actor.isInstructor && assignedInstructorIds.includes(input.actor.userId))) {
      throw new Error("Attendance management permission required");
    }
    if (outcome !== "no-show") {
      await lockTransactionKey(transaction, `member:${booking.memberId}`);
      const currentMember = await transaction.member.findFirst({ where: { id: booking.memberId, organizationId: input.actor.organizationId }, include: { user: { include: { membership: true } } } });
      assertInstructorQualifications(booking.classInstance.instructor ?? booking.classInstance.classSchedule?.instructor ?? {}, /* @__PURE__ */ new Date());
      if (currentMember?.status !== "active") throw new Error("Member account is not active");
      try {
        assertMembershipServiceEligibility(currentMember.user?.membership, booking.classInstance.date);
      } catch (error) {
        const debit = await transaction.membershipCreditEntry.findUnique({ where: { key: `${booking.id}:debit` }, include: { grant: true } });
        const membership = currentMember.user?.membership;
        if (membership?.status !== "active" || !(error instanceof Error) || error.message !== "Service is outside the paid membership period" || debit?.grant?.membershipId !== membership.id || booking.classInstance.date < debit.grant.periodStart || booking.classInstance.date >= debit.grant.periodEnd) throw error;
      }
      await assertParticipationAllowed(transaction, input.actor.organizationId, booking.memberId, booking.classInstance.date, booking.classInstance.locationId);
    }
    const requestedMinutes = Number(input.minutesLate ?? 0);
    const minutesLate = outcome === "late" ? Math.min(Math.max(Number.isFinite(requestedMinutes) ? Math.floor(requestedMinutes) : 5, 1), 180) : null;
    const data = {
      organizationId: booking.member.organizationId,
      bookingId: booking.id,
      classScheduleId: booking.classInstance.classScheduleId,
      memberId: booking.memberId,
      markedById: input.actor.userId,
      markedAt: /* @__PURE__ */ new Date(),
      attended: outcome !== "no-show",
      lateArrival: outcome === "late",
      minutesLate,
      noShowReason: outcome === "no-show" ? input.notes?.trim() || "Marked from roster" : ""
    };
    const existing = await transaction.attendanceRecord.findFirst({
      where: { bookingId: booking.id, organizationId: input.actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    const record = existing ? await transaction.attendanceRecord.update({ where: { id: existing.id }, data }) : await transaction.attendanceRecord.create({ data });
    return { id: record.id, outcome };
  });
}
async function recordCapacityControlledMemberCheckIn(prisma, input) {
  assertFacilityStaff(input.actor);
  const method = normalizeCheckInMethod(input.method);
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId);
    await lockTransactionKey(transaction, `check-in:${input.memberId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);
    const member = await transaction.member.findFirst({
      where: { id: input.memberId, organizationId: input.actor.organizationId },
      include: {
        user: { include: { membership: true } },
        subscriptions: { where: { status: "active" }, select: { id: true } }
      }
    });
    if (!member?.user?.id) throw new Error("Member not found");
    assertActorOrganization(input.actor, member.organizationId);
    if (member.status !== "active") throw new Error(`Member status is ${member.status}`);
    assertMembershipServiceEligibility(member.user.membership, /* @__PURE__ */ new Date());
    await assertFacilityAccessHours(transaction, input.actor.organizationId, member.user.membership, /* @__PURE__ */ new Date());
    await assertParticipationAllowed(transaction, input.actor.organizationId, member.id, /* @__PURE__ */ new Date(), input.locationId);
    if (input.locationId) {
      const location2 = await transaction.location.findFirst({
        where: { id: input.locationId, organizationId: input.actor.organizationId },
        select: { isActive: true, organizationId: true }
      });
      if (!location2?.isActive) throw new Error("Check-in location is not active");
      if (location2.organizationId !== member.organizationId) throw new Error("Check-in location is not in the member's organization");
    }
    const existing = await transaction.checkIn.findFirst({
      where: {
        memberId: member.id,
        organizationId: input.actor.organizationId,
        isGuest: false,
        checkOutTime: null
      },
      orderBy: { checkInTime: "desc" }
    });
    if (existing) return { checkIn: existing, reused: true };
    if (input.actor.organizationId !== member.organizationId) throw new Error("Check-in actor organization is invalid");
    const checkIn = await transaction.checkIn.create({
      data: {
        organizationId: member.organizationId,
        memberId: member.id,
        openCheckInKey: "open",
        locationId: input.locationId || null,
        method,
        membershipValidated: true,
        validationNotes: "Validated by controlled check-in transition"
      }
    });
    return { checkIn, reused: false };
  });
}
async function recordControlledGuestCheckIn(prisma, input) {
  const guestName = input.guestName.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!guestName) throw new Error("Guest name is required");
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("Guest check-in idempotency key is required");
  const host = input.hostMemberId ? await prisma.member.findFirst({
    where: { id: input.hostMemberId, organizationId: input.organizationId },
    select: { organizationId: true }
  }) : null;
  if (input.hostMemberId && !host) throw new Error("Host member not found");
  const organizationId = input.organizationId;
  if (!organizationId || host && host.organizationId !== organizationId) {
    throw new Error("Guest check-in organization is invalid");
  }
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.organizationId);
    await assertFacilityAccessHours(transaction, organizationId, null, /* @__PURE__ */ new Date());
    await assertParticipationAllowed(transaction, organizationId, null, /* @__PURE__ */ new Date());
    await lockTransactionKey(transaction, `guest-check-in:${organizationId}:${idempotencyKey}`);
    const marker = `[request:${idempotencyKey}]`;
    const existing = await transaction.checkIn.findFirst({
      where: { organizationId, isGuest: true, validationNotes: { contains: marker } },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing;
    return transaction.checkIn.create({
      data: {
        organizationId,
        memberId: input.hostMemberId || null,
        isGuest: true,
        guestName,
        method: "manual",
        membershipValidated: false,
        validationNotes: `${marker}${input.phone?.trim() ? ` Guest phone: ${input.phone.trim()}.` : ""}${input.hostMemberId ? " Invited by member." : ""}`
      }
    });
  });
}
async function checkOutControlledMember(prisma, input) {
  assertFacilityStaff(input.actor);
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actor.organizationId);
    await lockTransactionKey(transaction, `check-out:${input.checkInId}`);
    const checkIn = await transaction.checkIn.findFirst({
      where: { id: input.checkInId, organizationId: input.actor.organizationId },
      include: { member: { include: { user: { select: { id: true } } } } }
    });
    if (!checkIn) throw new Error("Check-in not found");
    assertActorOrganization(input.actor, checkIn.organizationId);
    if (checkIn.checkOutTime) return { checkIn, reused: true };
    const updated = await transaction.checkIn.update({
      where: { id: checkIn.id },
      data: { checkOutTime: /* @__PURE__ */ new Date(), openCheckInKey: null }
    });
    return { checkIn: updated, reused: false };
  });
}

// features/keystone/mutations/gymLifecycleResolvers.ts
function actorFromContext(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  return {
    userId: session.itemId,
    organizationId,
    canManageAllRecords: Boolean(session.data?.role?.canManageAllRecords),
    canManageCheckIns: Boolean(session.data?.role?.canManageCheckIns),
    canManageFacilities: Boolean(session.data?.role?.canManageFacilities),
    isInstructor: Boolean(session.data?.role?.isInstructor)
  };
}
async function cancelClassBooking(root, { bookingId }, context) {
  const result = await cancelCapacityControlledBooking(context.prisma, {
    bookingId,
    actor: actorFromContext(context)
  });
  const booking = await context.db.ClassBooking.findOne({ where: { id: result.bookingId } });
  return {
    booking,
    promoted: result.promotion.promoted,
    message: result.cancelled ? "Booking cancelled" : "Booking was already cancelled"
  };
}
async function cancelClassInstance(_root, args, context) {
  return cancelCapacityControlledClassInstance(context.prisma, {
    ...args,
    actor: actorFromContext(context)
  });
}
async function markClassAttendance(root, args, context) {
  const result = await markCapacityControlledAttendance(context.prisma, {
    ...args,
    actor: actorFromContext(context)
  });
  return context.db.AttendanceRecord.findOne({ where: { id: result.id } });
}
async function recordMemberCheckIn(root, args, context) {
  const result = await recordCapacityControlledMemberCheckIn(context.prisma, {
    ...args,
    actor: actorFromContext(context)
  });
  return {
    checkIn: await context.db.CheckIn.findOne({ where: { id: result.checkIn.id } }),
    reused: result.reused
  };
}
async function checkOutMember(root, { checkInId }, context) {
  const result = await checkOutControlledMember(context.prisma, {
    checkInId,
    actor: actorFromContext(context)
  });
  return {
    checkIn: await context.db.CheckIn.findOne({ where: { id: result.checkIn.id } }),
    reused: result.reused
  };
}

// features/keystone/mutations/deterministicOnboarding.ts
var import_node_crypto7 = __toESM(require("node:crypto"));

// features/platform/onboarding/lib/seed.json
var seed_default = {
  gymSettings: {
    name: "Kinetic Performance Club",
    tagline: "Movement is art. The body of work is you.",
    description: "A training club for strength, conditioning, coached classes, recovery, and consistent member routines.",
    address: "123 Fitness Ave, San Francisco, CA 94102",
    phone: "(415) 555-0100",
    email: "hello@example.invalid",
    currencyCode: "USD",
    locale: "en-US",
    timezone: "America/Los_Angeles",
    countryCode: "US",
    hours: {
      monday: "5:00 AM - 10:00 PM",
      tuesday: "5:00 AM - 10:00 PM",
      wednesday: "5:00 AM - 10:00 PM",
      thursday: "5:00 AM - 10:00 PM",
      friday: "5:00 AM - 9:00 PM",
      saturday: "6:00 AM - 6:00 PM",
      sunday: "7:00 AM - 4:00 PM"
    },
    heroEyebrow: "Performance without compromise",
    heroHeadline: "Movement is art.\nThe body of work\nis you.",
    heroSubheadline: "Membership access, coached classes, and a training floor built for consistent work.",
    heroPrimaryCtaLabel: "Start membership",
    heroPrimaryCtaHref: "/join",
    heroSecondaryCtaLabel: "View schedule",
    heroSecondaryCtaHref: "/schedule",
    promoBanner: "Movement is art. The body of work is you.",
    footerTagline: "Built for disciplined training, clear scheduling, and a better member experience.",
    copyrightName: "Kinetic Performance Club",
    facilityHeadline: "Facility systems",
    facilityDescription: "Strength, conditioning, coached studios, recovery, and member access are configured as one complete training environment.",
    facilityHighlights: [
      {
        title: "Weight training floor",
        description: "Heavy iron, racks, platforms, and enough load to support real strength work.",
        features: [
          "Power racks",
          "Olympic platforms",
          "Free weights",
          "Cable stations"
        ]
      },
      {
        title: "Coached studios",
        description: "Dedicated spaces for yoga, spin, HIIT, mobility, and coached group programming.",
        features: [
          "Yoga room",
          "Spin studio",
          "HIIT arena",
          "Mobility space"
        ]
      },
      {
        title: "Conditioning zone",
        description: "A cardio and conditioning section for intervals, engine work, and pacing.",
        features: [
          "Treadmills",
          "Rowers",
          "Bikes",
          "Ski ergs"
        ]
      },
      {
        title: "Recovery spaces",
        description: "Locker rooms, showers, and recovery support for members who train hard and stay consistent.",
        features: [
          "Showers",
          "Sauna",
          "Steam",
          "Day lockers"
        ]
      },
      {
        title: "Member lounge",
        description: "A quieter zone for transitions between training, meetings, and coaching touchpoints.",
        features: [
          "WiFi",
          "Smoothie bar",
          "Seating",
          "Screens"
        ]
      },
      {
        title: "Personal coaching area",
        description: "Floor space for assessments, one-on-one coaching, and progress reviews.",
        features: [
          "Private sessions",
          "Assessment tools",
          "Specialty equipment",
          "Progress tracking"
        ]
      }
    ],
    heroStats: [],
    contactTopics: [
      {
        title: "Location",
        details: [
          "123 Fitness Ave",
          "San Francisco, CA 94102"
        ]
      },
      {
        title: "Phone",
        details: [
          "(415) 555-0100",
          "Front desk support during staffed hours"
        ]
      },
      {
        title: "Email",
        details: [
          "hello@kineticperformance.club",
          "support@kineticperformance.club"
        ]
      },
      {
        title: "Hours",
        details: [
          "Mon\u2013Fri 5:00 AM \u2013 10:00 PM",
          "Sat\u2013Sun reduced staffed hours"
        ]
      }
    ],
    rating: null,
    reviewCount: 0,
    heroImageUrl: "/images/training-floor.jpg"
  },
  location: {
    name: "Kinetic Performance Club \u2013 Main Studio",
    address: "123 Fitness Ave, San Francisco, CA 94102",
    phone: "(415) 555-0100",
    isActive: true
  },
  membershipTiers: [
    {
      handle: "basic-monthly",
      name: "Basic Monthly",
      monthlyPrice: 29,
      annualPrice: 299,
      classCreditsPerMonth: 4,
      accessHours: "staffed hours",
      guestPasses: 0,
      personalTrainingSessions: 0,
      freezeAllowed: false,
      contractLength: 0,
      description: "For self-directed members who want full facility access and a small number of coached classes each month."
    },
    {
      handle: "premium-monthly",
      name: "Unlimited Monthly",
      monthlyPrice: 79,
      annualPrice: 799,
      classCreditsPerMonth: -1,
      accessHours: "staffed hours",
      guestPasses: 0,
      personalTrainingSessions: 0,
      freezeAllowed: true,
      contractLength: 0,
      description: "Unlimited coached class booking during staffed facility hours, with the option to freeze provider-backed billing."
    }
  ],
  classTypes: [
    {
      handle: "yoga",
      name: "Yoga",
      difficulty: "beginner",
      duration: 60,
      caloriesBurn: 200,
      equipmentNeeded: [
        "mat"
      ],
      description: "Mobility-forward sessions for strength balance, recovery, and consistency."
    },
    {
      handle: "spin",
      name: "Spin Class",
      difficulty: "intermediate",
      duration: 45,
      caloriesBurn: 500,
      equipmentNeeded: [
        "cycling_shoes"
      ],
      description: "High-energy interval rides with coach-led pacing and strong member energy."
    },
    {
      handle: "hiit",
      name: "HIIT",
      difficulty: "advanced",
      duration: 30,
      caloriesBurn: 400,
      equipmentNeeded: [
        "weights",
        "kettlebells"
      ],
      description: "Short, intense conditioning blocks for members who want efficient work."
    },
    {
      handle: "pilates",
      name: "Pilates",
      difficulty: "beginner",
      duration: 60,
      caloriesBurn: 250,
      equipmentNeeded: [
        "mat"
      ],
      description: "Core control, posture, breath, and lower-impact strength development."
    },
    {
      handle: "zumba",
      name: "Zumba",
      difficulty: "beginner",
      duration: 60,
      caloriesBurn: 400,
      equipmentNeeded: [],
      description: "A music-driven group format built for fun, movement, and consistency."
    },
    {
      handle: "boxing",
      name: "Boxing",
      difficulty: "intermediate",
      duration: 45,
      caloriesBurn: 600,
      equipmentNeeded: [
        "boxing_gloves"
      ],
      description: "Technique, conditioning, and sharp coached combinations in a high-focus format."
    }
  ],
  instructors: [
    {
      handle: "sarah-johnson",
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah.johnson@example.invalid",
      specialties: [
        "Yoga",
        "Pilates"
      ],
      certifications: [],
      bio: "Sarah leads mobility-forward classes that improve strength balance, breathing, and recovery discipline.",
      isActive: true,
      teachesClassTypes: [
        "yoga",
        "pilates"
      ],
      photo: ""
    },
    {
      handle: "mike-rodriguez",
      firstName: "Mike",
      lastName: "Rodriguez",
      email: "mike.rodriguez@example.invalid",
      specialties: [
        "HIIT",
        "Boxing"
      ],
      certifications: [],
      bio: "Mike coaches high-output formats with a focus on intensity, structure, and measurable progression.",
      isActive: true,
      teachesClassTypes: [
        "hiit",
        "boxing"
      ],
      photo: ""
    },
    {
      handle: "emily-chen",
      firstName: "Emily",
      lastName: "Chen",
      email: "emily.chen@example.invalid",
      specialties: [
        "Spin",
        "Zumba"
      ],
      certifications: [],
      bio: "Emily brings high-energy coaching, clear pacing, and an inclusive rhythm to every session.",
      isActive: true,
      teachesClassTypes: [
        "spin",
        "zumba"
      ],
      photo: ""
    }
  ],
  schedules: [
    {
      name: "Morning Yoga",
      classTypeHandle: "yoga",
      instructorHandle: "sarah-johnson",
      dayOfWeek: "monday",
      startTime: "07:00",
      endTime: "08:00",
      maxCapacity: 15,
      isActive: true,
      description: "Start the week with guided breath, strength balance, and mobility work."
    },
    {
      name: "Morning Yoga",
      classTypeHandle: "yoga",
      instructorHandle: "sarah-johnson",
      dayOfWeek: "wednesday",
      startTime: "07:00",
      endTime: "08:00",
      maxCapacity: 15,
      isActive: true,
      description: "A midweek reset built around control, posture, and recovery."
    },
    {
      name: "Morning Yoga",
      classTypeHandle: "yoga",
      instructorHandle: "sarah-johnson",
      dayOfWeek: "friday",
      startTime: "07:00",
      endTime: "08:00",
      maxCapacity: 15,
      isActive: true,
      description: "Mobility and calm intensity to finish the week well."
    },
    {
      name: "Spin Class",
      classTypeHandle: "spin",
      instructorHandle: "emily-chen",
      dayOfWeek: "tuesday",
      startTime: "06:30",
      endTime: "07:15",
      maxCapacity: 20,
      isActive: true,
      description: "A sharp interval ride for members who want a fast morning engine session."
    },
    {
      name: "Spin Class",
      classTypeHandle: "spin",
      instructorHandle: "emily-chen",
      dayOfWeek: "thursday",
      startTime: "06:30",
      endTime: "07:15",
      maxCapacity: 20,
      isActive: true,
      description: "Coach-led endurance and tempo work before the day begins."
    },
    {
      name: "Spin Class",
      classTypeHandle: "spin",
      instructorHandle: "emily-chen",
      dayOfWeek: "saturday",
      startTime: "09:00",
      endTime: "09:45",
      maxCapacity: 20,
      isActive: true,
      description: "Weekend energy with high tempo and stronger studio atmosphere."
    },
    {
      name: "HIIT Training",
      classTypeHandle: "hiit",
      instructorHandle: "mike-rodriguez",
      dayOfWeek: "monday",
      startTime: "18:00",
      endTime: "18:30",
      maxCapacity: 12,
      isActive: true,
      description: "Fast conditioning work with clear rounds and no wasted motion."
    },
    {
      name: "HIIT Training",
      classTypeHandle: "hiit",
      instructorHandle: "mike-rodriguez",
      dayOfWeek: "wednesday",
      startTime: "18:00",
      endTime: "18:30",
      maxCapacity: 12,
      isActive: true,
      description: "Midweek power and output for members chasing measurable progress."
    },
    {
      name: "HIIT Training",
      classTypeHandle: "hiit",
      instructorHandle: "mike-rodriguez",
      dayOfWeek: "friday",
      startTime: "18:00",
      endTime: "18:30",
      maxCapacity: 12,
      isActive: true,
      description: "Finish strong with a dense, coached conditioning block."
    },
    {
      name: "Pilates",
      classTypeHandle: "pilates",
      instructorHandle: "sarah-johnson",
      dayOfWeek: "tuesday",
      startTime: "09:00",
      endTime: "10:00",
      maxCapacity: 10,
      isActive: true,
      description: "Core-focused movement for posture, control, and lower-impact strength."
    },
    {
      name: "Pilates",
      classTypeHandle: "pilates",
      instructorHandle: "sarah-johnson",
      dayOfWeek: "saturday",
      startTime: "10:00",
      endTime: "11:00",
      maxCapacity: 10,
      isActive: true,
      description: "Weekend movement quality with guided pace and technique."
    },
    {
      name: "Zumba",
      classTypeHandle: "zumba",
      instructorHandle: "emily-chen",
      dayOfWeek: "wednesday",
      startTime: "19:00",
      endTime: "20:00",
      maxCapacity: 25,
      isActive: true,
      description: "A music-driven format for cardio, coordination, and community energy."
    },
    {
      name: "Zumba",
      classTypeHandle: "zumba",
      instructorHandle: "emily-chen",
      dayOfWeek: "friday",
      startTime: "19:00",
      endTime: "20:00",
      maxCapacity: 25,
      isActive: true,
      description: "High-energy end-of-week movement with strong member momentum."
    },
    {
      name: "Boxing",
      classTypeHandle: "boxing",
      instructorHandle: "mike-rodriguez",
      dayOfWeek: "tuesday",
      startTime: "18:00",
      endTime: "18:45",
      maxCapacity: 10,
      isActive: true,
      description: "Technique, footwork, and conditioning with strong coach attention."
    },
    {
      name: "Boxing",
      classTypeHandle: "boxing",
      instructorHandle: "mike-rodriguez",
      dayOfWeek: "thursday",
      startTime: "18:00",
      endTime: "18:45",
      maxCapacity: 10,
      isActive: true,
      description: "Sharp combinations, aerobic work, and repeatable skill building."
    }
  ],
  paymentProviders: [
    {
      name: "Stripe",
      code: "pp_stripe",
      adapterKey: "stripe",
      isInstalled: false,
      metadata: {
        credentialSource: "environment",
        purpose: "membership-billing",
        setupRequired: true
      }
    }
  ]
};

// features/platform/onboarding/lib/onboardingSchema.ts
var import_zod = require("zod");
var shortText = import_zod.z.string().trim().min(1).max(200);
var optionalText = (max = 2e3) => import_zod.z.string().trim().max(max).optional();
var handle = import_zod.z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case handle");
var time = import_zod.z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time");
var localImage = import_zod.z.string().trim().refine(
  (value) => value === "" || /^\/images\/[^?#\\]+$/.test(value) && !value.includes(".."),
  "Use an existing local /images path"
);
var gymSettingsSchema = import_zod.z.object({
  name: shortText,
  tagline: optionalText(300),
  description: optionalText(),
  address: optionalText(500),
  phone: optionalText(50),
  email: import_zod.z.string().trim().email().max(320).optional(),
  currencyCode: import_zod.z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  locale: import_zod.z.string().trim().min(2).max(20),
  timezone: import_zod.z.string().trim().min(1).max(100),
  countryCode: import_zod.z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  hours: import_zod.z.record(import_zod.z.string().max(100)).optional(),
  logoIcon: optionalText(2e4),
  brandHue: import_zod.z.number().min(0).max(360).optional(),
  heroEyebrow: optionalText(200),
  heroHeadline: optionalText(1e3),
  heroSubheadline: optionalText(),
  heroPrimaryCtaLabel: optionalText(100),
  heroPrimaryCtaHref: import_zod.z.string().trim().startsWith("/").max(500).optional(),
  heroSecondaryCtaLabel: optionalText(100),
  heroSecondaryCtaHref: import_zod.z.string().trim().startsWith("/").max(500).optional(),
  promoBanner: optionalText(500),
  footerTagline: optionalText(500),
  copyrightName: optionalText(200),
  facilityHeadline: optionalText(300),
  facilityDescription: optionalText(),
  facilityHighlights: import_zod.z.array(import_zod.z.unknown()).max(20).optional(),
  heroStats: import_zod.z.array(import_zod.z.unknown()).max(20).optional(),
  contactTopics: import_zod.z.array(import_zod.z.unknown()).max(20).optional(),
  rating: import_zod.z.number().min(0).max(5).nullable().optional(),
  reviewCount: import_zod.z.number().int().min(0).max(1e6).optional(),
  heroImageUrl: localImage
}).strict();
var locationSchema = import_zod.z.object({
  name: shortText,
  address: optionalText(500).default(""),
  phone: optionalText(50).default(""),
  isActive: import_zod.z.boolean().default(true)
}).strict();
var membershipTierSchema = import_zod.z.object({
  handle,
  name: shortText,
  monthlyPrice: import_zod.z.number().finite().min(0).max(1e6),
  annualPrice: import_zod.z.number().finite().min(0).max(1e7),
  classCreditsPerMonth: import_zod.z.number().int().min(-1).max(1e4),
  accessHours: import_zod.z.string().trim().max(200).default("limited"),
  guestPasses: import_zod.z.number().int().min(0).max(1e3).default(0),
  personalTrainingSessions: import_zod.z.number().int().min(0).max(1e3).default(0),
  freezeAllowed: import_zod.z.boolean().default(false),
  contractLength: import_zod.z.number().int().min(0).max(120).default(0),
  description: optionalText().default("")
}).strict();
var equipment = import_zod.z.enum([
  "mat",
  "weights",
  "resistance_bands",
  "jump_rope",
  "boxing_gloves",
  "cycling_shoes",
  "kettlebells",
  "medicine_ball",
  "none"
]);
var classTypeSchema = import_zod.z.object({
  handle,
  name: shortText,
  difficulty: import_zod.z.enum(["beginner", "intermediate", "advanced", "all-levels"]).default("all-levels"),
  duration: import_zod.z.number().int().min(1).max(1440),
  caloriesBurn: import_zod.z.number().int().min(0).max(1e4).optional(),
  equipmentNeeded: import_zod.z.array(equipment).max(9).default([]),
  description: optionalText().default("")
}).strict();
var instructorSchema = import_zod.z.object({
  handle,
  firstName: shortText,
  lastName: shortText,
  email: import_zod.z.string().trim().email().max(320).refine(
    (value) => value.endsWith("@example.invalid"),
    "Starter instructor emails must use the reserved @example.invalid domain"
  ),
  specialties: import_zod.z.array(import_zod.z.string().trim().min(1).max(100)).max(30).default([]),
  certifications: import_zod.z.array(import_zod.z.string().trim().min(1).max(100)).max(30).default([]),
  bio: optionalText().default(""),
  isActive: import_zod.z.boolean().default(true),
  teachesClassTypes: import_zod.z.array(handle).max(50).default([]),
  photo: localImage.default("")
}).strict();
var scheduleSchema = import_zod.z.object({
  name: shortText,
  classTypeHandle: handle,
  instructorHandle: handle,
  dayOfWeek: import_zod.z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  startTime: time,
  endTime: time,
  maxCapacity: import_zod.z.number().int().min(1).max(1e4),
  isActive: import_zod.z.boolean().default(true),
  description: optionalText().default("")
}).strict().superRefine((schedule, context) => {
  if (schedule.endTime <= schedule.startTime) {
    context.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be later than start time" });
  }
});
var paymentProviderSchema = import_zod.z.object({
  name: import_zod.z.literal("Stripe"),
  code: import_zod.z.literal("pp_stripe"),
  adapterKey: import_zod.z.literal("stripe"),
  isInstalled: import_zod.z.literal(false),
  metadata: import_zod.z.record(import_zod.z.unknown()).optional()
}).strict();
var gymOnboardingSeedSchema = import_zod.z.object({
  gymSettings: gymSettingsSchema,
  location: locationSchema,
  membershipTiers: import_zod.z.array(membershipTierSchema).min(1).max(20),
  classTypes: import_zod.z.array(classTypeSchema).min(1).max(50),
  instructors: import_zod.z.array(instructorSchema).min(1).max(50),
  schedules: import_zod.z.array(scheduleSchema).min(1).max(200),
  paymentProviders: import_zod.z.array(paymentProviderSchema).length(1)
}).strict().superRefine((data, context) => {
  const unique = (items, field, path) => {
    const seen = /* @__PURE__ */ new Set();
    items.forEach((item, index) => {
      const value = item[field];
      if (seen.has(value)) context.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: [path, index, field], message: `${field} must be unique` });
      seen.add(value);
    });
  };
  unique(data.membershipTiers, "handle", "membershipTiers");
  unique(data.membershipTiers, "name", "membershipTiers");
  unique(data.classTypes, "handle", "classTypes");
  unique(data.classTypes, "name", "classTypes");
  unique(data.instructors, "handle", "instructors");
  unique(data.instructors, "email", "instructors");
  const classTypes = new Set(data.classTypes.map((item) => item.handle));
  const instructors = new Set(data.instructors.map((item) => item.handle));
  data.instructors.forEach((instructor, instructorIndex) => {
    instructor.teachesClassTypes.forEach((classTypeHandle, classTypeIndex) => {
      if (!classTypes.has(classTypeHandle)) context.addIssue({
        code: import_zod.z.ZodIssueCode.custom,
        path: ["instructors", instructorIndex, "teachesClassTypes", classTypeIndex],
        message: `Unknown class type handle: ${classTypeHandle}`
      });
    });
  });
  data.schedules.forEach((schedule, index) => {
    if (!classTypes.has(schedule.classTypeHandle)) context.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["schedules", index, "classTypeHandle"], message: `Unknown class type handle: ${schedule.classTypeHandle}` });
    if (!instructors.has(schedule.instructorHandle)) context.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["schedules", index, "instructorHandle"], message: `Unknown instructor handle: ${schedule.instructorHandle}` });
  });
  unique(data.schedules.map((item) => ({ key: `${item.name}\0${item.dayOfWeek}\0${item.startTime}\0${item.instructorHandle}` })), "key", "schedules");
});
function parseGymOnboardingSeed(value) {
  const result = gymOnboardingSeedSchema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`).join("; ");
  throw new Error(`Invalid gym onboarding configuration: ${details}`);
}

// features/keystone/mutations/deterministicOnboarding.ts
init_classCapacity();
var dayNumbers = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};
var documentValue = (value) => typeof value === "string" && value.length > 0 ? [{ type: "paragraph", children: [{ text: value }] }] : [{ type: "paragraph", children: [{ text: "" }] }];
function actorOrganization(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  if (!session.data?.role?.canManageOnboarding) throw new Error("Onboarding management permission required");
  return { userId: session.itemId, organizationId };
}
async function one(query, where, queryFields) {
  const rows = await query.findMany({ where, take: 2, query: queryFields });
  if (rows.length > 1) throw new Error("Onboarding found ambiguous duplicate data");
  if (rows[0] && (typeof rows[0].id !== "string" || !rows[0].id)) throw new Error("Onboarding lookup returned a row without an id");
  return rows[0];
}
function requiredSeedId(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`Onboarding seed did not produce ${label}`);
  return value;
}
function tenantWhere(organizationId, narrower = {}) {
  return { AND: [{ organization: { id: { equals: organizationId } } }, narrower] };
}
function dateForSchedule(dayOfWeek, startTime, offset, now, timeZone) {
  const target = dayNumbers[dayOfWeek];
  if (localWeekdayAtOffset(now, timeZone, offset) !== target) return null;
  const [hours, minutes] = startTime.split(":").map(Number);
  return futureLocalOccurrence(now, timeZone, offset, hours || 0, minutes || 0);
}
function resolveOnboardingSeed(template, customData) {
  if (!["minimal", "full", "custom"].includes(template)) throw new Error("Unknown onboarding template");
  if (template === "custom") {
    if (customData == null) throw new Error("Custom onboarding requires a configuration");
    return parseGymOnboardingSeed(customData);
  }
  const canonical = parseGymOnboardingSeed(seed_default);
  if (template === "full") return canonical;
  const classTypes = canonical.classTypes.filter((item) => item.handle === "yoga");
  const classTypeHandles = new Set(classTypes.map((item) => item.handle));
  const instructors = canonical.instructors.filter((item) => item.handle === "sarah-johnson").map((item) => ({
    ...item,
    teachesClassTypes: item.teachesClassTypes.filter((classTypeHandle) => classTypeHandles.has(classTypeHandle))
  }));
  const instructorHandles = new Set(instructors.map((item) => item.handle));
  return {
    ...canonical,
    membershipTiers: canonical.membershipTiers.filter((item) => item.handle === "basic-monthly"),
    classTypes,
    instructors,
    schedules: canonical.schedules.filter(
      (item) => classTypeHandles.has(item.classTypeHandle) && instructorHandles.has(item.instructorHandle)
    )
  };
}
async function runDeterministicOnboarding(_root, args, context) {
  const template = args.template;
  const onboardingSeed = resolveOnboardingSeed(template, args.data);
  const membershipTiers = onboardingSeed.membershipTiers;
  const classTypesSeed = onboardingSeed.classTypes;
  const instructorsSeed = onboardingSeed.instructors;
  const schedulesSeed = onboardingSeed.schedules;
  const { userId, organizationId } = actorOrganization(context);
  const prisma = context.prisma;
  const sudo = context.sudo();
  const now = /* @__PURE__ */ new Date();
  const timeZone = normalizeTimeZone(onboardingSeed.gymSettings.timezone || "UTC");
  const actorUser = await prisma.user.findUnique({ where: { id: userId }, select: { onboardingStatus: true, organizationId: true } });
  if (!actorUser || actorUser.organizationId !== organizationId) throw new Error("Onboarding actor organization mismatch");
  if (actorUser.onboardingStatus === "dismissed") throw new Error("Dismissed onboarding must be restarted from the dashboard");
  if (actorUser.onboardingStatus !== "in_progress" && actorUser.onboardingStatus !== "completed") {
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "in_progress" } });
  }
  const leaseToken = import_node_crypto7.default.randomUUID();
  const leaseUntil = new Date(now.getTime() + 30 * 60 * 1e3);
  let runId;
  try {
    const run = await prisma.onboardingRun.upsert({
      where: { organizationId },
      create: { organizationId, status: "failed", attempts: 0, startedAt: null, leaseUntil: null, leaseToken: "" },
      update: {},
      select: { id: true }
    });
    runId = requiredSeedId(run?.id, "onboarding run id");
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true } });
    runId = requiredSeedId(existing?.id, "onboarding run id after concurrent claim");
  }
  const runState = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true, status: true, completedAt: true } });
  const stateRunId = requiredSeedId(runState?.id, "onboarding run state id");
  if (runState?.status === "completed" && runState.completedAt) {
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
    const instanceCount = await sudo.query.ClassInstance.count({ where: tenantWhere(organizationId) });
    return { success: true, organizationId, runId: stateRunId, instanceCount };
  }
  const wasCompleted = runState?.status === "completed" && Boolean(runState.completedAt);
  const claimed = await prisma.onboardingRun.updateMany({
    where: {
      organizationId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
    },
    data: {
      // Completion evidence is never cleared or rewritten. Completed runs return above.
      status: wasCompleted ? "completed" : "running",
      ...wasCompleted ? {} : { attempts: { increment: 1 }, startedAt: now, lastError: "", completedAt: null },
      leaseUntil,
      leaseToken
    }
  });
  if (!claimed.count) {
    const deadline = Date.now() + 6e4;
    while (Date.now() < deadline) {
      const current = await prisma.onboardingRun.findUnique({ where: { organizationId }, select: { id: true, status: true, completedAt: true, leaseUntil: true } });
      if (current?.status === "completed" && current.completedAt) {
        const currentRunId = requiredSeedId(current.id, "completed onboarding run id");
        await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
        const completedInstances = await sudo.query.ClassInstance.count({ where: tenantWhere(organizationId) });
        return { success: true, organizationId, runId: currentRunId, instanceCount: completedInstances };
      }
      if (current?.status === "failed" && (!current.leaseUntil || new Date(current.leaseUntil).getTime() < Date.now())) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Onboarding is already running; retry after the current run finishes");
  }
  try {
    const org = await sudo.query.Organization.findOne({ where: { id: organizationId }, query: "id" });
    if (!org) throw new Error("Onboarding organization not found");
    await upsertGymSettings(null, { data: onboardingSeed.gymSettings }, context);
    const locationSeed = onboardingSeed.location;
    let location2 = await one(sudo.query.Location, tenantWhere(organizationId, { name: { equals: locationSeed.name } }), "id name");
    const locationData = { ...locationSeed, organization: { connect: { id: organizationId } } };
    if (location2) location2 = await sudo.query.Location.updateOne({ where: { id: location2.id }, data: locationData, query: "id name" });
    else location2 = await sudo.query.Location.createOne({ data: locationData, query: "id name" });
    const tiers = {};
    for (const tier of membershipTiers) {
      const { handle: tierHandle, ...tierInput } = tier;
      const data = { ...tierInput, description: documentValue(tier.description), organization: { connect: { id: organizationId } } };
      let row = await one(sudo.query.MembershipTier, tenantWhere(organizationId, { name: { equals: tier.name } }), "id name");
      row = row ? await sudo.query.MembershipTier.updateOne({ where: { id: row.id }, data, query: "id name" }) : await sudo.query.MembershipTier.createOne({ data, query: "id name" });
      tiers[tierHandle] = row.id;
    }
    const classTypes = {};
    for (const classType of classTypesSeed) {
      const { handle: classTypeHandle, ...classTypeInput } = classType;
      const data = { ...classTypeInput, description: documentValue(classType.description), organization: { connect: { id: organizationId } } };
      let row = await one(sudo.query.ClassType, tenantWhere(organizationId, { name: { equals: classType.name } }), "id name");
      row = row ? await sudo.query.ClassType.updateOne({ where: { id: row.id }, data, query: "id name" }) : await sudo.query.ClassType.createOne({ data, query: "id name" });
      classTypes[classTypeHandle] = row.id;
    }
    if (process.env.GYM_DATABASE_TESTS === "true" && process.env.GYM_ONBOARDING_INJECT_FAILURE === "true") {
      throw new Error("Injected onboarding recovery failure");
    }
    const instructorRoleData = {
      name: "Instructor",
      canCreateRecords: false,
      canManageAllRecords: false,
      canSeeOtherPeople: false,
      canEditOtherPeople: false,
      canManagePeople: false,
      canManageRoles: false,
      canAccessDashboard: true,
      canManageOnboarding: false,
      canManageSettings: false,
      canManageAppointments: false,
      canManageCheckIns: false,
      canManageFacilities: false,
      canManagePrograms: false,
      canManageCommunications: false,
      canManageRetail: false,
      canManagePayroll: false,
      canViewReports: false,
      isInstructor: true,
      organization: { connect: { id: organizationId } }
    };
    let instructorRole = await one(sudo.query.Role, tenantWhere(organizationId, { name: { equals: "Instructor" } }), "id name");
    instructorRole = instructorRole ? await sudo.query.Role.updateOne({ where: { id: requiredSeedId(instructorRole.id, "existing instructor role id") }, data: instructorRoleData, query: "id name" }) : await sudo.query.Role.createOne({ data: instructorRoleData, query: "id name" });
    const instructorRoleId = requiredSeedId(instructorRole?.id, "instructor role id");
    const instructors = {};
    for (const instructor of instructorsSeed) {
      const fullName = `${instructor.firstName} ${instructor.lastName}`.trim();
      let user = await one(sudo.query.User, { email: { equals: instructor.email } }, "id email organization { id } role { id organization { id } }");
      if (user && user.organization?.id !== organizationId) throw new Error(`Instructor email belongs to another organization: ${instructor.email}`);
      if (!user) {
        const initialPassword = import_node_crypto7.default.randomBytes(32).toString("base64url");
        user = await sudo.query.User.createOne({ data: { name: fullName, email: instructor.email, password: initialPassword, organization: { connect: { id: organizationId } }, role: { connect: { id: instructorRoleId } } }, query: "id email organization { id } role { id organization { id } }" });
      } else {
        const userRow = await prisma.user.update({
          where: { id: user.id },
          data: { name: fullName, roleId: instructorRoleId },
          select: { id: true, email: true, organizationId: true }
        });
        user = { ...userRow, organization: { id: userRow.organizationId }, role: { id: instructorRoleId, organization: { id: organizationId } } };
      }
      const instructorUserId = requiredSeedId(user?.id, `instructor user ${instructor.email}`);
      const instructorData = {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: instructorUserId } },
        bio: documentValue(instructor.bio),
        specialties: instructor.specialties ?? [],
        certifications: instructor.certifications ?? [],
        photo: instructor.photo ?? "",
        isActive: instructor.isActive ?? true
      };
      let row = await one(sudo.query.Instructor, tenantWhere(organizationId, { user: { id: { equals: instructorUserId } } }), "id");
      row = row ? await sudo.query.Instructor.updateOne({ where: { id: row.id }, data: instructorData, query: "id" }) : await sudo.query.Instructor.createOne({ data: instructorData, query: "id" });
      instructors[instructor.handle] = row.id;
    }
    const schedules = [];
    for (const schedule of schedulesSeed) {
      const instructorId = requiredSeedId(instructors[schedule.instructorHandle], `instructor ${schedule.instructorHandle}`);
      const classTypeId = requiredSeedId(classTypes[schedule.classTypeHandle], `class type ${schedule.classTypeHandle}`);
      const { instructorHandle: _instructorHandle, classTypeHandle: _classTypeHandle, ...scheduleInput } = schedule;
      const data = {
        ...scheduleInput,
        organization: { connect: { id: organizationId } },
        instructor: { connect: { id: instructorId } },
        classType: { connect: { id: classTypeId } }
      };
      let row = await one(sudo.query.ClassSchedule, tenantWhere(organizationId, { name: { equals: schedule.name }, dayOfWeek: { equals: schedule.dayOfWeek }, startTime: { equals: schedule.startTime }, instructor: { id: { equals: instructorId } } }), "id");
      if (row) {
        const { maxCapacity, ...scheduleData } = data;
        await context.transaction(async (txContext) => {
          await updateCapacityControlledClassScheduleInTransaction(txContext.prisma, {
            classScheduleId: row.id,
            maxCapacity,
            organizationId
          }, async () => {
            await txContext.sudo().query.ClassSchedule.updateOne({
              where: { id: row.id },
              data: scheduleData,
              query: "id"
            });
          });
        });
      } else {
        row = await sudo.query.ClassSchedule.createOne({ data, query: "id" });
      }
      schedules.push({ id: row.id, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, maxCapacity: schedule.maxCapacity });
    }
    const instanceIds = [];
    for (const schedule of schedules) {
      for (let offset = 0; offset <= 14; offset += 1) {
        const date = dateForSchedule(schedule.dayOfWeek, schedule.startTime, offset, now, timeZone);
        if (!date || date.getTime() < Date.now()) continue;
        const iso = date.toISOString();
        let instance = await one(sudo.query.ClassInstance, tenantWhere(organizationId, { classSchedule: { id: { equals: schedule.id } }, date: { equals: iso } }), "id");
        const data = { organization: { connect: { id: organizationId } }, classSchedule: { connect: { id: schedule.id } }, date: iso, maxCapacity: schedule.maxCapacity };
        instance = instance ? instance : await sudo.query.ClassInstance.createOne({ data: { ...data, isCancelled: false }, query: "id" });
        instanceIds.push(instance.id);
      }
    }
    let provider = await one(sudo.query.PaymentProvider, tenantWhere(organizationId, { code: { equals: "pp_stripe" } }), "id");
    const stripeConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim()
    );
    const providerData = {
      organization: { connect: { id: organizationId } },
      name: "Stripe",
      code: "pp_stripe",
      adapterKey: "stripe",
      providerAccountId: process.env.STRIPE_ACCOUNT_ID?.trim() || null,
      isInstalled: stripeConfigured,
      metadata: {
        credentialSource: "environment",
        purpose: "membership-billing",
        setupRequired: !stripeConfigured
      }
    };
    const existingProviderId = provider ? requiredSeedId(provider.id, "existing payment provider id") : null;
    provider = existingProviderId ? await sudo.query.PaymentProvider.updateOne({ where: { id: existingProviderId }, data: providerData, query: "id" }) : await sudo.query.PaymentProvider.createOne({ data: providerData, query: "id" });
    await prisma.onboardingRun.updateMany({ where: { organizationId, leaseToken }, data: { status: "completed", completedAt: /* @__PURE__ */ new Date(), lastError: "", leaseUntil: null, leaseToken: "" } });
    await prisma.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
    return { success: true, organizationId, runId, instanceCount: instanceIds.length };
  } catch (error) {
    await prisma.onboardingRun.updateMany({ where: { organizationId, leaseToken }, data: { status: wasCompleted ? "completed" : "failed", ...wasCompleted ? {} : { lastError: error instanceof Error ? error.message.slice(0, 2e3) : "Onboarding failed" }, leaseUntil: null, leaseToken: "" } });
    throw error;
  }
}

// features/keystone/mutations/memberRole.ts
var BOUNDED_MEMBER_PERMISSIONS = {
  canCreateRecords: false,
  canManageAllRecords: false,
  canSeeOtherPeople: false,
  canEditOtherPeople: false,
  canManagePeople: false,
  canManageRoles: false,
  canAccessDashboard: false,
  canManageOnboarding: false,
  canManageSettings: false,
  canManageAppointments: false,
  canManageCheckIns: false,
  canManageFacilities: false,
  canManagePrograms: false,
  canManageCommunications: false,
  canManageRetail: false,
  canManagePayroll: false,
  canViewReports: false,
  isInstructor: false
};
async function ensureBoundedMemberRole(context, organizationId) {
  const sudo = context.sudo();
  const roles = await sudo.query.Role.findMany({
    where: {
      AND: [
        { organization: { id: { equals: organizationId } } },
        { name: { equals: "Member" } }
      ]
    },
    take: 1,
    query: "id"
  });
  if (roles[0]) {
    return sudo.query.Role.updateOne({
      where: { id: roles[0].id },
      data: BOUNDED_MEMBER_PERMISSIONS,
      query: "id"
    });
  }
  return sudo.query.Role.createOne({
    data: {
      organization: { connect: { id: organizationId } },
      name: "Member",
      ...BOUNDED_MEMBER_PERMISSIONS
    },
    query: "id"
  });
}

// features/keystone/mutations/memberRegistration.ts
var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function registerMember(_root, args, context) {
  if (process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED !== "true") {
    throw new Error("Public signup is not enabled");
  }
  const input = args.data;
  const email = normalizeAuthIdentity(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password2 = typeof input.password === "string" ? input.password : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!emailPattern.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (name.length < 1 || name.length > 120) throw new Error("Name must be between 1 and 120 characters");
  if (password2.length < 12 || password2.length > 128) throw new Error("Password must be between 12 and 128 characters");
  if (phone.length > 40) throw new Error("Phone number is too long");
  if (!await consumeAuthAttempt(context.prisma, "signup:global", 100, 60 * 60 * 1e3) || !await consumeAuthAttempt(context.prisma, `signup:${email}`, 5, 60 * 60 * 1e3)) {
    throw new Error("Too many signup attempts. Try again later");
  }
  const organizationId = process.env.PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID?.trim();
  if (!organizationId) throw new Error("Public signup is not configured for an organization");
  const storefrontOrganizationId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  if (!storefrontOrganizationId || storefrontOrganizationId !== organizationId) {
    throw new Error("Public signup organization must match the configured storefront organization");
  }
  return context.transaction(async (transactionContext) => {
    const sudo = transactionContext.sudo();
    await transactionContext.prisma.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`public-signup:${organizationId}`}, 0))) AS acquired
    `;
    const organizations = await sudo.query.Organization.findMany({
      where: {
        AND: [
          { id: { equals: organizationId } },
          { status: { equals: "active" } }
        ]
      },
      take: 1,
      query: "id"
    });
    if (!organizations[0]) throw new Error("Public signup organization is not available");
    const existing = await sudo.query.User.findMany({
      where: { email: { equals: email } },
      take: 1,
      query: "id"
    });
    if (existing[0]) throw new Error("An account with that email already exists");
    const role = await ensureBoundedMemberRole(transactionContext, organizationId);
    const user = await sudo.query.User.createOne({
      data: {
        name,
        email,
        password: password2,
        phone,
        organization: { connect: { id: organizationId } },
        role: { connect: { id: role.id } }
      },
      query: "id email name"
    });
    await sudo.query.Member.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: user.id } },
        name,
        email,
        phone,
        status: "active"
      },
      query: "id"
    });
    return user;
  });
}

// features/keystone/mutations/memberInvitation.ts
var import_node_crypto8 = __toESM(require("node:crypto"));
var emailPattern2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function inviteMember(_root, { data }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Member management permission required");
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = normalizeAuthIdentity(data.email);
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  if (!name || name.length > 120) throw new Error("Name is required and must be 120 characters or fewer");
  if (!emailPattern2.test(email) || email.length > 254) throw new Error("Enter a valid email address");
  if (phone.length > 40) throw new Error("Phone number is too long");
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`member-invite:${organizationId}`}, 0))) AS acquired
    `;
    const sudo = transactionContext.sudo();
    const existing = await sudo.query.User.findMany({
      where: { email: { equals: email } },
      take: 1,
      query: "id email organization { id }"
    });
    if (existing[0]) {
      if (existing[0].organization?.id !== organizationId) {
        throw new Error("An account with this email already exists");
      }
      const members = await sudo.query.Member.findMany({
        where: {
          AND: [
            { user: { id: { equals: existing[0].id } } },
            { organization: { id: { equals: organizationId } } }
          ]
        },
        take: 1,
        query: "id email"
      });
      if (!members[0]) throw new Error("This account exists but is not a member profile");
      return {
        userId: existing[0].id,
        memberId: members[0].id,
        email: existing[0].email
      };
    }
    const role = await ensureBoundedMemberRole(transactionContext, organizationId);
    const user = await sudo.query.User.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        role: { connect: { id: role.id } },
        name,
        email,
        phone,
        password: import_node_crypto8.default.randomBytes(32).toString("base64url")
      },
      query: "id email"
    });
    const member = await sudo.query.Member.createOne({
      data: {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: user.id } },
        name,
        email,
        phone,
        status: "active",
        joinDate: (/* @__PURE__ */ new Date()).toISOString()
      },
      query: "id"
    });
    return { userId: user.id, memberId: member.id, email };
  });
}

// features/keystone/mutations/memberAccount.ts
init_classCapacity();
init_operational_notices();
async function setMemberAccountStatus(_root, { memberId, status }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Member management permission required");
  }
  if (status !== "active" && status !== "suspended" && status !== "cancelled") {
    throw new Error("Member account status must be active, suspended, or cancelled");
  }
  return context.prisma.$transaction(async (transaction) => {
    await lockTransactionKey(transaction, `member:${memberId}`);
    await transaction.$queryRaw`
      SELECT true AS locked
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`member-account:${memberId}`}, 0))) AS acquired
    `;
    const member = await transaction.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, status: true, userId: true }
    });
    if (!member) throw new Error("Member was not found in this organization");
    if (member.status === "cancelled") {
      throw new Error("A cancelled member account cannot be reactivated from this workflow");
    }
    if (member.status === status) return member;
    if (status === "cancelled") {
      const [bookings, payments, checkIns, subscriptions, memberships, paymentSessions] = await Promise.all([
        transaction.classBooking.count({ where: { memberId: member.id, organizationId } }),
        transaction.gymPayment.count({ where: { memberId: member.id, organizationId } }),
        transaction.checkIn.count({ where: { memberId: member.id, organizationId } }),
        transaction.subscription.count({ where: { memberId: member.id, organizationId } }),
        transaction.membership.count({
          where: {
            memberId: member.userId,
            organizationId,
            status: { in: ["active", "frozen", "past-due"] }
          }
        }),
        transaction.paymentSession.count({
          where: { userId: member.userId, organizationId }
        })
      ]);
      if (bookings || payments || checkIns || subscriptions || memberships || paymentSessions) {
        throw new Error("Only an incomplete member with no operational or billing history can be closed");
      }
    }
    const updated = await transaction.member.update({ where: { id: member.id }, data: { status } });
    await transaction.classBooking.updateMany({ where: {
      organizationId,
      memberId,
      status: { in: ["confirmed", "waitlist"] },
      classInstance: { date: { gt: /* @__PURE__ */ new Date() } },
      ...status === "active" ? { eligibilityReviewReason: "Member account is suspended" } : {}
    }, data: { eligibilityReviewReason: status === "active" ? "" : "Member account is suspended" } });
    await enqueueOperationalNotice(transaction, { organizationId, memberId, key: `member-status:${memberId}:${updated.updatedAt.toISOString()}`, kind: "membership", message: `Your member account is now ${status}. Existing reservations remain visible for staff review; participation requires current eligibility.` });
    return updated;
  });
}

// features/keystone/mutations/instructorAccount.ts
var emailPattern3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function prepareInstructorAccount(_root, { instructorId, email }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) {
    throw new Error("Instructor account management permission required");
  }
  const normalizedEmail = normalizeAuthIdentity(email);
  if (!emailPattern3.test(normalizedEmail) || normalizedEmail.length > 254 || normalizedEmail.endsWith("@example.invalid")) {
    throw new Error("Enter the coach's real email address");
  }
  const instructors = await context.sudo().query.Instructor.findMany({
    where: {
      AND: [
        { id: { equals: instructorId } },
        { organization: { id: { equals: organizationId } } }
      ]
    },
    take: 1,
    query: "id user { id organization { id } }"
  });
  const instructor = instructors[0];
  if (!instructor?.user?.id || instructor.user.organization?.id !== organizationId) {
    throw new Error("Instructor account was not found in this organization");
  }
  const updated = await context.query.User.updateOne({
    where: { id: instructor.user.id },
    data: { email: normalizedEmail },
    query: "id email"
  });
  if (!updated?.id) throw new Error("Instructor account could not be updated");
  return { userId: updated.id, email: normalizedEmail };
}

// features/keystone/mutations/onboardingStatus.ts
var allowed = {
  not_started: /* @__PURE__ */ new Set(["in_progress", "dismissed"]),
  in_progress: /* @__PURE__ */ new Set(["in_progress", "dismissed"]),
  dismissed: /* @__PURE__ */ new Set(["in_progress", "dismissed"]),
  completed: /* @__PURE__ */ new Set(["completed"])
};
async function transitionOnboardingStatus(_root, { status }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManageOnboarding) {
    throw new Error("Onboarding management permission required");
  }
  if (status === "completed") throw new Error("Completed is reserved for deterministic onboarding completion");
  if (!allowed[session.data.onboardingStatus]?.has(status)) {
    throw new Error(`Onboarding transition ${session.data.onboardingStatus} -> ${status} is not allowed`);
  }
  const updated = await context.prisma.user.updateMany({
    where: { id: session.itemId, organizationId },
    data: { onboardingStatus: status }
  });
  if (updated.count !== 1) throw new Error("Onboarding actor was not found in the session organization");
  return { id: session.itemId, onboardingStatus: status };
}

// features/keystone/mutations/scheduling.ts
init_membership_credits();
init_operational_policy();
init_classCapacity();

// features/keystone/lib/class-scheduling.ts
init_classCapacity();
init_membership_credits();
init_operational_notices();
function scheduleDuration(schedule) {
  const pattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!pattern.test(schedule.startTime) || !pattern.test(schedule.endTime) || schedule.endTime <= schedule.startTime) throw new Error("Class times must be increasing HH:MM values");
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (minutes(schedule.endTime) - minutes(schedule.startTime)) * 6e4;
}
function effectiveInstructor(instance) {
  return instance.instructorId ?? instance.classSchedule?.instructorId ?? null;
}
function overlapping(a, b, c, d) {
  return a < d && b > c;
}
async function assertClassAllocation(tx, organizationId, candidate, ignoreId) {
  const closure = await tx.operationsCase.findFirst({ where: { organizationId, kind: "closure", status: { not: "resolved" }, ...candidate.locationId ? { OR: [{ locationId: "" }, { locationId: candidate.locationId }] } : {} } });
  if (closure) throw new Error("Class allocation is unavailable during a facility closure");
  const instructorId = effectiveInstructor(candidate);
  const resource = candidate.resourceId ? await tx.gymResource.findFirst({ where: { id: candidate.resourceId, organizationId, isActive: true } }) : null;
  if (candidate.resourceId && (!resource || resource.locationId !== candidate.locationId)) throw new Error("Class resource must be active and belong to the selected location");
  if (resource && candidate.maxCapacity > resource.capacity) throw new Error("Class capacity exceeds resource capacity");
  if (candidate.locationId && !await tx.location.findFirst({ where: { id: candidate.locationId, organizationId, isActive: true } })) throw new Error("Class location must be active in this organization");
  if (instructorId) {
    const instructor = await tx.instructor.findFirst({ where: { id: instructorId, organizationId, isActive: true } });
    if (!instructor) throw new Error("Class instructor must be active in this organization");
    assertInstructorQualifications(instructor, candidate.endsAt);
  }
  const before = (resource?.setupBufferMinutes || 0) * 6e4;
  const after = (resource?.cleanupBufferMinutes || 0) * 6e4;
  const start = new Date(candidate.date.getTime() - before);
  const end = new Date(candidate.endsAt.getTime() + after);
  const classes = await tx.classInstance.findMany({ where: { organizationId, isCancelled: false, ...ignoreId ? { id: { not: ignoreId } } : {}, date: { lt: end, gt: new Date(start.getTime() - 48 * 36e5) } }, include: { classSchedule: true, resource: true } });
  for (const other of classes) {
    const otherEnd = other.endsAt || new Date(other.date.getTime() + scheduleDuration(other.classSchedule));
    if (instructorId && effectiveInstructor(other) === instructorId && overlapping(candidate.date, candidate.endsAt, other.date, otherEnd)) throw new Error("Instructor has an overlapping class");
    if (resource && other.resourceId === resource.id && overlapping(
      start,
      end,
      new Date(other.date.getTime() - (other.resource?.setupBufferMinutes || 0) * 6e4),
      new Date(otherEnd.getTime() + (other.resource?.cleanupBufferMinutes || 0) * 6e4)
    )) throw new Error("Resource has an overlapping class");
  }
  if (instructorId || resource) {
    const appointments = await tx.trainerAppointment.findMany({ where: {
      organizationId,
      status: { in: ["confirmed", "scheduled", "checked_in"] },
      startTime: { lt: new Date(end.getTime() + 4 * 36e5) },
      endTime: { gt: new Date(start.getTime() - 4 * 36e5) },
      OR: [...instructorId ? [{ instructorId }] : [], ...resource ? [{ resourceId: resource.id }] : []]
    } });
    for (const appointment of appointments) {
      if (instructorId && appointment.instructorId === instructorId && overlapping(candidate.date, candidate.endsAt, appointment.startTime, appointment.endTime)) throw new Error("Instructor has an overlapping training appointment");
      if (resource && appointment.resourceId === resource.id && overlapping(start, end, appointment.resourceStartsAt || new Date(appointment.startTime.getTime() - before), appointment.resourceEndsAt || new Date(appointment.endTime.getTime() + after))) throw new Error("Resource has an overlapping training appointment");
    }
  }
}
async function saveControlledOccurrence(tx, organizationId, input, id) {
  if (id) await lockTransactionKey(tx, `class-instance:${id}`);
  const existing = id ? await tx.classInstance.findFirst({ where: { id, organizationId } }) : null;
  if (id && !existing) throw new Error("Class instance not found");
  if (existing?.isCancelled || existing && existing.date <= /* @__PURE__ */ new Date()) throw new Error("Completed or cancelled occurrences cannot be edited");
  const scheduleId = input.classScheduleId ?? existing?.classScheduleId;
  if (existing && scheduleId !== existing.classScheduleId) throw new Error("An occurrence cannot be moved to another schedule; cancel and create a new occurrence");
  const schedule = await tx.classSchedule.findFirst({ where: { id: scheduleId, organizationId } });
  if (!schedule?.isActive && !existing) throw new Error("Active class schedule required");
  if (!schedule) throw new Error("Class schedule not found");
  const date = new Date(input.date ?? existing?.date);
  if (!Number.isFinite(date.getTime()) || date <= /* @__PURE__ */ new Date()) throw new Error("Class must start in the future");
  const data = {
    organizationId,
    classScheduleId: schedule.id,
    occurrenceKey: existing?.occurrenceKey || `${schedule.id}:${(existing?.date || date).toISOString()}`,
    date,
    endsAt: new Date(date.getTime() + scheduleDuration(schedule)),
    instructorId: input.instructorId === void 0 ? existing?.instructorId ?? null : input.instructorId,
    locationId: input.locationId === void 0 ? existing?.endsAt ? existing.locationId : existing?.locationId ?? schedule.locationId : input.locationId,
    resourceId: input.resourceId === void 0 ? existing?.endsAt ? existing.resourceId : existing?.resourceId ?? schedule.resourceId : input.resourceId,
    maxCapacity: input.maxCapacity ?? existing?.maxCapacity ?? schedule.maxCapacity
  };
  if (!Number.isInteger(data.maxCapacity) || data.maxCapacity < 1 || data.maxCapacity > 1e4) throw new Error("Capacity must be a whole number from 1 to 10000");
  await assertClassAllocation(tx, organizationId, { ...data, classSchedule: schedule }, id || void 0);
  const bookings = existing ? await tx.classBooking.findMany({ where: { organizationId, classInstanceId: existing.id, status: { in: ["confirmed", "waitlist"] } }, include: { member: { include: { user: { include: { membership: true } } } } } }) : [];
  if (bookings.filter((b) => b.status === "confirmed").length > data.maxCapacity) throw new Error("Capacity is below confirmed bookings");
  const changed = existing && (existing.date.getTime() !== date.getTime() || existing.instructorId !== data.instructorId || existing.locationId !== data.locationId || existing.resourceId !== data.resourceId);
  if (changed) {
    const members = [...new Set(bookings.map((b) => b.memberId))].sort();
    for (const memberId of members) await lockTransactionKey(tx, `member:${memberId}`);
    for (const booking of bookings) {
      const lockedMember = await tx.member.findFirst({ where: { id: booking.memberId, organizationId }, include: { user: { include: { membership: true } } } });
      if (lockedMember?.status !== "active") throw new Error("A booked member is not eligible; resolve the booking before rescheduling");
      assertMembershipServiceEligibility(lockedMember?.user?.membership, date);
      if (booking.status === "confirmed" && existing.date.getTime() !== date.getTime()) {
        const debit = await tx.membershipCreditEntry.findUnique({ where: { key: `${booking.id}:debit` }, include: { grant: true } });
        if (!debit?.grant || date < debit.grant.periodStart || date >= debit.grant.periodEnd) throw new Error("Reschedule crosses a booking credit month or legacy credit provenance is missing; cancel and rebook with restored credits");
      }
    }
  }
  const persisted = { ...data, ...changed ? { changeHistory: [
    ...Array.isArray(existing.changeHistory) ? existing.changeHistory : [],
    { at: (/* @__PURE__ */ new Date()).toISOString(), actorId: input.actorId || "system", before: { date: existing.date.toISOString(), instructorId: existing.instructorId, locationId: existing.locationId, resourceId: existing.resourceId }, after: { date: date.toISOString(), instructorId: data.instructorId, locationId: data.locationId, resourceId: data.resourceId } }
  ] } : {} };
  const result = existing ? await tx.classInstance.update({ where: { id: existing.id }, data: persisted }) : await tx.classInstance.create({ data: persisted });
  if (changed) for (const booking of bookings) await enqueueOperationalNotice(tx, {
    organizationId,
    memberId: booking.memberId,
    key: `booking:${booking.id}:reschedule:${persisted.changeHistory?.length}`,
    kind: "reschedule",
    message: `Your class details changed. The class starts ${date.toISOString()}. Please review your booking.`
  });
  return result;
}

// features/keystone/mutations/scheduling.ts
init_classCapacity();
var DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};
function schedulingManager(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManageAllRecords) {
    throw new Error("Scheduling management permission required");
  }
  return { userId: session.itemId, organizationId };
}
async function updateClassScheduleCapacity(_root, { classScheduleId, maxCapacity }, context) {
  const { organizationId } = schedulingManager(context);
  return updateCapacityControlledClassSchedule(context.prisma, {
    classScheduleId,
    maxCapacity,
    organizationId
  });
}
async function updateClassInstanceCapacity(_root, { classInstanceId, maxCapacity }, context) {
  const { organizationId } = schedulingManager(context);
  return updateCapacityControlledClassInstance(context.prisma, {
    classInstanceId,
    maxCapacity,
    organizationId
  });
}
async function generateUpcomingClassInstances(_root, { weeks }, context) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
    throw new Error("weeks must be an integer from 1 to 12");
  }
  const { organizationId } = schedulingManager(context);
  const sudo = context.sudo();
  const [settings, organization3] = await Promise.all([
    context.prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { timezone: true }
    }),
    context.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true }
    })
  ]);
  const timeZone = resolveGymTimeZone(settings?.timezone, organization3?.timezone);
  const schedules = await sudo.query.ClassSchedule.findMany({
    where: {
      AND: [
        { organization: { id: { equals: organizationId } } },
        { isActive: { equals: true } }
      ]
    },
    take: 500,
    query: "id dayOfWeek startTime endTime maxCapacity organization { id }"
  });
  const now = /* @__PURE__ */ new Date();
  const pendingInstances = [];
  for (const schedule of schedules) {
    if (schedule.organization?.id !== organizationId) throw new Error("Schedule tenant mismatch");
    const targetDay = DAY_MAP[schedule.dayOfWeek];
    if (targetDay === void 0) continue;
    const [hours, minutes] = String(schedule.startTime).split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) throw new Error("Schedule time is invalid");
    for (let offset = 0; offset <= weeks * 7; offset += 1) {
      if (localWeekdayAtOffset(now, timeZone, offset) !== targetDay) continue;
      const date = futureLocalOccurrence(now, timeZone, offset, hours, minutes);
      if (date <= now) continue;
      pendingInstances.push({
        organizationId,
        classScheduleId: schedule.id,
        date,
        maxCapacity: schedule.maxCapacity,
        isCancelled: false
      });
    }
  }
  const createdCount = await context.prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    let count = 0;
    for (const candidate of pendingInstances) {
      const key = `${candidate.classScheduleId}:${candidate.date.toISOString()}`;
      const found = await tx.classInstance.findFirst({ where: { organizationId, classScheduleId: candidate.classScheduleId, OR: [{ occurrenceKey: key }, { date: candidate.date }] } });
      if (found) continue;
      const created = await saveControlledOccurrence(tx, organizationId, candidate);
      await tx.classInstance.update({ where: { id: created.id }, data: { occurrenceKey: key } });
      count += 1;
    }
    return count;
  }, { timeout: 3e4 });
  return { success: true, createdCount };
}
async function saveGymClassSchedule(_root, { id, data }, context) {
  const { organizationId } = schedulingManager(context);
  return context.prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    if (id) await lockTransactionKey(tx, `class-schedule:${id}`);
    const existing = id ? await tx.classSchedule.findFirst({ where: { id, organizationId } }) : null;
    if (id && !existing) throw new Error("Schedule not found");
    const next = { organizationId };
    for (const key of ["name", "description", "dayOfWeek", "startTime", "endTime", "maxCapacity", "isActive"]) if (data[key] !== void 0) next[key] = data[key];
    for (const [field, list43] of [["instructor", "instructor"], ["classType", "classType"], ["location", "location"], ["resource", "gymResource"]]) {
      if (data[field] === void 0) continue;
      const relatedId = data[field]?.disconnect ? null : data[field]?.connect?.id;
      if (relatedId !== null && (typeof relatedId !== "string" || !await tx[list43].findFirst({ where: { id: relatedId, organizationId } }))) throw new Error(`${field} is not in this organization`);
      next[`${field}Id`] = relatedId;
    }
    const merged = { ...existing, ...next };
    if (!merged.classTypeId) throw new Error("Select a class type");
    if (typeof merged.name !== "string" || !merged.name.trim() || merged.name.length > 200) throw new Error("Class name is required (maximum 200 characters)");
    if (typeof merged.description !== "string" && merged.description !== void 0) throw new Error("Description must be text");
    if (merged.isActive !== void 0 && typeof merged.isActive !== "boolean") throw new Error("Active flag must be boolean");
    if (!(merged.dayOfWeek in DAY_MAP)) throw new Error("Choose a valid weekday");
    scheduleDuration(merged);
    if (!Number.isInteger(merged.maxCapacity) || merged.maxCapacity < 1 || merged.maxCapacity > 1e4) throw new Error("Capacity must be a whole number from 1 to 10000");
    if (existing) {
      const instances = await tx.classInstance.findMany({ where: { organizationId, classScheduleId: existing.id }, select: { id: true, maxCapacity: true, resource: { select: { capacity: true } } }, orderBy: { id: "asc" } });
      const policyChange = ["dayOfWeek", "startTime", "endTime", "instructorId", "classTypeId", "locationId", "resourceId"].some((key) => next[key] !== void 0 && next[key] !== existing[key]);
      if (instances.length && policyChange) throw new Error("This recurring schedule has occurrences. Edit individual future occurrences, or deactivate this template and create a new one. Existing bookings are preserved.");
      for (const instance of instances.filter((row) => row.maxCapacity === null)) {
        if (instance.resource && merged.maxCapacity > instance.resource.capacity) throw new Error("Schedule capacity exceeds an occurrence resource capacity");
        await lockTransactionKey(tx, `class-instance:${instance.id}`);
        const count = await tx.classBooking.count({ where: { organizationId, classInstanceId: instance.id, status: "confirmed" } });
        if (count > merged.maxCapacity) throw new Error("Capacity is below confirmed bookings");
      }
    }
    if (merged.resourceId) {
      const resource = await tx.gymResource.findFirst({ where: { id: merged.resourceId, organizationId, isActive: true } });
      if (!resource || resource.locationId !== merged.locationId || resource.capacity < merged.maxCapacity) throw new Error("Resource must be active, at the selected location, and large enough");
    }
    if (merged.instructorId && !await tx.instructor.findFirst({ where: { id: merged.instructorId, organizationId, isActive: true } })) throw new Error("Instructor must be active");
    if (merged.isActive !== false && (merged.instructorId || merged.resourceId)) {
      const conflicts = await tx.classSchedule.findMany({ where: { organizationId, isActive: true, dayOfWeek: merged.dayOfWeek, ...id ? { id: { not: id } } : {} } });
      if (conflicts.some((other) => other.startTime < merged.endTime && other.endTime > merged.startTime && (merged.instructorId && other.instructorId === merged.instructorId || merged.resourceId && other.resourceId === merged.resourceId))) throw new Error("Recurring instructor or resource allocation overlaps another schedule");
    }
    return existing ? tx.classSchedule.update({ where: { id: existing.id }, data: next }) : tx.classSchedule.create({ data: next });
  });
}
async function saveGymClassInstance(_root, { id, data }, context) {
  const { organizationId } = schedulingManager(context);
  const input = { actorId: context.session.itemId };
  for (const key of ["date", "maxCapacity"]) if (data[key] !== void 0) input[key] = data[key];
  for (const key of ["classSchedule", "instructor", "location", "resource"]) if (data[key] !== void 0) {
    const value = data[key]?.disconnect ? null : data[key]?.connect?.id;
    if (value !== null && typeof value !== "string") throw new Error(`Invalid ${key} relation`);
    input[`${key}Id`] = value;
  }
  return context.prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    return saveControlledOccurrence(tx, organizationId, input, id);
  });
}
async function reconcileGymEntitlements(_root, { afterId, limit = 50 }, context) {
  const { organizationId } = schedulingManager(context);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be from 1 to 100");
  const rows = await context.prisma.membership.findMany({ where: { organizationId, ...afterId ? { id: { gt: afterId } } : {} }, orderBy: { id: "asc" }, take: limit + 1, select: { id: true } });
  const results = [];
  for (const row of rows.slice(0, limit)) results.push(await refreshScopedMembership(context.prisma, organizationId, row.id));
  return { processed: results.length, nextAfterId: rows.length > limit ? rows[limit - 1].id : null, results };
}
async function updateGymResource(_root, { id, data }, context) {
  const { organizationId, userId } = schedulingManager(context);
  const reason = typeof data?.reason === "string" ? data.reason.trim() : "";
  if (reason.length < 3 || reason.length > 1e3) throw new Error("Resource change reason must be 3 to 1000 characters");
  const values = {};
  for (const field of ["isActive", "isExclusive"]) if (data[field] !== void 0) {
    if (typeof data[field] !== "boolean") throw new Error(`${field} must be boolean`);
    values[field] = data[field];
  }
  for (const [field, minimum, maximum] of [["capacity", 1, 500], ["setupBufferMinutes", 0, 240], ["cleanupBufferMinutes", 0, 240]]) if (data[field] !== void 0) {
    if (!Number.isInteger(data[field]) || data[field] < minimum || data[field] > maximum) throw new Error(`${field} must be a whole number from ${minimum} to ${maximum}`);
    values[field] = data[field];
  }
  if (!Object.keys(values).length) throw new Error("Choose a resource allocation setting to change");
  return context.prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    const resource = await tx.gymResource.findFirst({ where: { id, organizationId } });
    if (!resource) throw new Error("Resource not found in this organization");
    const changed = Object.keys(values).some((key) => resource[key] !== values[key]);
    if (!changed) return { id, reused: true };
    const now = /* @__PURE__ */ new Date();
    const classCandidates = await tx.classInstance.findMany({ where: {
      organizationId,
      isCancelled: false,
      AND: [
        { OR: [{ resourceId: id }, { endsAt: null, resourceId: null, classSchedule: { resourceId: id } }] },
        { OR: [{ endsAt: { gt: now } }, { endsAt: null, date: { gt: new Date(now.getTime() - 864e5) } }] }
      ]
    }, include: { classSchedule: true }, take: 1e3 });
    if (classCandidates.length >= 1e3) throw new Error("Resource class dependency window requires review");
    const classDependency = classCandidates.some((instance) => (instance.endsAt || new Date(instance.date.getTime() + scheduleDuration(instance.classSchedule))) > now);
    const trainingDependency = await tx.trainerAppointment.findFirst({ where: { organizationId, resourceId: id, endTime: { gt: now }, status: { in: ["scheduled", "confirmed", "checked_in"] } }, select: { id: true } });
    if (classDependency || trainingDependency) throw new Error("Cancel or reassign upcoming/in-progress classes and appointments before changing this resource");
    const history2 = Array.isArray(resource.metadata?.allocationHistory) ? resource.metadata.allocationHistory : [];
    if (history2.length >= 500) throw new Error("Resource allocation history requires archival review");
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, resource[key]]));
    await tx.gymResource.update({ where: { id }, data: { ...values, metadata: { ...resource.metadata, allocationHistory: [...history2, { at: now.toISOString(), actorId: userId, reason, before, after: values }] } } });
    return { id, reused: false };
  });
}

// features/platform/kiosk/auth.ts
var import_node_crypto9 = require("node:crypto");
var KIOSK_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
function kioskApiToken() {
  const token = process.env.KIOSK_API_TOKEN?.trim();
  return token && token.length >= 32 ? token : null;
}
function getKioskOrganizationId() {
  const organizationId = process.env.KIOSK_ORGANIZATION_ID?.trim();
  return organizationId && organizationId.length > 0 ? organizationId : null;
}
function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && (0, import_node_crypto9.timingSafeEqual)(leftBytes, rightBytes);
}
function isKioskTokenValid(suppliedToken) {
  const requiredToken = kioskApiToken();
  return Boolean(
    requiredToken && typeof suppliedToken === "string" && safeEqual(suppliedToken.trim(), requiredToken)
  );
}

// features/keystone/mutations/kiosk.ts
function kioskTenant(credential, organizationId) {
  if (!isKioskTokenValid(credential)) throw new Error("Kiosk operation authorization failed");
  const configuredOrganizationId = getKioskOrganizationId();
  if (!configuredOrganizationId || configuredOrganizationId !== organizationId) {
    throw new Error("Kiosk organization is not configured");
  }
  return configuredOrganizationId;
}
async function authorizeKioskSession(_root, { credential, organizationId }, context) {
  if (!await consumeAuthAttempt(context.prisma, "kiosk-session:global", 30, 15 * 60 * 1e3)) {
    throw new Error("Too many kiosk unlock attempts");
  }
  kioskTenant(credential, organizationId);
  return true;
}
async function kioskSearchMembers(_root, { query, organizationId, credential }, context) {
  const tenantId = kioskTenant(credential, organizationId);
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 100) throw new Error("Kiosk search must be between 2 and 100 characters");
  const members = await context.sudo().query.Member.findMany({
    where: {
      AND: [
        { organization: { id: { equals: tenantId } } },
        { OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { email: { contains: trimmed, mode: "insensitive" } },
          { phone: { contains: trimmed, mode: "insensitive" } }
        ] }
      ]
    },
    take: 10,
    orderBy: [{ joinDate: "desc" }],
    query: `
      id name email phone status membershipTier { id name }
      user { id membership { id status classCreditsRemaining tier { id name } } }
    `
  });
  return members.map((member) => ({
    id: member.id,
    name: member.name || "Unknown",
    email: member.email || "",
    phone: member.phone || "",
    status: member.status,
    membershipTier: member.membershipTier?.name || member.user?.membership?.tier?.name || null,
    membershipStatus: member.user?.membership?.status || null,
    classCreditsRemaining: member.user?.membership?.classCreditsRemaining ?? null
  }));
}
async function kioskRecordMemberCheckIn(_root, args, context) {
  const tenantId = kioskTenant(args.credential, args.organizationId);
  const memberId = args.memberId?.trim() || "";
  const qrCode = args.qrCode?.trim() || "";
  const locationId = args.locationId?.trim() || "";
  if (!memberId && !qrCode || memberId.length > 200 || locationId.length > 200 || qrCode.length > 4096) {
    return { success: false, error: "A valid member or QR identifier is required" };
  }
  let resolvedMemberId = memberId;
  if (qrCode) {
    const validation = validateQRCode(qrCode);
    if (!validation.valid || !validation.memberId || validation.organizationId !== tenantId) {
      return { success: false, error: validation.error || "Invalid or expired QR code" };
    }
    resolvedMemberId = validation.memberId;
  }
  const members = await context.sudo().query.Member.findMany({
    where: { AND: [{ id: { equals: resolvedMemberId } }, { organization: { id: { equals: tenantId } } }] },
    take: 1,
    query: `
      id name status organization { id } membershipTier { name }
      user { name membership { status classCreditsRemaining tier { name } } }
      subscriptions(where: { status: { equals: "active" } }) { id }
    `
  });
  const member = members[0];
  if (!member || member.organization?.id !== tenantId) {
    return { success: false, error: "Member not found. Please use member search or visit the front desk." };
  }
  if (member.status !== "active") {
    return { success: false, error: `Member account is ${member.status}. Please visit the front desk.` };
  }
  const membership = member.user?.membership;
  const validAccess = membership ? membership.status === "active" : Boolean(member.subscriptions?.length);
  if (!validAccess) {
    return { success: false, error: "No active membership. Please see the front desk." };
  }
  try {
    const result = await recordCapacityControlledMemberCheckIn(context.prisma, {
      memberId: resolvedMemberId,
      locationId: locationId || null,
      method: qrCode ? "qr_code" : "manual",
      actor: { userId: "kiosk", organizationId: tenantId, canManageAllRecords: false, trustedKiosk: true }
    });
    return {
      success: true,
      error: null,
      checkInId: result.checkIn.id,
      memberName: member.name || member.user?.name || "Member",
      membershipTier: member.membershipTier?.name || membership?.tier?.name || null,
      checkInTime: new Date(result.checkIn.checkInTime).toISOString(),
      reused: result.reused,
      classCreditsRemaining: membership?.classCreditsRemaining ?? null
    };
  } catch {
    return { success: false, error: "Check-in could not be recorded. Please review access and location at the front desk." };
  }
}
async function kioskRecordGuestCheckIn(_root, args, context) {
  const tenantId = kioskTenant(args.credential, args.organizationId);
  const name = args.name.trim();
  const phone = args.phone?.trim() || "";
  const hostQuery = args.hostMember?.trim() || "";
  const idempotencyKey = args.idempotencyKey.trim();
  if (!name || name.length > 120 || phone.length > 40 || hostQuery.length > 120 || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("Guest check-in details are invalid or too long");
  }
  let hostMemberId = null;
  if (hostQuery) {
    const members = await context.sudo().query.Member.findMany({
      where: {
        AND: [
          { organization: { id: { equals: tenantId } } },
          { OR: [
            { user: { name: { contains: hostQuery, mode: "insensitive" } } },
            { user: { email: { contains: hostQuery, mode: "insensitive" } } }
          ] }
        ]
      },
      take: 1,
      query: "id"
    });
    hostMemberId = members[0]?.id || null;
  }
  const checkIn = await recordControlledGuestCheckIn(context.prisma, {
    guestName: name,
    phone: phone || null,
    organizationId: tenantId,
    hostMemberId,
    idempotencyKey
  });
  return {
    success: true,
    checkInId: checkIn.id,
    guestName: checkIn.guestName,
    checkInTime: new Date(checkIn.checkInTime).toISOString()
  };
}

// features/keystone/mutations/discovery.ts
var import_node_crypto10 = require("node:crypto");
init_classCapacity();
function resolveWindow(from, to) {
  const now = /* @__PURE__ */ new Date();
  const requestedStart = from ? new Date(from) : now;
  if (Number.isNaN(requestedStart.getTime())) throw new Error("Invalid discovery date window.");
  const start = new Date(Math.max(requestedStart.getTime(), now.getTime()));
  const requestedEnd = to ? new Date(to) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1e3);
  if (Number.isNaN(requestedEnd.getTime())) throw new Error("Invalid discovery date window.");
  if (requestedEnd < start) throw new Error("Discovery date window must end after it starts.");
  const maximumEnd = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1e3);
  return {
    from: start.toISOString(),
    to: new Date(Math.min(requestedEnd.getTime(), maximumEnd.getTime())).toISOString()
  };
}
function normalizeLocationName(value) {
  return value?.trim().toLowerCase() ?? null;
}
async function getDiscoveryClassFeed(context, options) {
  const ctx = context.sudo();
  const { from, to } = resolveWindow(options?.from, options?.to);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const instances = await ctx.query.ClassInstance.findMany({
    where: {
      organization: { id: { equals: options.organizationId } },
      date: { gte: from, lte: to },
      isCancelled: { equals: false },
      ...options?.dayOfWeek ? { classSchedule: { dayOfWeek: { equals: options.dayOfWeek } } } : {}
    },
    orderBy: [{ date: "asc" }],
    take: limit,
    query: `
      id
      date
      endsAt
      location { id name address phone isActive }
      maxCapacity
      classSchedule {
        id
        name
        description
        dayOfWeek
        startTime
        endTime
        maxCapacity
      }
      instructor {
        id
        user { id name email }
      }
      bookings {
        id
        status
        waitlistPosition
      }
    `
  });
  const activeLocations = await ctx.query.Location.findMany({
    where: { AND: [{ organization: { id: { equals: options.organizationId } } }, { isActive: { equals: true } }] },
    take: 100,
    query: "id name address phone"
  });
  const requestedLocationName = normalizeLocationName(options?.locationName);
  const requestedLocation = options?.locationId ? activeLocations.find((location2) => location2.id === options.locationId) ?? null : requestedLocationName ? activeLocations.find((location2) => normalizeLocationName(location2.name) === requestedLocationName) ?? null : null;
  if ((options?.locationId || options?.locationName) && !requestedLocation) {
    return [];
  }
  return instances.map((instance) => {
    const confirmedBookings = (instance.bookings ?? []).filter((booking) => booking.status === "confirmed").length;
    const waitlistCount = (instance.bookings ?? []).filter((booking) => booking.status === "waitlist").length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    const spotsRemaining = Math.max(maxCapacity - confirmedBookings, 0);
    const resolvedLocation = instance.location?.isActive ? instance.location : null;
    if (requestedLocation && resolvedLocation?.id !== requestedLocation.id) {
      return null;
    }
    return {
      instanceId: instance.id,
      startsAt: instance.date,
      endsAt: instance.endsAt,
      schedule: {
        id: instance.classSchedule?.id,
        name: instance.classSchedule?.name,
        description: instance.classSchedule?.description ?? null,
        dayOfWeek: instance.classSchedule?.dayOfWeek ?? null,
        startTime: instance.classSchedule?.startTime ?? null,
        endTime: instance.classSchedule?.endTime ?? null
      },
      instructor: instance.instructor?.user ? {
        id: instance.instructor.user.id,
        name: instance.instructor.user.name,
        email: void 0
      } : null,
      location: resolvedLocation ? {
        id: resolvedLocation.id,
        name: resolvedLocation.name,
        address: resolvedLocation.address,
        phone: resolvedLocation.phone
      } : null,
      availability: {
        maxCapacity,
        confirmedBookings,
        waitlistCount,
        spotsRemaining,
        state: spotsRemaining > 0 ? "open" : "waitlist"
      },
      bookingPolicy: {
        requiresActiveMember: true,
        supportsWaitlist: true,
        source: "openfront-gym"
      }
    };
  }).filter(Boolean);
}
async function resolveMemberFromDiscoveryIdentity(context, identity) {
  const ctx = context.sudo();
  if (identity.memberId) {
    const [member] = await ctx.query.Member.findMany({
      where: { AND: [{ organization: { id: { equals: identity.organizationId } } }, { id: { equals: identity.memberId } }] },
      take: 1,
      query: "id email status organization { id } user { id membership { id status classCreditsRemaining } }"
    });
    return member;
  }
  if (identity.memberEmail) {
    const members = await ctx.query.Member.findMany({
      where: {
        AND: [
          { organization: { id: { equals: identity.organizationId } } },
          { OR: [
            { email: { equals: identity.memberEmail } },
            { user: { email: { equals: identity.memberEmail } } }
          ] }
        ]
      },
      take: 1,
      query: "id email status organization { id } user { id membership { id status classCreditsRemaining } }"
    });
    return members[0] ?? null;
  }
  return null;
}
async function createDiscoveryBooking(context, input) {
  const ctx = context.sudo();
  const member = await resolveMemberFromDiscoveryIdentity(context, {
    organizationId: input.organizationId,
    memberId: input.memberId,
    memberEmail: input.memberEmail
  });
  if (!member) {
    throw new Error("No member matched the discovery booking identity.");
  }
  if (member.status !== "active") {
    throw new Error(`Member status is ${member.status}.`);
  }
  if (member.user?.membership?.status !== "active") {
    throw new Error("Member does not have an active membership.");
  }
  const existing = await ctx.query.ClassBooking.findMany({
    where: {
      AND: [
        { organization: { id: { equals: input.organizationId } } },
        { member: { id: { equals: member.id } } },
        { classInstance: { id: { equals: input.classInstanceId } } },
        { status: { in: ["confirmed", "waitlist"] } }
      ]
    },
    take: 1,
    query: "id status waitlistPosition"
  });
  if (existing[0]) {
    return {
      bookingId: existing[0].id,
      bookingStatus: existing[0].status,
      waitlistPosition: existing[0].waitlistPosition ?? null,
      creditsRemaining: member.user.membership.classCreditsRemaining,
      memberId: member.id,
      reused: true
    };
  }
  const result = await createCapacityControlledBooking(ctx.prisma, {
    classInstanceId: input.classInstanceId,
    memberId: member.id,
    actorUserId: member.user.id,
    actorOrganizationId: input.organizationId,
    actorCanManageAllRecords: true,
    capacityMode: "waitlist"
  });
  return {
    bookingId: result.bookingId,
    bookingStatus: result.status,
    waitlistPosition: result.waitlistPosition ?? null,
    creditsRemaining: result.creditsRemaining,
    memberId: member.id,
    reused: false
  };
}
async function authorizeDiscovery(context, credential, partner, requiredScope) {
  if (credential.startsWith("gym_")) {
    if (!await consumeAuthAttempt(context.prisma, "discovery-auth:global", 1e3, 60 * 1e3)) throw new Error("Too many discovery authentication attempts");
    const digest2 = (0, import_node_crypto10.createHash)("sha256").update(credential).digest("hex");
    const stored = await context.prisma.integrationCredential.findUnique({ where: { digest: digest2 }, include: { organization: true } });
    if (!stored || stored.revokedAt || !stored.expiresAt || stored.expiresAt <= /* @__PURE__ */ new Date() || stored.organization?.status !== "active") throw new Error("Unauthorized discovery request");
    if (stored.partner !== partner.trim() || !Array.isArray(stored.scopes) || !stored.scopes.includes(requiredScope)) throw new Error("Unauthorized discovery scope or partner");
    if (!await consumeAuthAttempt(context.prisma, `discovery-key:${stored.id}`, 120, 60 * 1e3)) throw new Error("Too many discovery requests");
    return { organizationId: stored.organizationId, partner: stored.partner, mode: "managed-key" };
  }
  const configuredKey = process.env.DISCOVERY_API_KEY?.trim();
  const organizationId = process.env.DISCOVERY_ORGANIZATION_ID?.trim();
  if (!configuredKey || configuredKey.length < 32 || !organizationId) throw new Error("Discovery API is not configured");
  const scopes = new Set((process.env.DISCOVERY_API_SCOPES || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (!scopes.has(requiredScope)) throw new Error(`Discovery credential is missing required scope: ${requiredScope}`);
  const normalizedPartner = partner.trim().slice(0, 120) || "authorized-partner";
  const allowlist = new Set((process.env.DISCOVERY_PARTNER_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (allowlist.size && !allowlist.has(normalizedPartner)) throw new Error("Discovery partner is not authorized");
  if (!await consumeAuthAttempt(context.prisma, "discovery-auth:global", 1e3, 60 * 1e3)) {
    throw new Error("Too many discovery authentication attempts");
  }
  const supplied = Buffer.from(credential || "");
  const configured = Buffer.from(configuredKey);
  if (supplied.length !== configured.length || !(0, import_node_crypto10.timingSafeEqual)(supplied, configured)) {
    throw new Error("Unauthorized discovery request");
  }
  if (!await consumeAuthAttempt(context.prisma, `discovery:${normalizedPartner}`, 120, 60 * 1e3)) {
    throw new Error("Too many discovery requests");
  }
  const organization3 = await context.sudo().query.Organization.findMany({
    where: { AND: [{ id: { equals: organizationId } }, { status: { equals: "active" } }] },
    take: 1,
    query: "id"
  });
  if (!organization3[0]) throw new Error("Discovery organization is not active");
  return { organizationId, partner: normalizedPartner, mode: "key-authenticated" };
}
async function getDiscoveryClasses(_root, args, context) {
  const access3 = await authorizeDiscovery(context, args.credential, args.partner || "", "classes:read");
  const classes = await getDiscoveryClassFeed(context, {
    organizationId: access3.organizationId,
    from: args.from,
    to: args.to,
    dayOfWeek: args.dayOfWeek,
    locationId: args.locationId,
    locationName: args.locationName,
    limit: args.limit ?? void 0
  });
  return { source: "openfront-gym", ...access3, count: classes.length, classes };
}
async function bookDiscoveryClass(_root, args, context) {
  const access3 = await authorizeDiscovery(context, args.credential, args.partner || "", "bookings:create");
  const classInstanceId = args.classInstanceId.trim();
  const memberId = args.memberId?.trim() || null;
  const memberEmail = args.memberEmail?.trim().toLowerCase() || null;
  if (!classInstanceId || classInstanceId.length > 200 || !memberId && !memberEmail || (memberId?.length || 0) > 200 || (memberEmail?.length || 0) > 254) {
    throw new Error("Discovery booking request is invalid");
  }
  const booking = await createDiscoveryBooking(context, {
    organizationId: access3.organizationId,
    classInstanceId,
    memberId,
    memberEmail
  });
  return { success: true, ...access3, booking };
}

// features/keystone/mutations/contact.ts
var import_nodemailer = require("nodemailer");
async function submitContactForm(_root, { data }, context) {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = normalizeAuthIdentity(data.email);
  const phone = data.phone?.trim() || "";
  const topic = data.topic?.trim() || "General support";
  const message = data.message.trim();
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 || /[\r\n]/.test(`${firstName}${lastName}${topic}`) || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || phone.length > 40 || topic.length > 120 || !message || message.length > 5e3) {
    throw new Error("Contact form details are invalid or too long");
  }
  if (!await consumeAuthAttempt(context.prisma, "contact:global", 200, 15 * 60 * 1e3) || !await consumeAuthAttempt(context.prisma, `contact:${email}`, 5, 15 * 60 * 1e3)) {
    throw new Error("Too many contact form submissions");
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error("Contact email is not configured");
  const transport2 = (0, import_nodemailer.createTransport)({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : void 0
  });
  const senderName = `${firstName} ${lastName}`;
  const delivery = await transport2.sendMail({
    to: process.env.CONTACT_FORM_TO || process.env.SMTP_FROM,
    from: process.env.SMTP_FROM,
    replyTo: email,
    subject: `[Gym Contact] ${topic} \u2014 ${senderName}`,
    text: [
      `Name: ${senderName}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `Topic: ${topic}`,
      "",
      message
    ].join("\n")
  });
  const accepted = Array.isArray(delivery.accepted) ? delivery.accepted : [];
  if (!delivery.messageId || accepted.length === 0) {
    throw new Error("Contact email delivery was not accepted by the configured provider");
  }
  return true;
}

// features/keystone/mutations/paymentWebhook.ts
init_operational_notices();
init_membership_credits();
init_classCapacity();
function mapStripeStatusToSubscription(status, collectionPaused = false) {
  if (collectionPaused) return "paused";
  if (status === "active" || status === "trialing") return "active";
  if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(status)) return "past_due";
  if (status === "paused") return "paused";
  return "cancelled";
}
function paymentEventReplayEvidence(event) {
  const object = event.data.object;
  let evidence;
  if (event.type.startsWith("invoice.")) {
    evidence = Object.fromEntries(["id", "subscription", "amount_paid", "amount_due", "currency", "period_start", "period_end", "billing_reason", "status_transitions", "payment_intent", "charge", "hosted_invoice_url", "subtotal", "total", "tax", "amount_remaining"].map((key) => [key, object[key] ?? null]));
    for (const key of ["subscription", "payment_intent", "charge"]) if (evidence[key] && typeof evidence[key] === "object") evidence[key] = evidence[key].id;
    evidence.lines = { data: (object.lines?.data || []).map((line) => ({ id: line.id, amount: line.amount, description: line.description, period: line.period, quantity: line.quantity, type: line.type, proration: line.proration, price: line.price ? { id: line.price.id } : null })) };
  } else {
    evidence = Object.fromEntries(["id", "mode", "metadata", "client_reference_id", "amount", "currency", "amount_refunded", "payment_intent", "status"].map((key) => [key, object[key] ?? null]));
    if (evidence.payment_intent && typeof evidence.payment_intent === "object") evidence.payment_intent = evidence.payment_intent.id;
    if (evidence.metadata) evidence.metadata = { paymentSessionKey: evidence.metadata.paymentSessionKey ?? null };
  }
  return { id: event.id, type: event.type, created: event.created, livemode: event.livemode, data: { object: evidence } };
}
async function claimEvent(context, providerId, organizationId, event) {
  const now = /* @__PURE__ */ new Date();
  try {
    return await context.prisma.$transaction(async (transaction) => {
      await lockTransactionKey(transaction, `payment-event:${providerId}:${event.id}`);
      const existing = await transaction.paymentEvent.findUnique({
        where: { paymentProviderId_providerEventId: { paymentProviderId: providerId, providerEventId: event.id } }
      });
      if (existing?.status === "processed" || existing?.status === "ignored") return null;
      if (existing?.status === "processing" && existing.lockedUntil && existing.lockedUntil > now) throw new Error("Payment event is already processing; retry later");
      if (existing) {
        return transaction.paymentEvent.update({ where: { id: existing.id }, data: { status: "processing", attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + 5 * 60 * 1e3), lastError: "" }, select: { id: true, status: true, attempts: true } });
      }
      return transaction.paymentEvent.create({
        data: { providerEventId: event.id, eventType: event.type, status: "processing", attempts: 1, lockedUntil: new Date(now.getTime() + 5 * 60 * 1e3), organizationId, paymentProviderId: providerId, data: { event: paymentEventReplayEvidence(event) } },
        select: { id: true, status: true, attempts: true }
      });
    });
  } catch (error) {
    if (error?.code === "P2002") throw new Error("Payment event claim conflicted; retry later");
    throw error;
  }
}
async function resolveTier(transaction, subscription, organizationId) {
  const metadataTierId = subscription.metadata?.tierId;
  if (metadataTierId) {
    const tier = await transaction.membershipTier.findFirst({
      where: { id: metadataTierId, organizationId },
      select: { id: true, classCreditsPerMonth: true }
    });
    if (tier) return tier;
  }
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  return transaction.membershipTier.findFirst({
    where: {
      organizationId,
      OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }]
    },
    select: { id: true, classCreditsPerMonth: true }
  });
}
async function findUserForSubscription(transaction, subscription, organizationId) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const select29 = { id: true, organizationId: true, stripeCustomerId: true };
  if (subscription.metadata?.userId) {
    const user2 = await transaction.user.findFirst({
      where: { id: subscription.metadata.userId, organizationId },
      select: select29
    });
    if (user2?.stripeCustomerId && user2.stripeCustomerId !== customerId) throw new Error("Subscription customer does not match the existing user");
    if (user2) return { user: user2, customerId };
  }
  const user = await transaction.user.findFirst({
    where: { stripeCustomerId: customerId, organizationId },
    select: select29
  });
  return user ? { user, customerId } : null;
}
function assertRetrievedSubscription(incomingSubscriptionId, subscription) {
  if (subscription.id !== incomingSubscriptionId) {
    throw new Error("Payment provider returned a different subscription during reconciliation");
  }
  return subscription;
}
async function syncSubscription(context, adapter, incomingSubscription, organizationId, event) {
  if (!event.id || !Number.isInteger(event.created) || event.created < 0) {
    throw new Error("Stripe subscription event ordering evidence is invalid");
  }
  let subscription = assertRetrievedSubscription(
    incomingSubscription.id,
    await adapter.retrieveSubscription(incomingSubscription.id)
  );
  return context.prisma.$transaction(async (transaction) => {
    await lockTransactionKey(
      transaction,
      `stripe-subscription:${organizationId}:${incomingSubscription.id}`
    );
    const existingProjection = await transaction.subscription.findUnique({
      where: { stripeSubscriptionId: incomingSubscription.id }
    });
    if (existingProjection && existingProjection.organizationId !== organizationId) {
      throw new Error("Stripe subscription is assigned to a different organization");
    }
    if (existingProjection && event.created < existingProjection.providerEventCreated) {
      return { applied: false, stale: true };
    }
    if (existingProjection && event.created === existingProjection.providerEventCreated && event.id === existingProjection.providerEventId) {
      return { applied: false, duplicate: true };
    }
    if (existingProjection && event.created === existingProjection.providerEventCreated && event.id !== existingProjection.providerEventId) {
      subscription = assertRetrievedSubscription(
        incomingSubscription.id,
        await adapter.retrieveSubscription(incomingSubscription.id)
      );
    }
    const owner = await findUserForSubscription(transaction, subscription, organizationId);
    if (!owner) throw new Error("Subscription owner prerequisite missing; retry reconciliation");
    const { user, customerId } = owner;
    const member = await transaction.member.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true }
    });
    if (!member) throw new Error("Subscription member prerequisite missing; retry reconciliation");
    const checkout = await transaction.paymentSession.findFirst({ where: { organizationId, userId: user.id, idempotencyKey: subscription.metadata?.paymentSessionKey || "__missing__" } });
    const agreement = checkout?.data?.agreementSnapshot;
    const tier = await resolveTier(transaction, subscription, organizationId);
    const membership = await transaction.membership.findFirst({
      where: { memberId: user.id, organizationId }
    });
    if (membership && membership.stripeSubscriptionId !== subscription.id) throw new Error("Another subscription owns this membership; checkout reconciliation required");
    await lockTransactionKey(transaction, `member:${member.id}`);
    const membershipStatus = mapStripeStatusToMembership(
      subscription.status,
      Boolean(subscription.pause_collection)
    );
    const billingCycle = subscription.metadata?.billingCycle === "annual" ? "annual" : "monthly";
    const nextBillingDate = subscription.current_period_end ? new Date(subscription.current_period_end * 1e3) : null;
    const startDate = subscription.current_period_start ? new Date(subscription.current_period_start * 1e3) : new Date(event.created * 1e3);
    const eventTime = new Date(event.created * 1e3);
    const membershipData = {
      ...tier ? { tierId: tier.id } : {},
      status: membershipStatus,
      billingCycle,
      startDate,
      nextBillingDate,
      autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
      stripeSubscriptionId: subscription.id,
      ...membershipStatus === "cancelled" ? { cancelledAt: eventTime, freezeStartDate: null, freezeEndDate: null } : membershipStatus === "frozen" ? {} : subscription.cancel_at_period_end ? { cancelledAt: null } : { cancelledAt: null, cancelReason: "", freezeStartDate: null, freezeEndDate: null }
    };
    if (!membership && !agreement?.version) throw new Error("Subscription checkout agreement prerequisite missing; retry reconciliation");
    if (membership) {
      await transaction.membership.update({ where: { id: membership.id }, data: membershipData });
    } else if (member && tier) {
      await transaction.membership.create({
        data: {
          organizationId,
          memberId: user.id,
          tierId: tier.id,
          ...membershipData,
          agreementSnapshot: agreement,
          creditPeriodStart: startDate,
          creditPeriodEnd: nextBillingDate,
          classCreditsRemaining: membershipStatus === "active" ? agreement.classCreditsPerMonth ?? 0 : 0
        }
      });
    }
    if (member && tier) {
      await transaction.member.updateMany({
        where: { id: member.id, organizationId },
        data: { membershipTierId: tier.id }
      });
    }
    if (member) {
      const projectionData = {
        memberId: member.id,
        ...tier ? { membershipTierId: tier.id } : {},
        status: mapStripeStatusToSubscription(
          subscription.status,
          Boolean(subscription.pause_collection)
        ),
        startDate,
        nextBillingDate,
        cancelledAt: subscription.status === "canceled" ? eventTime : null,
        pausedAt: subscription.status === "paused" || subscription.pause_collection ? eventTime : null,
        stripeCustomerId: customerId,
        providerEventCreated: event.created,
        providerEventId: event.id
      };
      if (existingProjection) {
        await transaction.subscription.update({
          where: { id: existingProjection.id },
          data: projectionData
        });
      } else if (tier) {
        await transaction.subscription.create({
          data: {
            organizationId,
            stripeSubscriptionId: subscription.id,
            ...projectionData
          }
        });
      }
    }
    const reconciled = await transaction.membership.findFirst({ where: { memberId: user.id, organizationId } });
    if (reconciled) await reviewFutureMembershipBookings(transaction, reconciled);
    return { applied: true };
  }, { maxWait: 1e4, timeout: 3e4 });
}
async function recordInvoicePayment(context, providerId, organizationId, invoice, status, eventCreated) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;
  if (!invoice.id || !Number.isInteger(eventCreated)) throw new Error("Invoice event identity is invalid");
  const amount = status === "succeeded" ? invoice.amount_paid : invoice.amount_due;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invoice amount must use non-negative minor units");
  return context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `stripe-subscription:${organizationId}:${subscriptionId}`);
    await lockTransactionKey(tx, `invoice:${organizationId}:${invoice.id}`);
    let membership = await tx.membership.findFirst({ where: { organizationId, stripeSubscriptionId: subscriptionId } });
    if (!membership) throw new Error("Invoice membership prerequisite missing; retry reconciliation");
    const member = await tx.member.findFirst({ where: { organizationId, userId: membership.memberId } });
    if (!member) throw new Error("Invoice member prerequisite missing; retry reconciliation");
    await lockTransactionKey(tx, `member:${member.id}`);
    membership = await tx.membership.findFirst({ where: { id: membership.id, organizationId, stripeSubscriptionId: subscriptionId } });
    if (!membership) throw new Error("Invoice membership changed while acquiring member lock");
    const existingGym = await tx.gymPayment.findUnique({ where: { stripeInvoiceId: invoice.id } });
    const existingMember = await tx.membershipPayment.findUnique({ where: { stripeInvoiceId: invoice.id } });
    if ([existingGym, existingMember].some((p) => p && p.organizationId !== organizationId)) throw new Error("Invoice belongs to another organization");
    const settled = ["succeeded", "refunded"].includes(existingGym?.status) || ["completed", "disputed", "refunded"].includes(existingMember?.status);
    const session = await tx.paymentSession.findFirst({ where: { organizationId, providerSubscriptionId: subscriptionId } });
    const effectiveAt = status === "succeeded" ? invoice.status_transitions?.paid_at || eventCreated : eventCreated;
    const paymentDate = new Date(effectiveAt * 1e3);
    const common = {
      organizationId,
      amount,
      currencyCode: invoice.currency.toUpperCase(),
      paymentDate,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id,
      stripeChargeId: typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id,
      receiptNumber: `STRIPE-${invoice.id}`,
      description: `${membership.billingCycle === "annual" ? "Annual" : "Monthly"} membership payment`
    };
    const gymData = {
      ...common,
      memberId: member.id,
      paymentProviderId: providerId,
      paymentSessionId: session?.id,
      status,
      metadata: {
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        billingReason: invoice.billing_reason,
        subtotal: invoice.subtotal,
        total: invoice.total,
        tax: invoice.tax,
        amountPaid: invoice.amount_paid,
        amountRemaining: invoice.amount_remaining,
        lines: invoice.lines?.data.map((line) => ({ id: line.id, amount: line.amount, description: line.description, period: line.period, quantity: line.quantity, priceId: line.price?.id })) || []
      }
    };
    const memberData = {
      ...common,
      memberId: membership.memberId,
      membershipId: membership.id,
      paymentType: "membership",
      status: status === "succeeded" ? "completed" : "failed",
      paymentMethod: "credit-card",
      receiptUrl: invoice.hosted_invoice_url || "",
      isRecurring: true
    };
    if (!settled) {
      if (existingGym) await tx.gymPayment.update({ where: { id: existingGym.id }, data: gymData });
      else await tx.gymPayment.create({ data: gymData });
      if (existingMember) await tx.membershipPayment.update({ where: { id: existingMember.id }, data: memberData });
      else await tx.membershipPayment.create({ data: memberData });
    } else if (status === "succeeded") {
      const refundAmount = Math.max(existingGym?.refundAmount || 0, existingMember?.refundAmount || 0);
      const refundEvidence = refundAmount ? { refundAmount, refundedAt: existingGym?.refundedAt || existingMember?.refundedAt } : {};
      const repairedGym = { ...gymData, ...refundEvidence, status: refundAmount >= amount && refundAmount > 0 ? "refunded" : "succeeded" };
      const repairedMember = { ...memberData, ...refundEvidence, status: refundAmount >= amount && refundAmount > 0 ? "refunded" : "completed" };
      if (!existingGym) await tx.gymPayment.create({ data: repairedGym });
      else if (!["succeeded", "refunded"].includes(existingGym.status)) await tx.gymPayment.update({ where: { id: existingGym.id }, data: repairedGym });
      if (!existingMember) await tx.membershipPayment.create({ data: repairedMember });
      else if (!["completed", "disputed", "refunded"].includes(existingMember.status)) await tx.membershipPayment.update({ where: { id: existingMember.id }, data: repairedMember });
    }
    const recurringLine = invoice.lines?.data.find((line) => line.type === "subscription" && !line.proration);
    const periodStart = recurringLine?.period?.start ?? invoice.period_start;
    const periodEnd = recurringLine?.period?.end ?? invoice.period_end;
    const eventAt = new Date(eventCreated * 1e3);
    const isOlderPeriod = membership.creditPeriodEnd && periodEnd * 1e3 < new Date(membership.creditPeriodEnd).getTime();
    const isOlderEvent = membership.billingEventAt && eventAt < new Date(membership.billingEventAt);
    if (isOlderPeriod || isOlderEvent || settled && status === "failed") return { applied: false, stale: true };
    const data = { billingEventAt: eventAt };
    if (!["cancelled", "frozen"].includes(membership.status) && (membership.status !== "expired" || membership.autoRenew && status === "succeeded" && periodEnd * 1e3 > Date.now())) data.status = status === "succeeded" ? "active" : "past-due";
    if (status === "succeeded" && ["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "")) {
      if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd) || periodEnd <= periodStart) throw new Error("Invoice service period is invalid");
      data.creditPeriodStart = new Date(periodStart * 1e3);
      data.creditPeriodEnd = new Date(periodEnd * 1e3);
    }
    const updated = await tx.membership.update({ where: { id: membership.id }, data });
    if (updated.status === "active" && updated.creditPeriodStart && new Date(updated.creditPeriodStart) <= /* @__PURE__ */ new Date() && new Date(updated.creditPeriodEnd) > /* @__PURE__ */ new Date()) await ensureMonthlyCreditGrant(tx, updated, /* @__PURE__ */ new Date());
    await reviewFutureMembershipBookings(tx, updated);
    if (status === "failed") {
      await createFinanceException(tx, { organizationId, key: `invoice:${invoice.id}`, kind: "failed-payment", reference: invoice.id, summary: "Membership invoice collection failed; reconcile payment and contact member." });
      await enqueueOperationalNotice(tx, { organizationId, memberId: member.id, key: `invoice:${invoice.id}:${eventCreated}`, kind: "billing", message: "Membership payment needs attention. Open your billing portal or contact the front desk." });
    }
    return { applied: true };
  });
}
function monotonicRefundAmount(paymentAmount, currentRefundAmount, incomingRefundAmount) {
  if (!Number.isInteger(paymentAmount) || paymentAmount < 0 || !Number.isInteger(incomingRefundAmount)) {
    throw new Error("Refund evidence must use integer minor units");
  }
  const current = Math.max(0, Math.min(paymentAmount, currentRefundAmount ?? 0));
  const incoming = Math.max(0, Math.min(paymentAmount, incomingRefundAmount));
  return Math.max(current, incoming);
}
async function recordRefund(context, charge, organizationId, effectiveAt = /* @__PURE__ */ new Date()) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId || charge.amount_refunded <= 0) return;
  await context.prisma.$transaction(async (transaction) => {
    await lockTransactionKey(transaction, `payment-refund:${organizationId}:${paymentIntentId}`);
    let gymPayment = await transaction.gymPayment.findFirst({
      where: { organizationId, stripePaymentIntentId: paymentIntentId }
    });
    if (gymPayment) {
      await lockTransactionKey(transaction, `refund:${gymPayment.id}`);
      gymPayment = await transaction.gymPayment.findFirst({
        where: { id: gymPayment.id, organizationId, stripePaymentIntentId: paymentIntentId }
      });
    }
    const membershipPayment = await transaction.membershipPayment.findFirst({
      where: { organizationId, stripePaymentIntentId: paymentIntentId }
    });
    if (!gymPayment || !membershipPayment && gymPayment.stripeInvoiceId) throw new Error("Refund receipt prerequisite missing; retry reconciliation after invoice processing");
    const refundedAt = effectiveAt;
    if (gymPayment) {
      const refundAmount = monotonicRefundAmount(gymPayment.amount, gymPayment.refundAmount, charge.amount_refunded);
      const status = refundAmount >= gymPayment.amount ? "refunded" : "succeeded";
      if (refundAmount !== (gymPayment.refundAmount ?? 0) || status !== gymPayment.status) {
        await transaction.gymPayment.update({
          where: { id: gymPayment.id },
          data: { status, refundAmount, refundedAt }
        });
      }
    }
    if (membershipPayment) {
      const refundAmount = monotonicRefundAmount(
        membershipPayment.amount,
        membershipPayment.refundAmount,
        charge.amount_refunded
      );
      const status = refundAmount >= membershipPayment.amount ? "refunded" : "completed";
      if (refundAmount !== (membershipPayment.refundAmount ?? 0) || status !== membershipPayment.status) {
        await transaction.membershipPayment.update({
          where: { id: membershipPayment.id },
          data: { status, refundAmount, refundedAt }
        });
      }
    }
  });
}
async function expireCheckoutSession(context, session, organizationId) {
  const key = session.metadata?.paymentSessionKey || session.client_reference_id;
  if (!key) return;
  const sessions = await context.sudo().query.PaymentSession.findMany({
    where: { AND: [{ idempotencyKey: { equals: key } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id status"
  });
  const localSession = sessions[0];
  if (!localSession || localSession.status === "completed") return;
  await context.sudo().query.PaymentSession.updateOne({
    where: { id: localSession.id },
    data: { status: "expired", expiresAt: (/* @__PURE__ */ new Date()).toISOString() },
    query: "id"
  });
}
async function replayPaymentEvent(_root, { eventId }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !session?.data?.role?.canManageAllRecords || !organizationId) throw new Error("Payment reconciliation management permission required");
  const record = await context.prisma.paymentEvent.findFirst({ where: { id: eventId, organizationId } });
  if (!record || !record.data?.event || !["failed", "processing"].includes(record.status)) throw new Error("Replayable payment event not found");
  if (record.status === "processing" && record.lockedUntil > /* @__PURE__ */ new Date()) throw new Error("Payment event is currently processing");
  const provider = await context.sudo().query.PaymentProvider.findOne({ where: { id: record.paymentProviderId }, query: "id adapterKey organization { id }" });
  if (!provider || provider.organization?.id !== organizationId) throw new Error("Payment event provider organization mismatch");
  const event = record.data.event;
  if (event.id !== record.providerEventId || event.type !== record.eventType) throw new Error("Stored payment event evidence mismatch");
  const adapter = await getPaymentProviderAdapter(provider.adapterKey);
  return processVerifiedPaymentEvent(context, provider, adapter, organizationId, event);
}
async function processVerifiedPaymentEvent(context, provider, adapter, organizationId, event) {
  const eventRecord = await claimEvent(context, provider.id, organizationId, event);
  if (!eventRecord) return { received: true, duplicate: true };
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription") await provisionMembershipFromCheckoutSession(session.id, organizationId, context);
        break;
      }
      case "checkout.session.expired":
        await expireCheckoutSession(context, event.data.object, organizationId);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(
          context,
          adapter,
          event.data.object,
          organizationId,
          event
        );
        break;
      case "invoice.paid":
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object, "succeeded", event.created);
        break;
      case "invoice.payment_failed":
        await recordInvoicePayment(context, provider.id, organizationId, event.data.object, "failed", event.created);
        break;
      case "invoice.payment_action_required":
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "payout.failed":
      case "payout.paid": {
        const object = event.data.object;
        await context.prisma.$transaction(async (tx) => {
          await createFinanceException(tx, {
            organizationId,
            key: event.id,
            kind: event.type,
            reference: object.id,
            summary: `Provider event ${event.type}; amount ${object.amount ?? object.amount_due ?? "unknown"} ${object.currency ?? ""}. Review provider evidence and record reconciliation.`
          });
          if (event.type.startsWith("charge.dispute.")) {
            const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
            if (paymentIntentId) {
              await lockTransactionKey(tx, `payment-refund:${organizationId}:${paymentIntentId}`);
              const payment = await tx.membershipPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } });
              if (payment && ["completed", "disputed"].includes(payment.status)) await tx.membershipPayment.update({ where: { id: payment.id }, data: { status: object.status === "won" ? "completed" : "disputed" } });
            }
          }
        });
        break;
      }
      case "charge.refunded":
        await recordRefund(context, event.data.object, organizationId, new Date(event.created * 1e3));
        break;
      default:
        await context.prisma.paymentEvent.updateMany({
          where: { id: eventRecord.id, status: "processing", attempts: eventRecord.attempts },
          data: { status: "ignored", processedAt: /* @__PURE__ */ new Date(), lockedUntil: null }
        });
        return { received: true, ignored: true };
    }
    await context.prisma.paymentEvent.updateMany({
      where: { id: eventRecord.id, status: "processing", attempts: eventRecord.attempts },
      data: { status: "processed", processedAt: /* @__PURE__ */ new Date(), lockedUntil: null }
    });
    return { received: true };
  } catch (error) {
    await context.prisma.paymentEvent.updateMany({
      where: { id: eventRecord.id, status: "processing", attempts: eventRecord.attempts },
      data: {
        status: "failed",
        lockedUntil: null,
        lastError: error instanceof Error ? error.message : "Webhook processing failed"
      }
    });
    throw error;
  }
}

// features/keystone/mutations/operations.ts
var import_node_crypto11 = require("node:crypto");
init_operational_notices();
init_operational_policy();
function operationsActor(context, manager = true) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  if (manager && !session.data?.role?.canManageAllRecords) throw new Error("Operations manager access required");
  return { organizationId: String(organizationId), userId: String(session.itemId) };
}
function boundedText(value, name, max = 2e3) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} is required (maximum ${max} characters)`);
  return value.trim();
}
function dateValue(value, required = false) {
  if (!value && !required) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("A valid date is required");
  return date;
}
async function memberInTenant(tx, organizationId, id, userId) {
  const member = await tx.member.findFirst({ where: { organizationId, ...id ? { id: String(id) } : {}, ...userId ? { userId } : {} } });
  if (!member) throw new Error("Member not found");
  return member;
}
function history(row, userId, action, note) {
  return [...Array.isArray(row.history) ? row.history : [], { at: (/* @__PURE__ */ new Date()).toISOString(), userId, action, note }];
}
async function operationsWorkspace(_root, { caseAfterId }, context) {
  const { organizationId } = operationsActor(context);
  const tx = context.prisma;
  const where = { organizationId };
  const [notices, cases, policies, credentials, members, locations, paymentEvents, resources] = await Promise.all([
    tx.operationalNotice.findMany({ where: { ...where, status: { not: "resolved" } }, take: 100, orderBy: { createdAt: "asc" }, include: { member: { select: { id: true, name: true, email: true, phone: true } } } }),
    tx.operationsCase.findMany({ where: { ...where, status: { not: "resolved" }, ...caseAfterId ? { id: { gt: caseAfterId } } : {} }, take: 101, orderBy: { id: "asc" } }),
    tx.participationPolicy.findMany({ where, take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    tx.integrationCredential.findMany({ where: { ...where, revokedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } }, take: 100, orderBy: { expiresAt: "asc" }, select: { id: true, label: true, partner: true, scopes: true, expiresAt: true, revokedAt: true } }),
    tx.member.findMany({ where, take: 200, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    tx.location.findMany({ where, take: 100, select: { id: true, name: true } }),
    tx.paymentEvent.findMany({ where: { ...where, OR: [{ status: "failed" }, { status: "processing", lockedUntil: { lt: /* @__PURE__ */ new Date() } }] }, take: 100, orderBy: { createdAt: "asc" }, select: { id: true, providerEventId: true, eventType: true, status: true, attempts: true } }),
    tx.gymResource.findMany({ where, take: 100, orderBy: { name: "asc" }, select: { id: true, name: true, capacity: true, isActive: true, isExclusive: true, setupBufferMinutes: true, cleanupBufferMinutes: true } })
  ]);
  return { notices, cases: cases.slice(0, 100), nextCaseAfterId: cases.length > 100 ? cases[99].id : null, policies, credentials, members, locations, paymentEvents, resources, caseRequestKey: (0, import_node_crypto11.randomBytes)(24).toString("hex"), evidenceRequestKey: (0, import_node_crypto11.randomBytes)(24).toString("hex"), limits: { queue: 100, memberSelector: 200 }, waiverConfigured: policies.length > 0 };
}
async function participationWorkspace(_root, _args, context) {
  const { organizationId, userId } = operationsActor(context, false);
  const member = await memberInTenant(context.prisma, organizationId, null, userId);
  const [policy, evidence, requests] = await Promise.all([
    context.prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    context.prisma.participationEvidence.findMany({ where: { organizationId, memberId: member.id }, take: 20, orderBy: { createdAt: "desc" } }),
    context.prisma.operationsCase.findMany({ where: { organizationId, memberId: member.id, kind: "privacy" }, take: 20, orderBy: { createdAt: "desc" }, select: { id: true, summary: true, status: true, createdAt: true, closedAt: true } })
  ]);
  return { policy, evidence, requests, requestKey: (0, import_node_crypto11.randomBytes)(24).toString("hex") };
}
async function runOperationsCommand(_root, { command, data }, context) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Command data is required");
  const memberCommand = ["privacy.request", "waiver.accept", "waiver.revoke"].includes(command);
  const { organizationId, userId } = operationsActor(context, !memberCommand);
  return context.transaction(async (tc) => {
    const tx = tc.prisma;
    if (command.startsWith("waiver.") || command.startsWith("policy.") || command.startsWith("case.") || command.startsWith("privacy.")) await lockParticipationPolicy(tx, organizationId);
    if (command === "policy.publish") {
      if (data.adultOnly === false) throw new Error("Guardian-supported participation is not implemented; this workflow supports adults only");
      const retentionDays = Number(data.retentionDays);
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error("Retention must be 1\u20133650 days");
      const documentReference = boundedText(data.documentReference, "Document reference", 1e3);
      if (!/^https:\/\//.test(documentReference)) throw new Error("Publish an HTTPS document reference");
      return tx.participationPolicy.create({ data: {
        organizationId,
        version: boundedText(data.version, "Version", 100),
        documentReference,
        enforceWaiver: data.enforceWaiver !== false,
        adultOnly: true,
        healthPurpose: boundedText(data.healthPurpose, "Health-data purpose", 1e3),
        retentionDays,
        publishedBy: userId
      } });
    }
    if (command === "waiver.verify" || command === "waiver.accept") {
      const member = await memberInTenant(tx, organizationId, data.memberId, command === "waiver.accept" ? userId : void 0);
      const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!policy || policy.id !== data.policyId) throw new Error("Review the current participation policy before accepting");
      if (data.accepted !== true) throw new Error("Explicit acceptance or staff verification is required");
      const expiresAt = command === "waiver.verify" ? dateValue(data.expiresAt) : null;
      if (expiresAt && expiresAt <= /* @__PURE__ */ new Date()) throw new Error("Verification expiry must be in the future");
      const documentReference = command === "waiver.verify" ? boundedText(data.documentReference, "External signed document reference", 1e3) : policy.documentReference;
      const key = operationKey(organizationId, `waiver:${member.id}:${policy.id}:${boundedText(data.requestKey, "Request key", 200)}`);
      const requestHash = operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, documentReference, expiresAt, healthConsent: data.healthConsent === true }));
      const existing = await tx.participationEvidence.findUnique({ where: { key } });
      if (existing && existing.requestHash !== requestHash) throw new Error("This request key was already used for different waiver evidence");
      return tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
        organizationId,
        memberId: member.id,
        policyId: policy.id,
        key,
        requestHash,
        documentReference,
        verifiedBy: userId,
        acceptedAt: /* @__PURE__ */ new Date(),
        expiresAt,
        healthConsent: data.healthConsent === true
      } });
    }
    if (command === "waiver.revoke") {
      const member = await memberInTenant(tx, organizationId, null, userId);
      const row = await tx.participationEvidence.findFirst({ where: { id: String(data.id), organizationId, memberId: member.id } });
      if (!row) throw new Error("Evidence not found");
      if (row.revokedAt) return { id: row.id, reused: true };
      if (row.healthConsent) await tx.operationsCase.upsert({ where: { key: operationKey(organizationId, `consent-withdrawal:${row.id}`) }, update: {}, create: {
        organizationId,
        memberId: member.id,
        key: operationKey(organizationId, `consent-withdrawal:${row.id}`),
        kind: "privacy",
        summary: "Member withdrew optional health consent. Review purpose and retention; clear health fields when appropriate.",
        status: "open",
        openedBy: userId,
        history: []
      } });
      return tx.participationEvidence.update({ where: { id: row.id }, data: { revokedAt: /* @__PURE__ */ new Date(), revocationReason: boundedText(data.reason, "Reason", 500) } });
    }
    if (command === "privacy.request" || command === "case.open") {
      const allowed2 = ["incident", "inspection", "closure", "finance", "integration", "privacy"];
      const kind = command === "privacy.request" ? "privacy" : String(data.kind);
      if (!allowed2.includes(kind)) throw new Error("Unsupported case type");
      const member = command === "privacy.request" ? await memberInTenant(tx, organizationId, null, userId) : data.memberId ? await memberInTenant(tx, organizationId, data.memberId) : null;
      const locationId = data.locationId ? String(data.locationId) : "";
      if (locationId && !await tx.location.findFirst({ where: { id: locationId, organizationId } })) throw new Error("Location not found");
      const key = operationKey(organizationId, `case:${userId}:${boundedText(data.requestKey, "Request key", 200)}`);
      const summary = boundedText(data.summary, "Summary");
      const reference = typeof data.reference === "string" ? data.reference.slice(0, 200) : "";
      const requestHash = operationKey(organizationId, JSON.stringify({ kind, memberId: member?.id || null, locationId, summary, reference }));
      const existing = await tx.operationsCase.findUnique({ where: { key } });
      if (existing && existing.requestHash !== requestHash) throw new Error("This request key was already used for a different case; refresh before starting a new case");
      return tx.operationsCase.upsert({ where: { key }, update: {}, create: {
        organizationId,
        memberId: member?.id,
        key,
        requestHash,
        kind,
        locationId,
        reference,
        summary,
        status: "open",
        openedBy: userId,
        history: [{ at: (/* @__PURE__ */ new Date()).toISOString(), userId, action: "opened", note: "Case opened" }]
      } });
    }
    if (command === "case.transition") {
      const row = await tx.operationsCase.findFirst({ where: { id: String(data.id), organizationId } });
      if (!row) throw new Error("Case not found");
      const status = String(data.status);
      if (!["open", "review", "resolved"].includes(status)) throw new Error("Unsupported case state");
      const note = boundedText(data.note, "Resolution or review evidence");
      return tx.operationsCase.update({ where: { id: row.id }, data: {
        status,
        assignedTo: userId,
        closedAt: status === "resolved" ? /* @__PURE__ */ new Date() : null,
        history: history(row, userId, status, note)
      } });
    }
    if (command === "privacy.clearHealth") {
      const row = await tx.operationsCase.findFirst({ where: { id: String(data.id), organizationId, kind: "privacy", status: { not: "resolved" } } });
      if (!row?.memberId) throw new Error("Open member privacy case required");
      const note = boundedText(data.note, "Retention review and clearing reason");
      await tx.member.update({ where: { id: row.memberId }, data: { healthNotes: { conditions: [], injuries: [], notes: "" }, emergencyContactName: "", emergencyContactPhone: "" } });
      return tx.operationsCase.update({ where: { id: row.id }, data: {
        status: "resolved",
        assignedTo: userId,
        closedAt: /* @__PURE__ */ new Date(),
        history: history(row, userId, "clear-health", note)
      } });
    }
    if (command === "notice.followUp") {
      const id = String(data.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notice:${organizationId}:${id}`}))`;
      const row = await tx.operationalNotice.findFirst({ where: { id, organizationId } });
      if (!row) throw new Error("Notice not found");
      if (row.status === "resolved") return { id, reused: true };
      const note = boundedText(data.note, "Contact outcome", 1e3);
      const success = data.success === true;
      return tx.operationalNotice.update({ where: { id }, data: {
        attempts: { increment: 1 },
        status: success ? "resolved" : "failed",
        resolvedAt: success ? /* @__PURE__ */ new Date() : null,
        lastError: success ? "" : note,
        history: history(row, userId, success ? "delivered-manually" : "contact-failed", note)
      } });
    }
    if (command === "credential.create") {
      await lockParticipationPolicy(tx, organizationId);
      if (await tx.integrationCredential.count({ where: { organizationId, revokedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } } }) >= 100) throw new Error("Revoke an active credential before creating another; the tenant limit is 100");
      const scopes = Array.isArray(data.scopes) ? [...new Set(data.scopes)] : [];
      if (!scopes.length || scopes.some((s) => !["classes:read", "bookings:create"].includes(String(s)))) throw new Error("Choose supported integration scopes");
      const token = `gym_${(0, import_node_crypto11.randomBytes)(32).toString("base64url")}`;
      const expiresAt = dateValue(data.expiresAt, true);
      if (expiresAt <= /* @__PURE__ */ new Date() || expiresAt.getTime() > Date.now() + 366 * 864e5) throw new Error("Credential expiry must be within one year");
      const row = await tx.integrationCredential.create({ data: {
        organizationId,
        label: boundedText(data.label, "Label", 120),
        partner: boundedText(data.partner, "Partner", 120),
        scopes,
        digest: (0, import_node_crypto11.createHash)("sha256").update(token).digest("hex"),
        expiresAt,
        createdBy: userId
      } });
      return { id: row.id, token };
    }
    if (command === "credential.revoke") {
      const row = await tx.integrationCredential.findFirst({ where: { id: String(data.id), organizationId } });
      if (!row) throw new Error("Credential not found");
      await tx.integrationCredential.update({ where: { id: row.id }, data: { revokedAt: row.revokedAt || /* @__PURE__ */ new Date() } });
      return { id: row.id };
    }
    throw new Error("Unknown operations command");
  });
}
async function exportOperatingData(_root, { kind, from, to }, context) {
  const { organizationId } = operationsActor(context);
  const start = dateValue(from, true);
  const end = dateValue(to, true);
  if (end <= start || end.getTime() - start.getTime() > 93 * 864e5) throw new Error("Export window must be 1\u201393 days");
  const where = { organizationId, createdAt: { gte: start, lt: end } };
  let rows;
  if (kind === "payments") rows = await context.prisma.membershipPayment.findMany({ where: { organizationId, paymentDate: { gte: start, lt: end } }, take: 5001, orderBy: [{ paymentDate: "asc" }, { id: "asc" }], select: { id: true, amount: true, refundAmount: true, currencyCode: true, status: true, paymentDate: true, stripeInvoiceId: true, stripePaymentIntentId: true } });
  else if (kind === "members") rows = await context.prisma.member.findMany({ where, take: 5001, orderBy: { id: "asc" }, select: { id: true, name: true, email: true, phone: true, status: true, joinDate: true } });
  else if (kind === "cases") rows = await context.prisma.operationsCase.findMany({ where, take: 5001, orderBy: { id: "asc" } });
  else throw new Error("Unsupported export");
  if (rows.length > 5e3) throw new Error("Narrow the export window; more than 5000 records match");
  return { schemaVersion: 1, organizationId, kind, from: start, to: end, generatedAt: /* @__PURE__ */ new Date(), basis: kind === "payments" ? "Payment effective date; refundAmount is cumulative, not refund-date cash flow. Reconcile provider fees, payouts and disputes separately." : "Record creation date", rows };
}

// features/keystone/mutations/memberEntitlement.ts
init_membership_credits();
async function refreshMyEntitlement(_root, _args, context) {
  const userId = context.session?.itemId;
  const organizationId = context.session?.data?.organization?.id;
  if (!userId || !organizationId) throw new Error("Authentication required");
  const result = await refreshMemberEntitlement(context, organizationId, userId);
  const membership = await context.prisma.membership.findFirst({ where: { memberId: userId, organizationId }, select: {
    id: true,
    status: true,
    classCreditsRemaining: true,
    agreementSnapshot: true,
    billingCycle: true,
    startDate: true,
    nextBillingDate: true,
    cancelledAt: true,
    autoRenew: true,
    stripeSubscriptionId: true,
    freezeStartDate: true,
    freezeEndDate: true,
    tier: { select: { id: true, name: true, monthlyPrice: true, classCreditsPerMonth: true, freezeAllowed: true } }
  } });
  return { ...result, membership };
}

// features/keystone/mutations/trainingWorkspace.ts
init_operational_policy();
init_classCapacity();

// features/keystone/mutations/trainerAppointment.ts
init_operational_policy();
init_operational_notices();
init_classCapacity();

// features/keystone/mutations/trainerAppointmentPolicy.ts
var ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "confirmed", "checked_in"];
var APPOINTMENT_STATUSES = [
  ...ACTIVE_APPOINTMENT_STATUSES,
  "completed",
  "cancelled",
  "no_show"
];
var TRANSITIONS = {
  scheduled: ["confirmed", "checked_in", "completed", "cancelled", "no_show"],
  confirmed: ["checked_in", "completed", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: []
};
function normalizeAppointmentWindow(start, durationMinutes) {
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) {
    throw new Error("Appointment start time is invalid");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error("Appointment duration must be an integer between 15 and 480 minutes");
  }
  return {
    startTime: start,
    endTime: new Date(start.getTime() + durationMinutes * 6e4),
    durationMinutes
  };
}
function assertAppointmentTransition(from, to) {
  if (!APPOINTMENT_STATUSES.includes(from)) {
    throw new Error(`Unknown appointment status: ${from}`);
  }
  if (!APPOINTMENT_STATUSES.includes(to)) {
    throw new Error(`Unknown appointment status: ${to}`);
  }
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Appointment transition ${from} -> ${to} is not allowed`);
  }
}
function buildActiveAppointmentOverlapWhere(startTime, endTime) {
  return {
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    status: { in: [...ACTIVE_APPOINTMENT_STATUSES] }
  };
}

// features/keystone/mutations/trainerAppointmentEvidence.ts
var import_node_crypto12 = require("node:crypto");
function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}
function hashTrainerAppointmentRequest(request) {
  return (0, import_node_crypto12.createHash)("sha256").update(JSON.stringify(stableValue(request))).digest("hex");
}
function assertTrainerAppointmentReplayMatches(existing, request) {
  if (existing.requestHash !== hashTrainerAppointmentRequest(request)) {
    throw new Error("Appointment idempotency key was already used with different details");
  }
}

// features/keystone/mutations/trainingPolicy.ts
function trainingText(value, label, max = 2e3, required = true) {
  if (typeof value !== "string" || required && !value.trim() || value.trim().length > max) throw new Error(`${label} is invalid`);
  return value.trim();
}
function trainingInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} is invalid`);
  return value;
}
function assertTrainingActor(actor2) {
  if (!actor2?.userId || !actor2.organizationId) throw new Error("Authenticated organization session required");
}
function assertTrainingTenant(item, actor2, label) {
  if (!item || item.organizationId !== actor2.organizationId) throw new Error(`${label} was not found in this organization`);
}
function assertTrainingMember(member, actor2) {
  assertTrainingTenant(member, actor2, "Member");
  if (!actor2.canManageAppointments && member.userId !== actor2.userId && member.user?.id !== actor2.userId) throw new Error("You cannot book for another member");
  if (member.status !== "active") throw new Error("Member is inactive");
}
function minutesOfDay(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Time must use HH:mm");
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
function assertTrainerAvailable(rows, start, end, timeZone) {
  normalizeTimeZone(timeZone);
  const a = localDateParts(start, timeZone), b = localDateParts(end, timeZone);
  const key = (p) => `${p.year}-${p.month}-${p.day}`;
  if (key(a) !== key(b)) throw new Error("Appointments must finish on the same local day");
  const weekday = new Date(Date.UTC(a.year, a.month - 1, a.day)).getUTCDay();
  const startMinute = a.hour * 60 + a.minute, endMinute = b.hour * 60 + b.minute + b.second / 60;
  const applicable = rows.filter((row) => {
    if (row.effectiveFrom && start < new Date(row.effectiveFrom)) return false;
    if (row.effectiveTo && end > new Date(row.effectiveTo)) return false;
    if (row.type === "recurring") return row.dayOfWeek === weekday;
    return row.date && key(localDateParts(new Date(row.date), timeZone)) === key(a);
  });
  if (applicable.some((row) => (!row.isAvailable || row.type === "time_off") && minutesOfDay(row.startTime) < endMinute && minutesOfDay(row.endTime) > startMinute)) throw new Error("Instructor is unavailable at this time");
  if (!applicable.some((row) => row.isAvailable && row.type !== "time_off" && minutesOfDay(row.startTime) <= startMinute && minutesOfDay(row.endTime) >= endMinute)) throw new Error("Appointment is outside published instructor availability");
}
function assertPackageUsable(pack, actor2, memberId, locationId, end) {
  assertTrainingTenant(pack, actor2, "Training package");
  if (pack.memberId !== memberId || pack.locationId !== locationId) throw new Error("Package does not cover this member and location");
  if (pack.status !== "active" || pack.creditsRemaining < 1) throw new Error("Package has no available credits");
  if (end > new Date(pack.expiresAt)) throw new Error("Package expires before this appointment finishes");
}
function unusedPackageRefundAmount(pack) {
  return Math.floor(pack.amount * pack.creditsRemaining / pack.totalCredits);
}

// features/keystone/mutations/trainingPackages.ts
init_operational_notices();
init_classCapacity();
async function recordSettledTrainingPackage(prisma, input, actor2, now = /* @__PURE__ */ new Date()) {
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const purchaseReference = trainingText(input.purchaseReference, "External settled payment reference", 200);
  const serviceName = trainingText(input.serviceName, "Service name", 200);
  const amount = trainingInteger(input.amount, "Paid amount in cents", 1, 1e8);
  const totalCredits = trainingInteger(input.totalCredits, "Credits", 1, 1e3);
  const durationMinutes = trainingInteger(input.durationMinutes, "Duration", 15, 480);
  const expiresAt = new Date(input.expiresAt), purchasedAt = new Date(input.purchasedAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || !Number.isFinite(purchasedAt.getTime()) || purchasedAt > now || expiresAt <= purchasedAt) throw new Error("Purchase/expiry dates are invalid");
  if (input.currencyCode !== "USD") throw new Error("Training package recording currently supports USD only");
  const terms = { serviceName, durationMinutes, totalCredits, amount, currencyCode: "USD", memberId: input.memberId, locationId: input.locationId, purchasedAt: purchasedAt.toISOString(), expiresAt: expiresAt.toISOString(), cancellationPolicy: "Cancel before the appointment starts to restore its original package credit; expired credits do not become current credits.", refundPolicy: "Unused unreserved units only; external refund must already be settled and separately referenced." };
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `training-purchase:${actor2.organizationId}:${purchaseReference}`);
    const member = await tx.member.findUnique({ where: { id: input.memberId } });
    const location2 = await tx.location.findUnique({ where: { id: input.locationId } });
    assertTrainingTenant(member, actor2, "Member");
    assertTrainingTenant(location2, actor2, "Location");
    if (member.status !== "active" || !location2.isActive) throw new Error("Active member and location required");
    const existing = await tx.trainingPackage.findFirst({ where: { organizationId: actor2.organizationId, purchaseReference } });
    if (existing) {
      if (hashTrainerAppointmentRequest(existing.terms) !== hashTrainerAppointmentRequest(terms)) throw new Error("Payment reference already records a different package");
      return { id: existing.id, reused: true };
    }
    const pack = await tx.trainingPackage.create({ data: { organizationId: actor2.organizationId, memberId: member.id, locationId: location2.id, serviceName, durationMinutes, totalCredits, creditsRemaining: totalCredits, amount, currencyCode: "USD", purchaseReference, purchasedAt, expiresAt, recordedById: actor2.userId, status: "active", terms } });
    await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, eventKey: `issued:${pack.id}`, kind: "issued", quantity: totalCredits, balanceAfter: totalCredits, actorId: actor2.userId, reason: purchaseReference } });
    await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: member.id, key: `training-package:${pack.id}`, kind: "training", message: `${totalCredits} ${serviceName} credits were recorded from your settled purchase. Review the service, expiry and cancellation terms in Account \u2192 Training.` });
    return { id: pack.id, reused: false };
  });
}
async function recordTrainingPackageRefund(prisma, input, actor2) {
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const reference = trainingText(input.refundReference, "External settled refund reference", 200);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `training-refund:${actor2.organizationId}:${reference}`);
    await lockTransactionKey(tx, `training-package:${input.packageId}`);
    const pack = await tx.trainingPackage.findUnique({ where: { id: input.packageId } });
    assertTrainingTenant(pack, actor2, "Training package");
    if (pack.status === "refunded") {
      if (pack.refundReference !== reference || pack.refundAmount !== input.amount) throw new Error("Package already has different refund evidence");
      return { id: pack.id, reused: true };
    }
    const otherRefund = await tx.trainingPackage.findFirst({ where: { organizationId: actor2.organizationId, refundReference: reference } });
    if (otherRefund && otherRefund.id !== pack.id) throw new Error("External refund reference is already allocated to another package");
    const active = await tx.trainerAppointment.count({ where: { organizationId: actor2.organizationId, trainingPackageId: pack.id, status: { in: ["scheduled", "confirmed", "checked_in"] } } });
    if (active) throw new Error("Cancel or complete reserved appointments before refunding the package");
    const amount = unusedPackageRefundAmount(pack);
    if (amount < 1 || input.amount !== amount) throw new Error(`Record the exact unused-credit refund: ${amount} cents`);
    await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, eventKey: `refunded:${pack.id}`, kind: "refunded", quantity: -pack.creditsRemaining, balanceAfter: 0, actorId: actor2.userId, reason: reference } });
    await tx.trainingPackage.update({ where: { id: pack.id }, data: { status: "refunded", refundAmount: amount, refundReference: reference, refundedAt: /* @__PURE__ */ new Date(), creditsRemaining: 0 } });
    await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: pack.memberId, key: `training-package-refund:${pack.id}`, kind: "training", message: `The studio recorded an external ${pack.currencyCode} ${(amount / 100).toFixed(2)} refund for unused ${pack.serviceName} credits. The remaining package credits are retired.` });
    return { id: pack.id, amount, reused: false };
  });
}
async function debitTrainingPackage(tx, pack, appointmentId, actor2) {
  if (pack.creditsRemaining < 1) throw new Error("Package has no available credits");
  const balanceAfter = pack.creditsRemaining - 1;
  await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } });
  await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, appointmentId, eventKey: `reserved:${appointmentId}`, kind: "reserved", quantity: -1, balanceAfter, actorId: actor2.userId } });
}
async function restoreTrainingPackage(tx, appointment, actor2) {
  if (!appointment.trainingPackageId) return;
  await lockTransactionKey(tx, `training-package:${appointment.trainingPackageId}`);
  const pack = await tx.trainingPackage.findUnique({ where: { id: appointment.trainingPackageId } });
  assertTrainingTenant(pack, actor2, "Training package");
  const debit = await tx.trainingCreditEntry.findFirst({ where: { organizationId: actor2.organizationId, eventKey: `reserved:${appointment.id}`, trainingPackageId: pack.id } });
  if (!debit) throw new Error("Appointment credit provenance is missing; operator review required");
  const balanceAfter = pack.creditsRemaining + 1;
  if (pack.status !== "active" || balanceAfter > pack.totalCredits) throw new Error("Package balance cannot be restored automatically");
  await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, appointmentId: appointment.id, eventKey: `restored:${appointment.id}`, kind: "restored", quantity: 1, balanceAfter, actorId: actor2.userId } });
  await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } });
}

// features/keystone/mutations/trainerAppointment.ts
function trainingActorFromContext(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Authenticated organization session required");
  const role = session.data?.role;
  return { userId: session.itemId, organizationId, canManageAppointments: Boolean(role?.canManageAllRecords || role?.canManageAppointments), canManagePrograms: Boolean(role?.canManageAllRecords || role?.canManagePrograms), canManagePeople: Boolean(role?.canManageAllRecords || role?.canManagePeople), isInstructor: Boolean(role?.isInstructor) };
}
async function createAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  const actor2 = input.actor;
  assertTrainingActor(actor2);
  const key = trainingText(input.idempotencyKey, "Idempotency key", 200);
  const memberNotes = trainingText(input.memberNotes ?? "", "Notes", 2e3, false);
  const startTime = new Date(input.startTime);
  if (!Number.isFinite(startTime.getTime())) throw new Error("Appointment start time is invalid");
  const request = { memberId: input.memberId, instructorId: input.instructorId, locationId: input.locationId, resourceId: input.resourceId || null, trainingPackageId: input.trainingPackageId, startTime, memberNotes };
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, actor2.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor2.organizationId}`);
    await lockTransactionKey(tx, `appointment-idempotency:${actor2.organizationId}:${key}`);
    await lockTransactionKey(tx, `member:${input.memberId}`);
    await lockTransactionKey(tx, `member-appointment:${input.memberId}`);
    await lockTransactionKey(tx, `training-package:${input.trainingPackageId}`);
    const member = await tx.member.findUnique({ where: { id: input.memberId }, include: { user: { select: { id: true } } } });
    assertTrainingMember(member, actor2);
    const existing = await tx.trainerAppointment.findFirst({ where: { organizationId: actor2.organizationId, idempotencyKey: key } });
    if (existing) {
      assertTrainerAppointmentReplayMatches(existing, request);
      return { appointment: appointmentProjection(existing), reused: true };
    }
    if (startTime <= now || startTime.getTime() > now.getTime() + 366 * 864e5) throw new Error("Appointment must start within the next year");
    const [instructor, location2, resource, pack, organization3] = await Promise.all([
      tx.instructor.findUnique({ where: { id: input.instructorId } }),
      tx.location.findUnique({ where: { id: input.locationId } }),
      input.resourceId ? tx.gymResource.findUnique({ where: { id: input.resourceId } }) : null,
      tx.trainingPackage.findUnique({ where: { id: input.trainingPackageId } }),
      tx.organization.findUnique({ where: { id: actor2.organizationId }, select: { timezone: true } })
    ]);
    assertTrainingTenant(instructor, actor2, "Instructor");
    assertTrainingTenant(location2, actor2, "Location");
    if (input.resourceId) assertTrainingTenant(resource, actor2, "Resource");
    if (!instructor.isActive || !location2.isActive || resource && (!resource.isActive || resource.locationId !== location2.id)) throw new Error("Instructor, location or resource is unavailable");
    assertTrainingTenant(pack, actor2, "Training package");
    const window = normalizeAppointmentWindow(startTime, pack.durationMinutes);
    assertPackageUsable(pack, actor2, member.id, location2.id, window.endTime);
    assertInstructorQualifications(instructor, window.endTime);
    await assertParticipationAllowed(tx, actor2.organizationId, member.id, window.startTime, location2.id);
    const rows = await tx.trainerAvailability.findMany({ where: { organizationId: actor2.organizationId, instructorId: instructor.id, locationId: location2.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Instructor availability requires operator review");
    assertTrainerAvailable(rows, window.startTime, window.endTime, organization3?.timezone || "UTC");
    const overlap = buildActiveAppointmentOverlapWhere(window.startTime, window.endTime);
    const conflict = await tx.trainerAppointment.findFirst({ where: { organizationId: actor2.organizationId, OR: [{ instructorId: instructor.id }, { memberId: member.id }], ...overlap }, select: { id: true } });
    if (conflict) throw new Error("Instructor or member already has an overlapping appointment");
    const resourceStartsAt = new Date(window.startTime.getTime() - (resource?.setupBufferMinutes || 0) * 6e4);
    const resourceEndsAt = new Date(window.endTime.getTime() + (resource?.cleanupBufferMinutes || 0) * 6e4);
    if (resource) {
      const count = await tx.trainerAppointment.count({ where: { organizationId: actor2.organizationId, resourceId: resource.id, status: { in: ["scheduled", "confirmed", "checked_in"] }, OR: [{ resourceStartsAt: { lt: resourceEndsAt }, resourceEndsAt: { gt: resourceStartsAt } }, { resourceStartsAt: null, ...buildActiveAppointmentOverlapWhere(resourceStartsAt, resourceEndsAt) }] } });
      if (count >= (resource.isExclusive ? 1 : resource.capacity)) throw new Error("Resource is at capacity, including setup/cleanup buffers");
    }
    const classes = await tx.classInstance.findMany({ where: { organizationId: actor2.organizationId, isCancelled: false, date: { gte: new Date(resourceStartsAt.getTime() - 864e5), lt: resourceEndsAt } }, include: { classSchedule: true, resource: true }, take: 1e3 });
    if (classes.length >= 1e3) throw new Error("Class conflict window requires operator review");
    for (const instance of classes) {
      const schedule = instance.classSchedule;
      const minutes = (value) => {
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };
      const duration = schedule ? minutes(schedule.endTime) - minutes(schedule.startTime) : 480;
      const end = instance.endsAt ? new Date(instance.endsAt) : new Date(new Date(instance.date).getTime() + duration * 6e4);
      const effectiveInstructor2 = instance.instructorId || schedule?.instructorId;
      if (effectiveInstructor2 === instructor.id && new Date(instance.date) < window.endTime && end > window.startTime) throw new Error("Instructor has an overlapping class");
      const classResourceId = instance.endsAt ? instance.resourceId : instance.resourceId ?? schedule?.resourceId;
      const classResourceStart = new Date(new Date(instance.date).getTime() - (instance.resource?.setupBufferMinutes || resource?.setupBufferMinutes || 0) * 6e4);
      const classResourceEnd = new Date(end.getTime() + (instance.resource?.cleanupBufferMinutes || resource?.cleanupBufferMinutes || 0) * 6e4);
      if (resource && classResourceId === resource.id && classResourceEnd > resourceStartsAt && classResourceStart < resourceEndsAt) throw new Error("Resource is allocated to a class, including buffers");
    }
    const classBookings = await tx.classBooking.findMany({ where: { organizationId: actor2.organizationId, memberId: member.id, status: "confirmed", classInstance: { isCancelled: false, date: { gte: new Date(window.startTime.getTime() - 864e5), lt: window.endTime } } }, include: { classInstance: { include: { classSchedule: true } } }, take: 1e3 });
    if (classBookings.length >= 1e3) throw new Error("Member calendar requires operator review");
    for (const booking of classBookings) {
      const instance = booking.classInstance;
      if (!instance) continue;
      const minutes = (value) => {
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };
      const duration = instance.classSchedule ? minutes(instance.classSchedule.endTime) - minutes(instance.classSchedule.startTime) : 480;
      const end = instance.endsAt ? new Date(instance.endsAt) : new Date(new Date(instance.date).getTime() + duration * 6e4);
      if (end > window.startTime) throw new Error("Member already has an overlapping class booking");
    }
    const appointment = await tx.trainerAppointment.create({ data: { organizationId: actor2.organizationId, memberId: member.id, instructorId: instructor.id, locationId: location2.id, resourceId: resource?.id || null, trainingPackageId: pack.id, ...window, resourceStartsAt, resourceEndsAt, status: "confirmed", serviceName: pack.serviceName, priceAmount: Math.floor(pack.amount / pack.totalCredits), currencyCode: pack.currencyCode, memberNotes, idempotencyKey: key, requestHash: hashTrainerAppointmentRequest(request) } });
    await debitTrainingPackage(tx, pack, appointment.id, actor2);
    await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: member.id, key: `training-booked:${appointment.id}`, kind: "training", message: `${pack.serviceName} is confirmed for ${window.startTime.toISOString()}. One credit was reserved from your training package. Cancel before the start to restore that credit.` });
    return { appointment: appointmentProjection(appointment), reused: false };
  });
}
async function transitionAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  const actor2 = input.actor;
  assertTrainingActor(actor2);
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, actor2.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor2.organizationId}`);
    await lockTransactionKey(tx, `appointment:${input.appointmentId}`);
    const appointment = await tx.trainerAppointment.findUnique({ where: { id: input.appointmentId }, include: { member: { include: { user: { select: { id: true } } } }, instructor: { include: { user: { select: { id: true } } } } } });
    assertTrainingTenant(appointment, actor2, "Appointment");
    await lockTransactionKey(tx, `member:${appointment.memberId}`);
    appointment.member = await tx.member.findUnique({ where: { id: appointment.memberId }, include: { user: { select: { id: true } } } });
    const owner = appointment.member?.user?.id === actor2.userId;
    const instructor = actor2.isInstructor && appointment.instructor?.user?.id === actor2.userId;
    if (!actor2.canManageAppointments && !instructor && !(owner && input.status === "cancelled")) throw new Error("Appointment transition is not permitted");
    assertAppointmentTransition(appointment.status, input.status);
    if (appointment.status === input.status) return { appointment: appointmentProjection(appointment), reused: true };
    const data = { status: input.status };
    if (input.status === "cancelled") {
      if (new Date(appointment.startTime) <= now) throw new Error("Started appointments require an attendance outcome; cancellation credit restoration is closed");
      data.cancelledAt = now;
      data.cancellationReason = trainingText(input.reason ?? "", "Cancellation reason", 2e3, true);
      await restoreTrainingPackage(tx, appointment, actor2);
    }
    if (["checked_in", "completed", "no_show"].includes(input.status)) {
      if (new Date(appointment.startTime) > now) throw new Error("Attendance cannot be recorded before the appointment starts");
      if (input.status === "completed" && new Date(appointment.endTime) > now) throw new Error("Completion cannot precede the scheduled end");
      if (input.status !== "no_show" && appointment.member?.status !== "active") throw new Error("Inactive members cannot receive training; operator review required");
      if (input.status !== "no_show") {
        if (!appointment.instructor?.isActive) throw new Error("Inactive instructors cannot fulfill appointments");
        assertInstructorQualifications(appointment.instructor, now);
        await assertParticipationAllowed(tx, actor2.organizationId, appointment.memberId, now, appointment.locationId);
      }
      if (input.status === "checked_in") data.checkedInAt = now;
      if (input.status === "completed") data.completedAt = now;
    }
    const updated = await tx.trainerAppointment.update({ where: { id: appointment.id }, data });
    await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: appointment.memberId, key: `training-${input.status}:${appointment.id}`, kind: "training", message: `${appointment.serviceName}: ${input.status.replaceAll("_", " ")}. ${input.status === "cancelled" ? "The credit was restored to its original package and expiry." : "Review the appointment in Account \u2192 Training."}` });
    return { appointment: appointmentProjection(updated), reused: false };
  });
}
function appointmentProjection(row) {
  return { id: row.id, memberId: row.memberId, instructorId: row.instructorId, locationId: row.locationId, trainingPackageId: row.trainingPackageId, serviceName: row.serviceName, startTime: new Date(row.startTime).toISOString(), endTime: new Date(row.endTime).toISOString(), status: row.status, cancellationReason: row.cancellationReason || "", memberNotes: row.memberNotes || "" };
}
async function bookTrainerAppointment(_root, { data }, context) {
  return createAtomicTrainerAppointment(context.prisma, { ...data, actor: trainingActorFromContext(context) });
}
async function transitionTrainerAppointment(_root, args, context) {
  return transitionAtomicTrainerAppointment(context.prisma, { ...args, actor: trainingActorFromContext(context) });
}
async function rescheduleAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  const actor2 = input.actor;
  assertTrainingActor(actor2);
  const reason = trainingText(input.reason, "Reschedule reason", 2e3);
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, actor2.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor2.organizationId}`);
    const original = await tx.trainerAppointment.findUnique({ where: { id: input.appointmentId }, include: { member: { include: { user: true } } } });
    assertTrainingTenant(original, actor2, "Appointment");
    if (!actor2.canManageAppointments && original.member?.user?.id !== actor2.userId) throw new Error("Only the member or training manager can reschedule");
    if (!original.trainingPackageId) throw new Error("Legacy appointments need a recorded package before rescheduling");
    const request = { memberId: original.memberId, instructorId: input.instructorId || original.instructorId, locationId: original.locationId, resourceId: input.resourceId === void 0 ? original.resourceId : input.resourceId, trainingPackageId: original.trainingPackageId, startTime: input.startTime, memberNotes: original.memberNotes || "", idempotencyKey: input.idempotencyKey, actor: actor2 };
    const existing = await tx.trainerAppointment.findFirst({ where: { organizationId: actor2.organizationId, idempotencyKey: input.idempotencyKey } });
    const nested = { $transaction: (fn) => fn(tx) };
    if (existing) {
      if (existing.replacesAppointmentId !== original.id) throw new Error("Reschedule key belongs to another appointment");
      return createAtomicTrainerAppointment(nested, request, now);
    }
    if (!["scheduled", "confirmed"].includes(original.status)) throw new Error("Only an upcoming reserved appointment can be rescheduled");
    await transitionAtomicTrainerAppointment(nested, { appointmentId: original.id, status: "cancelled", reason: `Rescheduled: ${reason}`, actor: actor2 }, now);
    const result = await createAtomicTrainerAppointment(nested, request, now);
    await tx.trainerAppointment.update({ where: { id: result.appointment.id }, data: { replacesAppointmentId: original.id } });
    return result;
  });
}
async function rescheduleTrainerAppointment(_root, { data }, context) {
  return rescheduleAtomicTrainerAppointment(context.prisma, { ...data, actor: trainingActorFromContext(context) });
}

// features/keystone/mutations/trainingWorkspace.ts
init_operational_notices();
async function getTrainingWorkspace(_root, { skip = 0 }, context) {
  const actor2 = trainingActorFromContext(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 1e4) throw new Error("Invalid page");
  const tx = context.prisma;
  const member = await tx.member.findFirst({ where: { organizationId: actor2.organizationId, userId: actor2.userId }, select: { id: true } });
  const where = { organizationId: actor2.organizationId };
  const memberScope = { ...where, ...actor2.canManageAppointments ? {} : { memberId: member?.id || "__no_member__" } };
  const [packages, appointments, instructors, locations, resources, availability, members, assignments, leads, organization3] = await Promise.all([
    tx.trainingPackage.findMany({ where: memberScope, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 50, skip, select: { id: true, memberId: true, locationId: true, serviceName: true, durationMinutes: true, totalCredits: true, creditsRemaining: true, amount: true, currencyCode: true, expiresAt: true, status: true, terms: true, refundAmount: true } }),
    tx.trainerAppointment.findMany({ where: { ...where, ...actor2.canManageAppointments ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...actor2.isInstructor ? [{ instructor: { userId: actor2.userId } }] : []] } }, orderBy: [{ startTime: "desc" }, { id: "asc" }], take: 50, skip }),
    tx.instructor.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, user: { select: { name: true } } } }),
    tx.location.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true } }),
    tx.gymResource.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true, locationId: true } }),
    tx.trainerAvailability.findMany({ where, take: 200, orderBy: [{ instructorId: "asc" }, { id: "asc" }], select: { id: true, instructorId: true, locationId: true, type: true, date: true, dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true, isAvailable: true } }),
    actor2.canManageAppointments || actor2.canManagePrograms || actor2.canManagePeople ? tx.member.findMany({ where, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true } }) : [],
    tx.coachingAssignment.findMany({ where: { ...where, ...actor2.canManagePrograms ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...actor2.isInstructor ? [{ instructor: { userId: actor2.userId } }] : []] } }, take: 50, skip, orderBy: [{ dueAt: "desc" }, { id: "asc" }], select: { id: true, title: true, instructions: true, dueAt: true, status: true, memberId: true, instructorId: true, memberEvidence: true, review: true, submittedAt: true, reviewedAt: true } }),
    actor2.canManagePeople ? tx.trainingLead.findMany({ where, take: 50, skip, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, name: true, email: true, source: true, status: true, trialAt: true, nextActionAt: true, memberId: true, history: true } }) : [],
    tx.organization.findUnique({ where: { id: actor2.organizationId }, select: { timezone: true } })
  ]);
  return { memberId: member?.id, canManageAppointments: actor2.canManageAppointments, canManagePrograms: actor2.canManagePrograms, canManagePeople: actor2.canManagePeople, isInstructor: actor2.isInstructor, timeZone: organization3?.timezone || "UTC", skip, packages, appointments: appointments.map(appointmentProjection), instructors: instructors.map((row) => ({ id: row.id, name: row.user?.name || "Instructor" })), locations, resources, availability, members: members.map((row) => ({ id: row.id, name: row.name })), assignments, leads };
}
async function saveTrainerAvailabilityAtomic(prisma, data, actor2) {
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const startTime = trainingText(data.startTime, "Start time", 5), endTime = trainingText(data.endTime, "End time", 5);
  if (minutesOfDay(startTime) >= minutesOfDay(endTime)) throw new Error("Availability must end after it starts on the same local day");
  if (!["recurring", "one_time", "time_off"].includes(data.type)) throw new Error("Invalid availability type");
  if (data.type === "recurring" && (!Number.isInteger(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6)) throw new Error("Weekday must be 0-6");
  const date = data.date ? new Date(data.date) : null;
  if (data.type !== "recurring" && (!date || !Number.isFinite(date.getTime()))) throw new Error("A dated availability needs a date");
  const values = { instructorId: data.instructorId, locationId: data.locationId, type: data.type, dayOfWeek: data.type === "recurring" ? data.dayOfWeek : null, date, startTime, endTime, isAvailable: data.type !== "time_off" && data.isAvailable !== false, reason: trainingText(data.reason || "", "Reason", 1e3, false) };
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, actor2.organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${actor2.organizationId}`);
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    const location2 = await tx.location.findUnique({ where: { id: data.locationId } });
    assertTrainingTenant(instructor, actor2, "Instructor");
    assertTrainingTenant(location2, actor2, "Location");
    if (data.id) {
      const row2 = await tx.trainerAvailability.findUnique({ where: { id: data.id } });
      assertTrainingTenant(row2, actor2, "Availability");
      if (row2.instructorId !== instructor.id || row2.locationId !== location2.id) throw new Error("Availability owner and location cannot be changed");
    }
    const rows = await tx.trainerAvailability.findMany({ where: { organizationId: actor2.organizationId, instructorId: instructor.id, locationId: location2.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Availability limit reached");
    const next = [...rows.filter((row2) => row2.id !== data.id), values];
    const appointments = await tx.trainerAppointment.findMany({ where: { organizationId: actor2.organizationId, instructorId: instructor.id, locationId: location2.id, endTime: { gt: /* @__PURE__ */ new Date() }, status: { in: ["scheduled", "confirmed", "checked_in"] } }, take: 1e3 });
    if (appointments.length >= 1e3) throw new Error("Upcoming appointments require review before availability changes");
    const organization3 = await tx.organization.findUnique({ where: { id: actor2.organizationId } });
    for (const appointment of appointments) assertTrainerAvailable(next, new Date(appointment.startTime), new Date(appointment.endTime), organization3.timezone);
    const row = data.id ? await tx.trainerAvailability.update({ where: { id: data.id }, data: values }) : await tx.trainerAvailability.create({ data: { ...values, organizationId: actor2.organizationId } });
    return { id: row.id };
  });
}
async function assignCoachingAtomic(prisma, data, actor2) {
  assertTrainingActor(actor2);
  if (!actor2.canManagePrograms && !actor2.isInstructor) throw new Error("Coaching permission required");
  const title = trainingText(data.title, "Title", 200), instructions = trainingText(data.instructions, "Instructions", 8e3), requestKey = trainingText(data.requestKey, "Request key", 200);
  const dueAt = new Date(data.dueAt);
  if (!Number.isFinite(dueAt.getTime()) || dueAt <= /* @__PURE__ */ new Date()) throw new Error("Choose a future due date");
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `coaching:${actor2.organizationId}:${requestKey}`);
    const member = await tx.member.findUnique({ where: { id: data.memberId } });
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    assertTrainingTenant(member, actor2, "Member");
    assertTrainingTenant(instructor, actor2, "Instructor");
    if (!actor2.canManagePrograms && instructor.userId !== actor2.userId) throw new Error("Instructors may assign only their own coaching work");
    if (!instructor.isActive || member.status !== "active") throw new Error("Active member and instructor required");
    if (!actor2.canManagePrograms) {
      const service = await tx.trainerAppointment.findFirst({ where: { organizationId: actor2.organizationId, memberId: member.id, instructorId: instructor.id, status: { in: ["confirmed", "checked_in", "completed"] } } });
      if (!service) throw new Error("An assigned training relationship is required for instructor-created coaching");
    }
    const values = { memberId: member.id, instructorId: instructor.id, title, instructions, dueAt };
    const existing = await tx.coachingAssignment.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) {
      const snapshot = { memberId: existing.memberId, instructorId: existing.instructorId, title: existing.title, instructions: existing.instructions, dueAt: existing.dueAt };
      if (hashTrainerAppointmentRequest(snapshot) !== hashTrainerAppointmentRequest(values)) throw new Error("Coaching request key has different content");
      return { id: existing.id, reused: true };
    }
    const row = await tx.coachingAssignment.create({ data: { organizationId: actor2.organizationId, ...values, requestKey, status: "assigned" } });
    await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: member.id, key: `coaching:${row.id}`, kind: "coaching", message: `Your coach assigned ${title}. Open Account \u2192 Training to read and submit your progress.` });
    return { id: row.id };
  });
}
async function transitionCoachingAtomic(prisma, data, actor2) {
  assertTrainingActor(actor2);
  const text42 = trainingText(data.text, "Progress or review", 8e3);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `coaching-assignment:${data.id}`);
    const row = await tx.coachingAssignment.findUnique({ where: { id: data.id }, include: { member: true, instructor: true } });
    assertTrainingTenant(row, actor2, "Coaching assignment");
    const own = row.member?.userId === actor2.userId;
    const coach = actor2.canManagePrograms || actor2.isInstructor && row.instructor?.userId === actor2.userId;
    if (data.status === "submitted") {
      if (!own) throw new Error("Only the assigned member can submit progress");
      if (row.status === "submitted" && row.memberEvidence === text42) return { id: row.id, reused: true };
      if (row.status !== "assigned") throw new Error("Only an assigned task can be submitted");
      const log = await tx.workoutLog.create({ data: { organizationId: actor2.organizationId, memberId: row.memberId, title: row.title, date: /* @__PURE__ */ new Date(), notes: text42 } });
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "submitted", memberEvidence: text42, submittedAt: /* @__PURE__ */ new Date(), workoutLogId: log.id } });
    } else if (data.status === "reviewed") {
      if (!coach) throw new Error("Only the assigned coach or program manager can review");
      if (row.status === "reviewed" && row.review === text42) return { id: row.id, reused: true };
      if (row.status !== "submitted") throw new Error("Progress must be submitted before review");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "reviewed", review: text42, reviewedAt: /* @__PURE__ */ new Date() } });
      await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: row.memberId, key: `coaching-reviewed:${row.id}`, kind: "coaching", message: `Your coach reviewed ${row.title}. Open Account \u2192 Training for feedback.` });
    } else if (data.status === "cancelled") {
      if (!coach || row.status !== "assigned") throw new Error("Only unsubmitted coaching work can be cancelled by its coach");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "cancelled", review: text42 } });
    } else throw new Error("Unknown coaching transition");
    return { id: row.id };
  });
}
async function saveTrainingLeadAtomic(prisma, data, actor2) {
  assertTrainingActor(actor2);
  if (!actor2.canManagePeople) throw new Error("People management permission required");
  const email = trainingText(data.email, "Email", 254).toLowerCase(), name = trainingText(data.name, "Name", 200), note = trainingText(data.note, "Follow-up note", 2e3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email is invalid");
  const allowed2 = { new: ["contacted", "closed"], contacted: ["trial_booked", "converted", "closed"], trial_booked: ["trial_attended", "contacted", "closed"], trial_attended: ["converted", "contacted", "closed"], converted: [], closed: [] };
  if (!Object.hasOwn(allowed2, data.status)) throw new Error("Unknown lead status");
  const trialAt = data.trialAt ? new Date(data.trialAt) : null, nextActionAt = data.nextActionAt ? new Date(data.nextActionAt) : null;
  if (trialAt && !Number.isFinite(trialAt.getTime()) || nextActionAt && !Number.isFinite(nextActionAt.getTime())) throw new Error("Follow-up date is invalid");
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `training-lead:${actor2.organizationId}:${email}`);
    const row = await tx.trainingLead.findFirst({ where: { organizationId: actor2.organizationId, email } });
    if (!row && data.status !== "new") throw new Error("New inquiries must begin as new");
    if (row && row.status !== data.status && !allowed2[row.status]?.includes(data.status)) throw new Error("Lead transition is not allowed");
    if (data.status === "trial_booked" && (!trialAt || trialAt <= /* @__PURE__ */ new Date())) throw new Error("Choose a future trial appointment");
    if (data.status === "trial_attended" && (!row?.trialAt || new Date(row.trialAt) > /* @__PURE__ */ new Date())) throw new Error("Trial attendance cannot precede its appointment");
    if (data.status === "converted") {
      const member = await tx.member.findUnique({ where: { id: data.memberId } });
      assertTrainingTenant(member, actor2, "Converted member");
      const user = await tx.user.findUnique({ where: { id: member.userId } });
      if (user?.email?.toLowerCase() !== email) throw new Error("Conversion requires the matching member identity");
      const paidPackage = await tx.trainingPackage.findFirst({ where: { organizationId: actor2.organizationId, memberId: member.id, status: "active", amount: { gt: 0 } } });
      const paidMembership = await tx.membership.findFirst({ where: { organizationId: actor2.organizationId, memberId: member.userId, status: "active", stripeSubscriptionId: { not: "" } } });
      if (!paidPackage && !paidMembership) throw new Error("Conversion requires a recorded purchased package or active provider membership");
    }
    const history2 = Array.isArray(row?.history) ? row.history : [];
    if (history2.length && row?.status === data.status && history2[history2.length - 1]?.note === note && row.name === name && (!data.memberId || row.memberId === data.memberId)) return { id: row.id, reused: true };
    if (history2.length >= 500) throw new Error("Case history limit reached; archive through retention policy");
    const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), actorId: actor2.userId, from: row?.status || null, to: data.status, note };
    const values = { name, status: data.status, source: trainingText(data.source || row?.source || "operator", "Source", 200), trialAt: trialAt || row?.trialAt || null, nextActionAt, ...data.status === "converted" ? { memberId: data.memberId } : {}, history: [...history2, entry] };
    const result = row ? await tx.trainingLead.update({ where: { id: row.id }, data: values }) : await tx.trainingLead.create({ data: { organizationId: actor2.organizationId, email, ownerId: actor2.userId, ...values } });
    return { id: result.id, status: result.status };
  });
}
var trainingWorkspaceTypeDefs = `
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
async function recordTrainingPackage(_r, { data }, ctx) {
  return recordSettledTrainingPackage(ctx.prisma, data, trainingActorFromContext(ctx));
}
async function refundTrainingPackage(_r, { data }, ctx) {
  return recordTrainingPackageRefund(ctx.prisma, data, trainingActorFromContext(ctx));
}
async function saveTrainerAvailability(_r, { data }, ctx) {
  return saveTrainerAvailabilityAtomic(ctx.prisma, data, trainingActorFromContext(ctx));
}
async function assignCoaching(_r, { data }, ctx) {
  return assignCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx));
}
async function transitionCoaching(_r, { data }, ctx) {
  return transitionCoachingAtomic(ctx.prisma, data, trainingActorFromContext(ctx));
}
async function saveTrainingLead(_r, { data }, ctx) {
  return saveTrainingLeadAtomic(ctx.prisma, data, trainingActorFromContext(ctx));
}

// features/keystone/mutations/portableData.ts
var import_node_crypto13 = require("node:crypto");
init_classCapacity();
function normalizeMemberImportRows(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("Import must contain between 1 and 100 contacts");
  const ids = /* @__PURE__ */ new Set();
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Object.keys(row).some((key) => !["externalId", "name", "email", "phone"].includes(key))) throw new Error(`Row ${index + 1}: only contact fields are accepted`);
    const normalized = { externalId: String(row.externalId || "").trim(), name: String(row.name || "").trim(), email: String(row.email || "").trim().toLowerCase(), phone: String(row.phone || "").trim() };
    if (!normalized.externalId || normalized.externalId.length > 120 || ids.has(normalized.externalId)) throw new Error(`Row ${index + 1}: external ID is missing, duplicate or too long`);
    if (!normalized.name || normalized.name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email) || normalized.email.length > 254 || normalized.phone.length > 40) throw new Error(`Row ${index + 1}: contact details are invalid`);
    ids.add(normalized.externalId);
    return normalized;
  });
}
async function importMemberContacts(_root, args, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) throw new Error("Member import permission required");
  const source = args.source?.trim();
  if (!source || source.length > 100 || !/^[\w .-]+$/.test(source)) throw new Error("Import source must be a stable name of 100 characters or fewer");
  const rows = normalizeMemberImportRows(args.rows);
  const results = [];
  for (const row of rows) {
    const key = (0, import_node_crypto13.createHash)("sha256").update(JSON.stringify([organizationId, source, row.externalId])).digest("hex");
    const payloadHash = (0, import_node_crypto13.createHash)("sha256").update(JSON.stringify(row)).digest("hex");
    const existing = await context.prisma.memberImportRecord.findUnique({ where: { key } });
    if (existing && existing.payloadHash !== payloadHash) {
      results.push({ externalId: row.externalId, status: "conflict", message: "External ID was previously used for different contact details; review the existing record" });
      continue;
    }
    if (existing?.status === "completed") {
      results.push({ externalId: row.externalId, status: "already-imported", memberId: existing.memberId });
      continue;
    }
    const accounts = await context.sudo().query.User.findMany({ where: { email: { equals: row.email } }, take: 1, query: "id organization { id }" });
    if (accounts[0] && accounts[0].organization?.id !== organizationId) {
      results.push({ externalId: row.externalId, status: "conflict", message: "Contact cannot be imported with this identity; review it with the account owner" });
      continue;
    }
    if (accounts[0]) {
      const profiles = await context.sudo().query.Member.findMany({ where: { AND: [{ user: { id: { equals: accounts[0].id } } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id name email phone" });
      const profile = profiles[0];
      if (!profile || profile.name !== row.name || (profile.phone || "") !== row.phone) {
        results.push({ externalId: row.externalId, status: "conflict", message: "Existing account contact details differ; review the member before importing" });
        continue;
      }
    }
    if (args.dryRun !== false) {
      results.push({ externalId: row.externalId, status: accounts[0] ? "will-link" : "will-create" });
      continue;
    }
    try {
      const record = await context.prisma.$transaction(async (tx) => {
        await lockTransactionKey(tx, `member-import:${key}`);
        const current = await tx.memberImportRecord.findUnique({ where: { key } });
        if (current && current.payloadHash !== payloadHash) throw new Error("Import identity changed concurrently");
        return current || tx.memberImportRecord.create({ data: { organizationId, key, source, externalId: row.externalId, payloadHash, status: "processing" } });
      });
      const member = await inviteMember(null, { data: row }, context);
      await context.prisma.memberImportRecord.update({ where: { id: record.id }, data: { memberId: member.memberId, status: "completed", completedAt: /* @__PURE__ */ new Date(), lastError: "" } });
      results.push({ externalId: row.externalId, status: "imported", memberId: member.memberId });
    } catch {
      await context.prisma.memberImportRecord.updateMany({ where: { key, payloadHash, status: { not: "completed" } }, data: { status: "failed", lastError: "Import could not complete; review the identity and retry the same source and external ID" } });
      results.push({ externalId: row.externalId, status: "failed", message: "Import could not complete; review the identity and retry the same source and external ID" });
    }
  }
  return { dryRun: args.dryRun !== false, source, results };
}

// features/keystone/mutations/retailLifecycle.ts
init_classCapacity();
function assertRetailActor(actor2) {
  if (!actor2.userId || !actor2.organizationId || !actor2.canManageRetail) throw new Error("Retail management permission required");
}
function actorFromContext2(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  const actor2 = { userId: session?.itemId || "", organizationId: organizationId || "", canManageRetail: Boolean(session?.data?.role?.canManageAllRecords || session?.data?.role?.canManageRetail) };
  assertRetailActor(actor2);
  return actor2;
}
function sameTenant(row, actor2, label) {
  if (!row || row.organizationId !== actor2.organizationId) throw new Error(`${label} not found in this organization`);
}
async function siteLock(tx, actor2, locationId, requireActive = true) {
  await lockTransactionKey(tx, `retail:${actor2.organizationId}:${locationId}`);
  const site = await tx.location.findUnique({ where: { id: locationId } });
  sameTenant(site, actor2, "Location");
  if (requireActive && !site.isActive) throw new Error("Location is inactive");
}
function requestLines(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("A sale/return needs 1-100 lines");
  const ids = /* @__PURE__ */ new Set();
  return value.map((row) => {
    const itemId = trainingText(row.itemId, "Item", 200);
    if (ids.has(itemId)) throw new Error("Combine duplicate item lines");
    ids.add(itemId);
    return { itemId, quantity: trainingInteger(row.quantity, "Quantity", 1, 1e4), restock: row.restock === true };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId));
}
function replay(row, hash) {
  if (row.requestHash !== hash) throw new Error("Request key was already used with different details");
  return { id: row.id, reused: true };
}
async function saveRetailItemAtomic(prisma, data, actor2) {
  assertRetailActor(actor2);
  const name = trainingText(data.name, "Item name", 200), sku = trainingText(data.sku, "SKU", 100), requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason, "Stock adjustment reason", 1e3);
  const unitAmount = trainingInteger(data.unitAmount, "Unit price in USD cents", 0, 1e8), stockDelta = trainingInteger(data.stockDelta, "Stock change", -1e5, 1e5);
  const requestHash = hashTrainerAppointmentRequest({ ...data, name, sku, unitAmount, stockDelta, reason });
  return prisma.$transaction(async (tx) => {
    await siteLock(tx, actor2, data.locationId);
    const eventKey = `adjust:${requestKey}`;
    const prior = await tx.retailStockEntry.findFirst({ where: { organizationId: actor2.organizationId, eventKey } });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new Error("Adjustment key has different details");
      return { id: prior.itemId, reused: true };
    }
    const existing = await tx.retailItem.findFirst({ where: { organizationId: actor2.organizationId, locationId: data.locationId, sku } });
    const stockOnHand = (existing?.stockOnHand || 0) + stockDelta;
    if (stockOnHand < 0 || stockOnHand > 1e8) throw new Error("Stock adjustment exceeds supported balance");
    const values = { name, unitAmount, stockOnHand, isActive: data.isActive !== false };
    const item = existing ? await tx.retailItem.update({ where: { id: existing.id }, data: values }) : await tx.retailItem.create({ data: { organizationId: actor2.organizationId, locationId: data.locationId, sku, currencyCode: "USD", ...values } });
    await tx.retailStockEntry.create({ data: { organizationId: actor2.organizationId, locationId: data.locationId, itemId: item.id, eventKey, quantity: stockDelta, balanceAfter: stockOnHand, reason, requestHash, recordedById: actor2.userId } });
    return { id: item.id, reused: false };
  });
}
async function sellRetailAtomic(prisma, data, actor2, now = /* @__PURE__ */ new Date()) {
  assertRetailActor(actor2);
  const lines = requestLines(data.lines).map(({ itemId, quantity }) => ({ itemId, quantity }));
  const requestKey = trainingText(data.requestKey, "Request key", 200), tender = trainingText(data.tender, "Tender", 20);
  if (!["cash", "external"].includes(tender)) throw new Error("Tender must be cash received or externally settled payment");
  const paymentReference = trainingText(data.paymentReference || "", "External settled payment reference", 200, tender === "external");
  const settledAmount = trainingInteger(data.settledAmount, "Confirmed received amount in cents", 0, 2e9);
  const requestHash = hashTrainerAppointmentRequest({ locationId: data.locationId, lines, tender, paymentReference, settledAmount });
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `retail-request:${actor2.organizationId}:${requestKey}`);
    if (tender === "external") await lockTransactionKey(tx, `retail-payment:${actor2.organizationId}:${paymentReference}`);
    await siteLock(tx, actor2, data.locationId);
    const existing = await tx.retailSale.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) return replay(existing, requestHash);
    if (tender === "external" && await tx.retailSale.findFirst({ where: { organizationId: actor2.organizationId, paymentReference, tender } })) throw new Error("External payment reference is already recorded");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, locationId: data.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The receipt instant is already closed; retry with a current receipt");
    const snapshot = [];
    let totalAmount = 0;
    for (const line of lines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      sameTenant(item, actor2, "Retail item");
      if (item.locationId !== data.locationId || !item.isActive || item.currencyCode !== "USD") throw new Error("Item is unavailable at this site/currency");
      if (item.stockOnHand < line.quantity) throw new Error(`Insufficient stock for ${item.sku}`);
      const lineAmount = item.unitAmount * line.quantity;
      totalAmount += lineAmount;
      if (!Number.isSafeInteger(totalAmount) || totalAmount > 2e9) throw new Error("Sale amount exceeds supported bounds");
      snapshot.push({ itemId: item.id, sku: item.sku, name: item.name, unitAmount: item.unitAmount, quantity: line.quantity, lineAmount, currencyCode: "USD", priceBasis: "operator-entered gross amount; tax accounting external" });
      const balanceAfter = item.stockOnHand - line.quantity;
      await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
      await tx.retailStockEntry.create({ data: { organizationId: actor2.organizationId, locationId: data.locationId, itemId: item.id, eventKey: `sale:${requestKey}:${item.id}`, quantity: -line.quantity, balanceAfter, reason: `Retail sale ${requestKey}`, recordedById: actor2.userId } });
    }
    if (totalAmount !== settledAmount) throw new Error("Received amount does not match current server prices; review before recording");
    const sale = await tx.retailSale.create({ data: { organizationId: actor2.organizationId, locationId: data.locationId, requestKey, requestHash, lines: snapshot, totalAmount, currencyCode: "USD", tender, paymentReference, soldAt: now, recordedById: actor2.userId } });
    return { id: sale.id, totalAmount, lines: snapshot, reused: false };
  });
}
async function returnRetailAtomic(prisma, data, actor2, now = /* @__PURE__ */ new Date()) {
  assertRetailActor(actor2);
  const lines = requestLines(data.lines), requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason, "Return reason", 1e3);
  const refundReference = trainingText(data.refundReference || "", "Refund reference", 200, false);
  const settledRefundAmount = trainingInteger(data.settledRefundAmount, "Confirmed refunded amount in cents", 0, 2e9);
  const requestHash = hashTrainerAppointmentRequest({ saleId: data.saleId, lines, reason, refundReference, settledRefundAmount });
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `retail-return:${actor2.organizationId}:${requestKey}`);
    if (refundReference) await lockTransactionKey(tx, `retail-refund:${actor2.organizationId}:${refundReference}`);
    const sale = await tx.retailSale.findUnique({ where: { id: data.saleId } });
    sameTenant(sale, actor2, "Sale");
    await siteLock(tx, actor2, sale.locationId, false);
    const existing = await tx.retailReturn.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) return replay(existing, requestHash);
    if (sale.tender === "external" && !refundReference) throw new Error("An externally settled refund reference is required");
    if (refundReference && await tx.retailReturn.findFirst({ where: { organizationId: actor2.organizationId, refundReference } })) throw new Error("External refund reference is already allocated");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const previous = await tx.retailReturn.findMany({ where: { organizationId: actor2.organizationId, saleId: sale.id }, take: 1e3 });
    if (previous.length >= 1e3) throw new Error("Return history requires reconciliation");
    let refundAmount = 0;
    const snapshot = [];
    for (const line of lines) {
      const sold = sale.lines.find((row) => row.itemId === line.itemId);
      if (!sold) throw new Error("Returned item was not in this sale");
      const returned = previous.reduce((sum, row) => sum + row.lines.filter((item) => item.itemId === line.itemId).reduce((n, item) => n + item.quantity, 0), 0);
      if (returned + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
      const lineAmount = sold.unitAmount * line.quantity;
      refundAmount += lineAmount;
      snapshot.push({ ...line, sku: sold.sku, name: sold.name, unitAmount: sold.unitAmount, lineAmount });
      if (line.restock) {
        const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
        sameTenant(item, actor2, "Retail item");
        if (item.locationId !== sale.locationId) throw new Error("Returned stock belongs to another site");
        const balanceAfter = item.stockOnHand + line.quantity;
        if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 1e8) throw new Error("Returned stock exceeds supported balance");
        await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
        await tx.retailStockEntry.create({ data: { organizationId: actor2.organizationId, locationId: sale.locationId, itemId: item.id, eventKey: `return:${requestKey}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Return: ${reason}`, recordedById: actor2.userId } });
      }
    }
    if (settledRefundAmount !== refundAmount) throw new Error("Recorded refund must match the original-price returned units");
    const result = await tx.retailReturn.create({ data: { organizationId: actor2.organizationId, locationId: sale.locationId, saleId: sale.id, requestKey, requestHash, lines: snapshot, refundAmount, refundReference, tender: sale.tender, reason, returnedAt: now, recordedById: actor2.userId } });
    return { id: result.id, refundAmount, lines: snapshot, reused: false };
  });
}
async function closeRetailAtomic(prisma, data, actor2, now = /* @__PURE__ */ new Date()) {
  assertRetailActor(actor2);
  const requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason || "", "Variance reason", 1e3, false);
  const openingAmount = trainingInteger(data.openingAmount, "Opening cash in cents", 0, 1e8), countedAmount = trainingInteger(data.countedAmount, "Counted cash in cents", 0, 1e8);
  const periodStart = new Date(data.periodStart), periodEnd = new Date(data.periodEnd);
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd || periodEnd > now || periodEnd.getTime() - periodStart.getTime() > 31 * 864e5) throw new Error("Close needs a completed period up to 31 days");
  const requestHash = hashTrainerAppointmentRequest({ locationId: data.locationId, periodStart, periodEnd, openingAmount, countedAmount, reason });
  return prisma.$transaction(async (tx) => {
    await siteLock(tx, actor2, data.locationId, false);
    const existing = await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) return replay(existing, requestHash);
    const overlap = await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, locationId: data.locationId, periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart } } });
    if (overlap) throw new Error("Cash close overlaps a previously reconciled period");
    const where = { organizationId: actor2.organizationId, locationId: data.locationId, tender: "cash" };
    const sales = await tx.retailSale.findMany({ where: { ...where, soldAt: { gte: periodStart, lt: periodEnd } }, take: 1e4 });
    const returns = await tx.retailReturn.findMany({ where: { ...where, returnedAt: { gte: periodStart, lt: periodEnd } }, take: 1e4 });
    if (sales.length >= 1e4 || returns.length >= 1e4) throw new Error("Close period exceeds bounded reconciliation; use smaller periods");
    const salesAmount = sales.reduce((sum, row2) => sum + row2.totalAmount, 0), refundAmount = returns.reduce((sum, row2) => sum + row2.refundAmount, 0);
    const expectedAmount = openingAmount + salesAmount - refundAmount, varianceAmount = countedAmount - expectedAmount;
    if (varianceAmount && !reason) throw new Error("A cash variance needs a reason and operator follow-up");
    if (!Number.isSafeInteger(expectedAmount) || Math.abs(expectedAmount) > 2e9 || Math.abs(varianceAmount) > 2e9) throw new Error("Close exceeds supported money bounds");
    const row = await tx.retailClose.create({ data: { organizationId: actor2.organizationId, locationId: data.locationId, requestKey, requestHash, periodStart, periodEnd, openingAmount, expectedAmount, countedAmount, varianceAmount, reason, evidence: { saleIds: sales.map((row2) => row2.id), returnIds: returns.map((row2) => row2.id), salesAmount, refundAmount, basis: "recorded cash receipts/refunds; external tenders excluded" }, recordedById: actor2.userId } });
    return { id: row.id, expectedAmount, countedAmount, varianceAmount };
  });
}
async function retailWorkspace(_r, { skip = 0 }, context) {
  const actor2 = actorFromContext2(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 1e4) throw new Error("Invalid page");
  const tx = context.prisma, where = { organizationId: actor2.organizationId };
  const [items, sales, returns, closes, locations, stockEntries] = await Promise.all([
    tx.retailItem.findMany({ where, take: 100, orderBy: [{ sku: "asc" }, { id: "asc" }], select: { id: true, locationId: true, sku: true, name: true, unitAmount: true, currencyCode: true, stockOnHand: true, isActive: true } }),
    tx.retailSale.findMany({ where, take: 50, skip, orderBy: [{ soldAt: "desc" }, { id: "asc" }], select: { id: true, locationId: true, lines: true, totalAmount: true, tender: true, paymentReference: true, soldAt: true } }),
    tx.retailReturn.findMany({ where, take: 50, skip, orderBy: [{ returnedAt: "desc" }, { id: "asc" }], select: { id: true, saleId: true, locationId: true, lines: true, refundAmount: true, tender: true, refundReference: true, reason: true, returnedAt: true } }),
    tx.retailClose.findMany({ where, take: 50, skip, orderBy: [{ periodEnd: "desc" }, { id: "asc" }], select: { id: true, locationId: true, periodStart: true, periodEnd: true, openingAmount: true, expectedAmount: true, countedAmount: true, varianceAmount: true, reason: true, evidence: true } }),
    tx.location.findMany({ where, take: 100, select: { id: true, name: true, isActive: true } }),
    tx.retailStockEntry.findMany({ where, take: 50, skip, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, itemId: true, quantity: true, balanceAfter: true, reason: true, createdAt: true } })
  ]);
  return { items, sales, returns, closes, locations, stockEntries, skip };
}
var retailTypeDefs = `extend type Query { retailWorkspace(skip: Int = 0): JSON! } extend type Mutation { saveRetailItem(data: JSON!): JSON! sellRetail(data: JSON!): JSON! returnRetail(data: JSON!): JSON! closeRetail(data: JSON!): JSON! }`;
async function saveRetailItem(_r, { data }, context) {
  return saveRetailItemAtomic(context.prisma, data, actorFromContext2(context));
}
async function sellRetail(_r, { data }, context) {
  return sellRetailAtomic(context.prisma, data, actorFromContext2(context));
}
async function returnRetail(_r, { data }, context) {
  return returnRetailAtomic(context.prisma, data, actorFromContext2(context));
}
async function closeRetail(_r, { data }, context) {
  return closeRetailAtomic(context.prisma, data, actorFromContext2(context));
}

// features/keystone/mutations/index.ts
var graphql7 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: [graphql7`
      type Query {
        operationsWorkspace(caseAfterId: ID): JSON!
        participationWorkspace: JSON!
        exportOperatingData(kind: String!, from: String!, to: String!): JSON!
        redirectToInit: Boolean
        checkClassAvailability(classInstanceId: ID!): ClassAvailabilityResult!
        getBillingStats: BillingStats!
        billingWorkspace: JSON!
        memberProfile: MemberProfileProjection!
        memberCheckInCode: MemberCheckInCode!
        schedulingWorkspace(start: DateTime!, end: DateTime!, userId: ID): JSON!
        instructorAccount: JSON
        rosterSessions: JSON!
        rosterDetail(classInstanceId: ID!): JSON
        frontDeskWorkspace(query: String): JSON!
        reportsDashboard: JSON!
        kioskSearchMembers(query: String!, organizationId: ID!, credential: String!): [KioskSearchMember!]!
        discoveryClasses(
          credential: String!
          partner: String
          from: String
          to: String
          dayOfWeek: String
          locationId: ID
          locationName: String
          limit: Int
        ): JSON!

        publicGymSettings: PublicGymSettings
        publicGymClassTypes(limit: Int = 50): [PublicGymClassType!]!
        publicGymClassType(id: ID!): PublicGymClassType
        publicGymSchedules(dayOfWeek: String, instructorId: ID, limit: Int = 50): [PublicGymSchedule!]!
        publicGymSchedule(id: ID!): PublicGymSchedule
        publicGymClassInstances(
          from: DateTime
          to: DateTime
          scheduleId: ID
          instructorId: ID
          limit: Int = 50
        ): [PublicGymClassInstance!]!
        publicGymClassInstance(id: ID!): PublicGymClassInstance
        publicGymInstructors(limit: Int = 50): [PublicGymInstructor!]!
        publicGymInstructor(id: ID!): PublicGymInstructor
        publicGymMembershipTiers(limit: Int = 50): [PublicGymMembershipTier!]!
        publicGymMembershipTier(id: ID!): PublicGymMembershipTier
      }

      type PublicGymSettings {
        id: ID!
        name: String!
        tagline: String
        logoIcon: String
        brandHue: Int!
        description: String
        address: String
        phone: String
        email: String
        currencyCode: String
        locale: String
        timezone: String
        countryCode: String
        hours: JSON
        heroEyebrow: String
        heroHeadline: String
        heroSubheadline: String
        heroImagePath: String
        heroPrimaryCtaLabel: String
        heroPrimaryCtaHref: String
        heroSecondaryCtaLabel: String
        heroSecondaryCtaHref: String
        promoBanner: String
        footerTagline: String
        copyrightName: String
        facilityHeadline: String
        facilityDescription: String
        facilityHighlights: JSON
        heroStats: JSON
        contactTopics: JSON
      }

      type PublicGymClassType {
        id: ID!
        name: String!
        description: String
        difficulty: String!
        duration: Int!
        caloriesBurn: Int
        equipmentNeeded: [String!]!
      }

      type PublicGymInstructor {
        id: ID!
        name: String!
        bio: String
        specialties: [String!]!
        certifications: [String!]!
        imagePath: String
      }

      type PublicGymSchedule {
        id: ID!
        name: String!
        description: String
        dayOfWeek: String!
        startTime: String!
        endTime: String!
        maxCapacity: Int!
        classType: PublicGymClassType
        instructor: PublicGymInstructor
      }

      type PublicGymAvailability {
        maxCapacity: Int!
        confirmedBookings: Int!
        waitlistCount: Int!
        spotsRemaining: Int!
        state: String!
      }

      type PublicGymClassInstance {
        id: ID!
        startsAt: String!
        schedule: PublicGymSchedule
        instructor: PublicGymInstructor
        availability: PublicGymAvailability!
      }

      type PublicGymMembershipTier {
        id: ID!
        name: String!
        description: String
        monthlyPrice: Float!
        annualPrice: Float!
        classCreditsPerMonth: Int!
        accessHours: String!
        guestPasses: Int!
        personalTrainingSessions: Int!
        freezeAllowed: Boolean!
        contractLength: Int!
        monthlyCheckoutAvailable: Boolean!
        annualCheckoutAvailable: Boolean!
      }

      type Mutation {
        updateGymResourceAllocation(id: ID!, data: JSON!): JSON!
        importMemberContacts(source: String!, rows: JSON!, dryRun: Boolean): JSON!
        reconcileGymEntitlements(afterId: ID, limit: Int): JSON!
        refreshMyEntitlement: JSON!
        saveGymClassSchedule(id: ID, data: JSON!): ClassSchedule
        saveGymClassInstance(id: ID, data: JSON!): ClassInstance
        replayPaymentEvent(eventId: ID!): JSON!
        runOperationsCommand(command: String!, data: JSON!): JSON!
        bookClass(classInstanceId: ID!, memberId: ID!): BookClassResult!
        promoteFromWaitlist(classInstanceId: ID!): PromoteResult!
        cancelClassBooking(bookingId: ID!): BookingCancellationResult!
        cancelClassInstance(classInstanceId: ID!, reason: String!): ClassInstanceCancellationResult!
        markClassAttendance(
          bookingId: ID!
          outcome: String!
          minutesLate: Int
          notes: String
        ): AttendanceRecord!
        recordMemberCheckIn(memberId: ID!, locationId: ID, method: String!): CheckInTransitionResult!
        checkOutMember(checkInId: ID!): CheckInTransitionResult!
        upsertGymSettings(data: GymSettingsUpdateInput!): GymSettings!
        runDeterministicOnboarding(template: String!, data: JSON): OnboardingRunResult!
        registerMember(data: RegisterMemberInput!): User
        inviteMember(data: InviteMemberInput!): InviteMemberResult!
        setMemberAccountStatus(memberId: ID!, status: String!): Member!
        prepareInstructorAccount(instructorId: ID!, email: String!): InstructorAccountClaimResult!
        updateMemberProfile(data: MemberProfileUpdateInput!): MemberProfileProjection!
        transitionOnboardingStatus(status: String!): User!
        generateUpcomingClassInstances(weeks: Int!): SchedulingGenerationResult!
        updateClassScheduleCapacity(classScheduleId: ID!, maxCapacity: Int!): ClassSchedule!
        updateClassInstanceCapacity(classInstanceId: ID!, maxCapacity: Int): ClassInstance!
        authorizeKioskSession(credential: String!, organizationId: ID!): Boolean!
        kioskRecordMemberCheckIn(
          memberId: String
          qrCode: String
          locationId: String
          organizationId: ID!
          credential: String!
        ): KioskMemberCheckInResult!
        kioskRecordGuestCheckIn(
          name: String!
          phone: String
          hostMember: String
          idempotencyKey: String!
          organizationId: ID!
          credential: String!
        ): KioskGuestCheckInResult!
        submitContactForm(data: ContactFormInput!): Boolean!
        discoveryBookClass(
          credential: String!
          partner: String
          classInstanceId: ID!
          memberId: ID
          memberEmail: String
        ): JSON!
        # Stripe subscription mutations
        initiateMembershipCheckout(tierId: ID!, billingCycle: String!): MembershipCheckoutResult!
        completeMembershipCheckout(providerSessionId: String!): MembershipCheckoutCompletionResult!

        refundGymPayment(paymentId: ID!, amount: Int, reason: String, idempotencyKey: String!): GymPayment!

        createStripeSetupIntent(userId: ID!): SetupIntentResult!

        cancelMembership(membershipId: ID!, reason: String, idempotencyKey: String!): MembershipActionResult!

        freezeMembership(
          membershipId: ID!
          endDate: String!
          idempotencyKey: String!
        ): MembershipActionResult!

        unfreezeMembership(membershipId: ID!, idempotencyKey: String!): MembershipActionResult!

        changeMembershipTier(
          membershipId: ID!
          newTierId: ID!
          idempotencyKey: String!
        ): MembershipActionResult!

        markPaymentRecoveryContacted(membershipId: ID!): Membership!
        getStripeBillingPortal(userId: ID!, returnUrl: String!): BillingPortalResult!
      }

      type ClassAvailabilityResult {
        available: Boolean!
        spotsRemaining: Int!
        waitlistPosition: Int
        reason: String
      }

      type BookClassResult {
        booking: ClassBooking
        creditsRemaining: Int!
      }

      type PromoteResult {
        promoted: Boolean!
        booking: ClassBooking
        message: String!
      }

      type BookingCancellationResult {
        booking: ClassBooking!
        promoted: Boolean!
        message: String!
      }

      type CheckInTransitionResult {
        checkIn: CheckIn!
        reused: Boolean!
      }

      type ClassInstanceCancellationResult {
        classInstanceId: ID!
        cancelledBookings: Int!
        refundedCredits: Int!
        reused: Boolean!
      }

      type MemberProfileTier {
        id: ID!
        name: String!
        monthlyPrice: Float!
      }

      type MemberProfileProjection {
        id: ID!
        name: String!
        email: String!
        phone: String
        dateOfBirth: String
        joinDate: String!
        status: String!
        emergencyContactName: String
        emergencyContactPhone: String
        healthNotes: JSON
        profilePhotoUrl: String
        membershipTier: MemberProfileTier
        membershipLengthDays: Int!
        attendanceRate: Float!
        lastCheckIn: String
      }

      input MemberProfileUpdateInput {
        name: String
        email: String
        phone: String
        password: String
        dateOfBirth: String
        emergencyContactName: String
        emergencyContactPhone: String
        healthNotes: JSON
      }

      type MemberCheckInCode {
        qrDataUrl: String
        expiresIn: Int!
        error: String
      }

      input InviteMemberInput {
        name: String!
        email: String!
        phone: String
      }

      type InviteMemberResult {
        userId: ID!
        memberId: ID!
        email: String!
      }

      type InstructorAccountClaimResult {
        userId: ID!
        email: String!
      }

      type SchedulingGenerationResult {
        success: Boolean!
        createdCount: Int!
      }

      type KioskSearchMember {
        id: ID!
        name: String!
        email: String!
        phone: String!
        status: String!
        membershipTier: String
        membershipStatus: String
        classCreditsRemaining: Int
      }

      type KioskMemberCheckInResult {
        success: Boolean!
        error: String
        checkInId: ID
        memberName: String
        membershipTier: String
        checkInTime: String
        reused: Boolean
        classCreditsRemaining: Int
      }

      type KioskGuestCheckInResult {
        success: Boolean!
        checkInId: ID!
        guestName: String!
        checkInTime: String!
      }

      # Stripe subscription types
      type MembershipCheckoutCompletionResult {
        membershipId: String!
        paymentProviderId: ID!
        paymentSessionId: ID!
        subscriptionId: String!
        tierName: String!
        billingCycle: String!
      }

      type MembershipCheckoutResult {
        id: ID!
        status: String!
        checkoutUrl: String!
        reused: Boolean!
      }

      input ContactFormInput {
        firstName: String!
        lastName: String!
        email: String!
        phone: String
        topic: String
        message: String!
      }

      input RegisterMemberInput {
        email: String!
        password: String!
        name: String!
        phone: String
      }

      type OnboardingRunResult {
        success: Boolean!
        organizationId: ID!
        runId: ID!
        instanceCount: Int!
      }

      type SetupIntentResult {
        clientSecret: String!
        setupIntentId: String!
      }

      type MembershipActionResult {
        membership: Membership
        message: String!
      }

      type BillingPortalResult {
        url: String!
      }

      type BillingStats {
        totalRevenue: Float!
        monthlyRevenue: Float!
        currencyCode: String!
        activeSubscriptions: Int!
        activeMemberships: Int!
        pastDueCount: Int!
      }
    `, trainingWorkspaceTypeDefs, retailTypeDefs],
    resolvers: {
      Query: {
        retailWorkspace,
        trainingWorkspace: getTrainingWorkspace,
        operationsWorkspace,
        participationWorkspace,
        exportOperatingData,
        redirectToInit: redirectToInit_default,
        checkClassAvailability,
        getBillingStats,
        billingWorkspace: getBillingWorkspace,
        memberProfile: getMemberProfile,
        memberCheckInCode: getMemberCheckInCode,
        schedulingWorkspace: getSchedulingWorkspace,
        instructorAccount: getInstructorAccount,
        rosterSessions: getRosterSessions,
        rosterDetail: getRosterDetail,
        frontDeskWorkspace: getFrontDeskWorkspace,
        reportsDashboard: getReportsDashboard,
        kioskSearchMembers,
        discoveryClasses: getDiscoveryClasses,
        publicGymSettings: getPublicGymSettings,
        publicGymClassTypes: getPublicGymClassTypes,
        publicGymClassType: getPublicGymClassType,
        publicGymSchedules: getPublicGymSchedules,
        publicGymSchedule: getPublicGymSchedule,
        publicGymClassInstances: getPublicGymClassInstances,
        publicGymClassInstance: getPublicGymClassInstance,
        publicGymInstructors: getPublicGymInstructors,
        publicGymInstructor: getPublicGymInstructor,
        publicGymMembershipTiers: getPublicGymMembershipTiers,
        publicGymMembershipTier: getPublicGymMembershipTier
      },
      Mutation: {
        updateGymResourceAllocation: updateGymResource,
        saveRetailItem,
        sellRetail,
        returnRetail,
        closeRetail,
        importMemberContacts,
        bookTrainerAppointment,
        transitionTrainerAppointment,
        rescheduleTrainerAppointment,
        recordTrainingPackage,
        refundTrainingPackage,
        saveTrainerAvailability,
        assignCoaching,
        transitionCoaching,
        saveTrainingLead,
        reconcileGymEntitlements,
        refreshMyEntitlement,
        saveGymClassSchedule,
        saveGymClassInstance,
        replayPaymentEvent,
        runOperationsCommand,
        bookClass,
        promoteFromWaitlist,
        cancelClassBooking,
        cancelClassInstance,
        markClassAttendance,
        recordMemberCheckIn,
        checkOutMember,
        upsertGymSettings,
        runDeterministicOnboarding,
        registerMember,
        inviteMember,
        setMemberAccountStatus,
        prepareInstructorAccount,
        updateMemberProfile,
        transitionOnboardingStatus,
        generateUpcomingClassInstances,
        updateClassScheduleCapacity,
        updateClassInstanceCapacity,
        authorizeKioskSession,
        kioskRecordMemberCheckIn,
        kioskRecordGuestCheckIn,
        discoveryBookClass: bookDiscoveryClass,
        submitContactForm,
        initiateMembershipCheckout,
        completeMembershipCheckout,
        refundGymPayment,
        createStripeSetupIntent,
        cancelMembership,
        freezeMembership,
        unfreezeMembership,
        changeMembershipTier,
        markPaymentRecoveryContacted,
        getStripeBillingPortal
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer2 = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer2.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer2.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/index.ts
var isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
var strictConfig = !isNextBuild && process.env.NODE_ENV === "production" || process.env.GYM_STRICT_CONFIG === "true";
if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
  throw new Error("PUBLIC_SIGNUPS_ALLOWED is reserved for dashboard User signup, which is not supported for Gym.");
}
if (strictConfig && process.env.PAYMENT_TEST_MODE === "true") {
  throw new Error("PAYMENT_TEST_MODE must be disabled in strict/production mode.");
}
function requiredSecret(name) {
  const value = process.env[name];
  if (strictConfig && (!value || value.length < 32)) {
    throw new Error(`${name} must be configured with at least 32 characters in strict mode.`);
  }
  return value;
}
function requiredValue(name) {
  const value = process.env[name]?.trim();
  if (strictConfig && !value) throw new Error(`${name} must be configured in strict mode.`);
  return value;
}
function requiredUrl(name) {
  const value = requiredValue(name);
  if (strictConfig && value) {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${name} must use http or https.`);
    }
  }
  return value;
}
function explicitCapability(name) {
  const value = process.env[name]?.trim().toLowerCase();
  if (strictConfig && value !== "true" && value !== "false") {
    throw new Error(`${name} must be explicitly true or false in strict mode.`);
  }
  return value === "true";
}
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
if (strictConfig && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured in strict mode.");
}
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: requiredSecret("SESSION_SECRET") || "local-only-session-secret-for-tests"
};
if (strictConfig) {
  const stripeEnabled = explicitCapability("STRIPE_ENABLED");
  const mailEnabled = explicitCapability("MAIL_ENABLED");
  if (stripeEnabled) {
    requiredSecret("STRIPE_SECRET_KEY");
    requiredSecret("STRIPE_WEBHOOK_SECRET");
  }
  requiredSecret("QR_CODE_SECRET");
  requiredUrl("NEXTAUTH_URL");
  if (mailEnabled) {
    requiredValue("SMTP_HOST");
    requiredValue("SMTP_PORT");
    requiredValue("SMTP_USER");
    requiredValue("SMTP_PASSWORD");
    requiredValue("SMTP_FROM");
    requiredUrl("SMTP_STORE_LINK");
  }
  if (process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true") {
    requiredValue("PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID");
    requiredValue("STOREFRONT_ORGANIZATION_ID");
  }
  const kioskConfigured = Boolean(process.env.KIOSK_API_TOKEN || process.env.KIOSK_ORGANIZATION_ID);
  if (kioskConfigured) {
    requiredSecret("KIOSK_API_TOKEN");
    requiredValue("KIOSK_ORGANIZATION_ID");
  }
  const discoveryConfigured = Boolean(
    process.env.DISCOVERY_API_KEY || process.env.DISCOVERY_ORGANIZATION_ID || process.env.DISCOVERY_API_SCOPES
  );
  if (discoveryConfigured) {
    requiredSecret("DISCOVERY_API_KEY");
    requiredValue("DISCOVERY_ORGANIZATION_ID");
    requiredValue("DISCOVERY_API_SCOPES");
  }
}
var bucketName = process.env.S3_BUCKET_NAME || (strictConfig ? "" : "keystone-test");
var region = process.env.S3_REGION || (strictConfig ? "" : "ap-southeast-2");
var accessKeyId = process.env.S3_ACCESS_KEY_ID || (strictConfig ? "" : "keystone");
var secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || (strictConfig ? "" : "keystone");
var endpoint = process.env.S3_ENDPOINT || (strictConfig ? "" : "https://sfo3.digitaloceanspaces.com");
if (strictConfig && (!bucketName || !region || !accessKeyId || !secretAccessKey || !endpoint)) {
  throw new Error("S3 storage configuration is incomplete in strict mode.");
}
var { withAuth } = (0, import_auth2.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      // The tenant-ownership migration always creates this deterministic
      // bootstrap organization before the first account can be initialized.
      organization: {
        connect: { id: "gym_default_organization" }
      },
      role: {
        create: {
          organization: { connect: { id: "gym_default_organization" } },
          name: "Admin",
          canCreateRecords: true,
          canManageAllRecords: true,
          canSeeOtherPeople: true,
          canEditOtherPeople: true,
          canManagePeople: true,
          canManageRoles: true,
          canAccessDashboard: true,
          canManageOnboarding: true,
          canManageSettings: true,
          canManageAppointments: true,
          canManageFacilities: true,
          canManagePrograms: true,
          canManageCommunications: true,
          canManageRetail: true,
          canManagePayroll: true,
          canViewReports: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    onboardingStatus
    organization {
      id
      name
    }
    role {
      id
      name
      canCreateRecords
      canManageAllRecords
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canManageRoles
      canAccessDashboard
      canManageOnboarding
      canManageSettings
      canManageAppointments
      canManageCheckIns
      canManageFacilities
      canManagePrograms
      canManageCommunications
      canManageRetail
      canManagePayroll
      canViewReports
      isInstructor
    }
  `
});
var keystone_default = withAuth(
  (0, import_core43.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session })
    },
    session: (0, import_session.statelessSessions)(sessionConfig),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
