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

// features/keystone/lib/prisma-result.ts
function throwOnKeystonePrismaError(result, operation = "Prisma operation") {
  if (result instanceof Error) throw result;
  if (result === null || typeof result !== "object") return result;
  if ("errors" in result && Array.isArray(result.errors)) {
    throw new Error(`${operation} returned a GraphQL error result`);
  }
  return result;
}
function validatePrismaResult(path, result) {
  throwOnKeystonePrismaError(result, path);
  const operation = path.slice(path.lastIndexOf(".") + 1);
  if (operation === "count") {
    if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${path} returned a malformed count`);
  } else if (["createMany", "updateMany", "deleteMany"].includes(operation)) {
    const count = result?.count;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${path} returned a malformed affected-row count`);
  }
  return result;
}
function guardKeystonePrismaResults(client) {
  const wrap = (value, path) => {
    const cached = guardedClientCache.get(value);
    if (cached) return cached;
    const proxy = new Proxy(value, {
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver);
        const name = typeof property === "string" ? property : String(property);
        const memberPath = path ? `${path}.${name}` : name;
        if (typeof member === "function") {
          const operation = member;
          return (...args) => {
            let guardedArgs = args;
            if (memberPath === "$transaction" && typeof args[0] === "function") {
              const callback = args[0];
              guardedArgs = [(transaction) => callback(guardKeystonePrismaResults(transaction)), ...args.slice(1)];
            }
            return Promise.resolve(Reflect.apply(operation, target, guardedArgs)).then((result) => validatePrismaResult(memberPath, result));
          };
        }
        if (member && typeof member === "object" && !(member instanceof Date) && !Array.isArray(member)) {
          return wrap(member, memberPath);
        }
        return member;
      }
    });
    guardedClientCache.set(value, proxy);
    return proxy;
  };
  return wrap(client, "");
}
function withKeystonePrismaTransaction(prisma, callback, options) {
  const guardedPrisma = guardKeystonePrismaResults(prisma);
  return guardedPrisma.$transaction(callback, options);
}
function requirePrismaAffectedCount(result, expected, operation) {
  throwOnKeystonePrismaError(result, operation);
  const count = result?.count;
  if (!Number.isSafeInteger(count) || count !== expected) {
    throw new Error(`${operation} affected ${String(count)} rows; expected ${expected}`);
  }
  return count;
}
var guardedClientCache;
var init_prisma_result = __esm({
  "features/keystone/lib/prisma-result.ts"() {
    "use strict";
    guardedClientCache = /* @__PURE__ */ new WeakMap();
  }
});

// features/keystone/lib/operational-policy.ts
var operational_policy_exports = {};
__export(operational_policy_exports, {
  assertParticipationAllowed: () => assertParticipationAllowed,
  isAdult: () => isAdult,
  lockParticipationPolicy: () => lockParticipationPolicy
});
async function lockParticipationPolicy(tx, organizationId) {
  const result = await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`participation:${organizationId}`}))`;
  throwOnKeystonePrismaError(result, "participation advisory lock");
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
    init_prisma_result();
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
async function assertNoPendingMembershipFreeze(tx, organizationId, membershipId) {
  tx = guardKeystonePrismaResults(tx);
  const attempt = await tx.membershipBillingAttempt.findFirst({
    where: { organizationId, membershipId, operation: "freeze", status: "processing" },
    select: { id: true }
  });
  if (attempt instanceof Error) throw attempt;
  if (attempt) throw new Error("Membership freeze is being finalized; participation is temporarily unavailable");
}
async function ensureMonthlyCreditGrant(tx, membership, at) {
  tx = guardKeystonePrismaResults(tx);
  assertMembershipServiceEligibility(membership, at);
  const { periodStart, periodEnd } = monthlyServicePeriod(membership, at);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  const key = `${membership.id}:${periodStart.toISOString()}`;
  const existing = await tx.membershipCreditGrant.findUnique({ where: { key } });
  if (existing) return existing;
  const anyGrant = await tx.membershipCreditGrant.findFirst({ where: { membershipId: membership.id } });
  const now = /* @__PURE__ */ new Date();
  const preserveLegacyBalance = !anyGrant && membership.agreementSnapshot?.creditLedgerPolicy !== "monthly-grant-v1" && periodStart.getTime() === new Date(membership.creditPeriodStart || membership.startDate).getTime() && periodStart <= now && now < periodEnd;
  const remaining = allowance === -1 ? -1 : preserveLegacyBalance ? Math.min(Math.max(membership.classCreditsRemaining ?? 0, 0), Math.max(allowance, 0)) : allowance;
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
  tx = guardKeystonePrismaResults(tx);
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
  tx = guardKeystonePrismaResults(tx);
  const debit = await tx.membershipCreditEntry.findUnique({ where: { key: `${bookingId}:debit` } });
  if (!debit) {
    await tx.classBooking.update({ where: { id: bookingId }, data: { eligibilityReviewReason: "Legacy booking has no credit provenance; staff must review any credit adjustment" } });
    return false;
  }
  const key = `${bookingId}:restore`;
  if (await tx.membershipCreditEntry.findUnique({ where: { key } })) return false;
  const grant = await tx.membershipCreditGrant.findUnique({ where: { id: debit.grantId } });
  if (!grant) throw new Error("Credit source grant is missing");
  const restores = debit.delta < 0 && grant.allowance !== -1;
  if (restores) await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { remaining: Math.min(grant.allowance, grant.remaining - debit.delta) } });
  await tx.membershipCreditEntry.create({ data: { key, organizationId: grant.organizationId, grantId: grant.id, bookingId, delta: -debit.delta, kind: "restoration" } });
  await updateCurrentCreditDisplay(tx, grant.membershipId);
  return restores;
}
async function applyPlanAllowanceToCurrentGrant(tx, membership, at) {
  tx = guardKeystonePrismaResults(tx);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  let period;
  try {
    period = monthlyServicePeriod(membership, at);
  } catch {
    return null;
  }
  const grant = await tx.membershipCreditGrant.findUnique({ where: { key: `${membership.id}:${period.periodStart.toISOString()}` } });
  if (!grant) return null;
  const updated = await tx.membershipCreditGrant.update({ where: { id: grant.id }, data: { allowance, remaining: allowance } });
  await updateCurrentCreditDisplay(tx, membership.id);
  return updated;
}
async function updateCurrentCreditDisplay(tx, membershipId) {
  tx = guardKeystonePrismaResults(tx);
  const now = /* @__PURE__ */ new Date();
  const current = await tx.membershipCreditGrant.findFirst({ where: { membershipId, periodStart: { lte: now }, periodEnd: { gt: now } }, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }] });
  if (current) await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: current.remaining } });
}
async function reviewFutureMembershipBookings(tx, membership) {
  tx = guardKeystonePrismaResults(tx);
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  const identity = await prisma.membership.findFirst({ where: { organizationId, memberId: userId }, select: { id: true } });
  if (!identity) return { refreshed: false, reason: "No membership" };
  return refreshScopedMembership(context.prisma, organizationId, identity.id);
}
async function refreshScopedMembership(prisma, organizationId, membershipId) {
  prisma = guardKeystonePrismaResults(prisma);
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
    init_prisma_result();
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
  fillReleasedSeats: () => fillReleasedSeats,
  lockTransactionKey: () => lockTransactionKey,
  promoteCapacityControlledWaitlistBooking: () => promoteCapacityControlledWaitlistBooking,
  promoteCapacityControlledWaitlistBookingInTransaction: () => promoteCapacityControlledWaitlistBookingInTransaction,
  updateCapacityControlledClassInstance: () => updateCapacityControlledClassInstance,
  updateCapacityControlledClassSchedule: () => updateCapacityControlledClassSchedule,
  updateCapacityControlledClassScheduleInTransaction: () => updateCapacityControlledClassScheduleInTransaction
});
async function lockTransactionKey(transaction, key) {
  const result = await transaction.$queryRaw`
    SELECT true AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired
  `;
  if (result instanceof Error) throw result;
}
function boundedCapacity(value, allowNull = false) {
  if (allowNull && value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 1e4) {
    throw new Error("Capacity must be a whole number between 1 and 10000");
  }
  return value;
}
async function updateCapacityControlledClassInstance(prisma, input) {
  prisma = guardKeystonePrismaResults(prisma);
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
    const updated = await transaction.classInstance.update({
      where: { id: instance.id },
      data: { maxCapacity: requested }
    });
    await fillReleasedSeats(transaction, instance.id, input.organizationId);
    return updated;
  });
}
async function updateCapacityControlledClassScheduleInTransaction(transaction, input, beforeCapacityWrite) {
  transaction = guardKeystonePrismaResults(transaction);
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
  const updated = await transaction.classSchedule.update({
    where: { id: schedule.id },
    data: { maxCapacity }
  });
  for (const instanceId of instanceIds) await fillReleasedSeats(transaction, instanceId, input.organizationId);
  return updated;
}
async function updateCapacityControlledClassSchedule(prisma, input) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(
    (transaction) => updateCapacityControlledClassScheduleInTransaction(transaction, input)
  );
}
async function createCapacityControlledBooking(prisma, input) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(async (transaction) => {
    await lockParticipationPolicy(transaction, input.actorOrganizationId);
    await lockTransactionKey(transaction, `class-instance:${input.classInstanceId}`);
    await lockTransactionKey(transaction, `member:${input.memberId}`);
    const classInstance = await transaction.classInstance.findFirst({
      where: { id: input.classInstanceId, organizationId: input.actorOrganizationId },
      include: {
        location: { select: { id: true, name: true, address: true, isActive: true } },
        instructor: { select: { id: true, user: { select: { name: true } } } },
        classSchedule: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            startTime: true,
            endTime: true,
            isActive: true,
            classType: { select: { id: true, name: true } },
            location: { select: { id: true, name: true, address: true, isActive: true } },
            instructor: { select: { id: true, user: { select: { name: true } } } }
          }
        }
      }
    });
    if (!classInstance) throw new Error("Class instance not found");
    if (classInstance.organizationId !== input.actorOrganizationId) throw new Error("Class is not in the actor's organization");
    if (classInstance.isCancelled) throw new Error("Class has been cancelled");
    if (classInstance.date.getTime() <= Date.now()) throw new Error("Past classes cannot be booked");
    if (!classInstance.classSchedule?.isActive) throw new Error("This class is no longer offered");
    const site = classInstance.location ?? classInstance.classSchedule?.location ?? null;
    if (site && !site.isActive) throw new Error("This class's location is closed for new bookings");
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
    const membership = await transaction.membership.findFirst({
      where: { memberId: member.user.id, organizationId: input.actorOrganizationId, status: "active" },
      include: { tier: { select: { classCreditsPerMonth: true, maxClassBookings: true } } }
    });
    if (!membership) throw new Error("No active membership found");
    await assertNoPendingMembershipFreeze(transaction, input.actorOrganizationId, membership.id);
    await assertParticipationAllowed(transaction, input.actorOrganizationId, member.id, classInstance.date, classInstance.locationId);
    const grant = await ensureMonthlyCreditGrant(transaction, membership, classInstance.date);
    const unlimited = grant.allowance === -1;
    const currentCredits = grant.remaining;
    if (!unlimited && currentCredits <= 0) {
      throw new Error("No class credits remaining");
    }
    const maximumBookings = membership.agreementSnapshot?.maxClassBookings ?? membership.tier?.maxClassBookings ?? 0;
    if (maximumBookings > 0 && await transaction.classBooking.count({ where: { organizationId: input.actorOrganizationId, memberId: member.id, status: { in: ["confirmed", "waitlist"] }, classInstance: { date: { gt: /* @__PURE__ */ new Date() } } } }) >= maximumBookings) throw new Error("Membership concurrent booking limit reached");
    await fillReleasedSeats(transaction, input.classInstanceId, input.actorOrganizationId);
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
        serviceSnapshot: bookingServiceSnapshot(classInstance, unlimited),
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
function bookingServiceSnapshot(classInstance, unlimitedCredits) {
  const schedule = classInstance.classSchedule;
  const coach = classInstance.instructor ?? schedule?.instructor ?? null;
  const site = classInstance.location ?? schedule?.location ?? null;
  const minutes = (value) => Number(value?.slice(0, 2)) * 60 + Number(value?.slice(3));
  const duration = minutes(schedule?.endTime) - minutes(schedule?.startTime);
  const endsAt = classInstance.endsAt || new Date(classInstance.date.getTime() + (Number.isFinite(duration) && duration > 0 ? duration : 60) * 6e4);
  return {
    version: 1,
    classScheduleId: schedule?.id ?? null,
    className: schedule?.name ?? "Class",
    classTypeId: schedule?.classType?.id ?? null,
    classTypeName: schedule?.classType?.name ?? null,
    instructorId: coach?.id ?? null,
    instructorName: coach?.user?.name ?? null,
    locationId: site?.id ?? null,
    locationName: site?.name ?? null,
    locationAddress: site?.address ?? null,
    startsAt: classInstance.date.toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    creditTerms: unlimitedCredits ? "unlimited membership" : "one membership class credit, restored if cancelled before the class starts"
  };
}
async function fillReleasedSeats(transaction, classInstanceId, organizationId) {
  const waiting = await guardKeystonePrismaResults(transaction).classBooking.count({ where: { classInstanceId, organizationId, status: "waitlist" } });
  for (let promoted = 0; promoted < waiting; promoted += 1) {
    const result = await promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId, true);
    if (!result.promoted) break;
  }
}
async function promoteCapacityControlledWaitlistBooking(prisma, classInstanceId, organizationId) {
  prisma = guardKeystonePrismaResults(prisma);
  return prisma.$transaction(
    (transaction) => promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId)
  );
}
async function promoteCapacityControlledWaitlistBookingInTransaction(transaction, classInstanceId, organizationId, locksAlreadyHeld = false) {
  transaction = guardKeystonePrismaResults(transaction);
  if (!locksAlreadyHeld) {
    await lockParticipationPolicy(transaction, organizationId);
    await lockTransactionKey(transaction, `class-instance:${classInstanceId}`);
  }
  const classInstance = await transaction.classInstance.findFirst({
    where: { id: classInstanceId, organizationId },
    include: {
      location: { select: { isActive: true } },
      classSchedule: { select: { maxCapacity: true, startTime: true, endTime: true, isActive: true, location: { select: { isActive: true } } } }
    }
  });
  if (!classInstance) throw new Error("Class instance not found");
  if (classInstance.organizationId !== organizationId) throw new Error("Class is not in the requested organization");
  if (classInstance.isCancelled) {
    return { promoted: false, message: "Class has been cancelled" };
  }
  if (!classInstance.classSchedule?.isActive) return { promoted: false, message: "This class is no longer offered" };
  if ((classInstance.location ?? classInstance.classSchedule?.location)?.isActive === false) return { promoted: false, message: "This class's location is closed" };
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
      await assertNoPendingMembershipFreeze(transaction, organizationId, lockedMembership.id);
      await assertParticipationAllowed(transaction, organizationId, candidate.memberId, classInstance.date, classInstance.locationId);
      await assertNoMemberServiceConflict(transaction, candidate.memberId, organizationId, classInstance);
      const grant = await ensureMonthlyCreditGrant(transaction, lockedMembership, classInstance.date);
      if (grant.allowance !== -1 && grant.remaining <= 0) {
        if (candidate.eligibilityReviewReason) {
          await transaction.classBooking.update({ where: { id: candidate.id }, data: { eligibilityReviewReason: "" } });
        }
        continue;
      }
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
    data: { status: "confirmed", waitlistPosition: null, eligibilityReviewReason: "" }
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
  tx = guardKeystonePrismaResults(tx);
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
    init_prisma_result();
  }
});

// features/integrations/payment/stripe-adapter.ts
var stripe_adapter_exports = {};
__export(stripe_adapter_exports, {
  assertStripeMembershipPrice: () => assertStripeMembershipPrice,
  stripePaymentProviderAdapter: () => stripePaymentProviderAdapter
});
function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe secret key not configured.");
  return new import_stripe.default(secretKey, { apiVersion: "2023-10-16" });
}
function getStripeChargeClient() {
  if (process.env.STRIPE_ENABLED !== "true") {
    throw new Error("Stripe checkout is disabled for this Gym deployment.");
  }
  return getStripeClient();
}
async function ensureCustomer(input) {
  if (input.customerId) return input.customerId;
  const customer = await getStripeChargeClient().customers.create(
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
        const price = await getStripeChargeClient().prices.retrieve(input.priceId, {
          expand: ["product"]
        });
        assertStripeMembershipPrice(price, input);
      },
      async createMembershipCheckout(input) {
        const stripe = getStripeChargeClient();
        const customerId = await ensureCustomer(input);
        const session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            customer: customerId,
            client_reference_id: input.idempotencyKey,
            line_items: [{ price: input.priceId, quantity: 1 }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            // The reviewed agreement is the plan price. Promotion codes could make the first
            // invoice zero, which never activates paid-only service, so none are offered.
            allow_promotion_codes: false,
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
      async createCounterCheckout(input) {
        const session = await getStripeChargeClient().checkout.sessions.create(
          {
            mode: "payment",
            ...input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1e3) } : {},
            client_reference_id: input.idempotencyKey,
            line_items: [{
              quantity: 1,
              price_data: {
                currency: input.currencyCode.toLowerCase(),
                unit_amount: input.amount,
                product_data: { name: input.description }
              }
            }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: input.metadata,
            payment_intent_data: { description: input.description, metadata: input.metadata }
          },
          { idempotencyKey: input.idempotencyKey }
        );
        if (!session.url && session.status === "open") throw new Error("Stripe checkout did not return a redirect URL.");
        return {
          providerSessionId: session.id,
          checkoutUrl: session.url || "",
          status: session.status || "open",
          expiresAt: session.expires_at ? new Date(session.expires_at * 1e3).toISOString() : null
        };
      },
      retrieveCounterCheckout(providerSessionId) {
        return getStripeClient().checkout.sessions.retrieve(providerSessionId);
      },
      async expireCounterCheckout(providerSessionId) {
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(providerSessionId);
        if (session.status !== "open") return session;
        try {
          return await stripe.checkout.sessions.expire(providerSessionId);
        } catch (error) {
          const current = await stripe.checkout.sessions.retrieve(providerSessionId);
          if (current.status !== "open") return current;
          throw error;
        }
      },
      async createSetupIntent(customerId) {
        const intent = await getStripeChargeClient().setupIntents.create({
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
        const stripe = getStripeChargeClient();
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
      refundPayment(paymentIntentId, amount, idempotencyKey, evidence) {
        return getStripeClient().refunds.create(
          {
            payment_intent: paymentIntentId,
            ...amount ? { amount } : {},
            ...evidence ? { metadata: {
              gymRefundOperationKey: evidence.operationKey,
              gymRefundCurrency: evidence.currencyCode,
              gymRefundReason: evidence.reason
            } } : {}
          },
          idempotencyKey ? { idempotencyKey } : void 0
        );
      },
      async findRefundPayment(paymentIntentId, operationKey2) {
        const stripe = getStripeClient();
        let startingAfter;
        for (let pageCount = 0; pageCount < 100; pageCount += 1) {
          const page = await stripe.refunds.list({
            payment_intent: paymentIntentId,
            limit: 100,
            ...startingAfter ? { starting_after: startingAfter } : {}
          });
          const match = page.data.find((refund) => refund.metadata?.gymRefundOperationKey === operationKey2);
          if (match) return match;
          if (!page.has_more) return null;
          const lastId = page.data.at(-1)?.id;
          if (!lastId) throw new Error("Stripe refund history page was incomplete; operator reconciliation required");
          startingAfter = lastId;
        }
        throw new Error("Stripe refund history exceeds the automatic reconciliation bound; operator review required");
      },
      retrieveRefund(refundId) {
        return getStripeClient().refunds.retrieve(refundId);
      },
      constructWebhookEvent(payload, signature2) {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) throw new Error("Stripe webhook secret not configured.");
        return getStripeClient().webhooks.constructEvent(payload, signature2, secret);
      }
    };
  }
});

// features/integrations/payment/test-adapter.ts
var test_adapter_exports = {};
__export(test_adapter_exports, {
  resetTestRefundsForTesting: () => resetTestRefundsForTesting,
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
function resetTestRefundsForTesting() {
  testRefunds.clear();
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
function verifySignature(payload, signature2) {
  const secret = process.env.PAYMENT_TEST_WEBHOOK_SECRET;
  if (!secret) throw new Error("Payment test webhook secret not configured.");
  const expected = (0, import_node_crypto3.createHmac)("sha256", secret).update(payload).digest("hex");
  const provided = signature2.replace(/^test=/, "");
  if (expected.length !== provided.length || !(0, import_node_crypto3.timingSafeEqual)(Buffer.from(expected), Buffer.from(provided))) {
    throw new Error("Payment test webhook signature verification failed.");
  }
}
var import_node_crypto3, testSubscriptions, testRefunds, testPaymentProviderAdapter;
var init_test_adapter = __esm({
  "features/integrations/payment/test-adapter.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    testSubscriptions = /* @__PURE__ */ new Map();
    testRefunds = /* @__PURE__ */ new Map();
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
      async refundPayment(paymentIntentId, amount, idempotencyKey, evidence) {
        const key = `${paymentIntentId}:${idempotencyKey || "no-key"}`;
        const existing = testRefunds.get(key);
        if (existing) return structuredClone(existing);
        const refund = {
          id: `test_refund_${digest(key)}`,
          object: "refund",
          payment_intent: paymentIntentId,
          amount: amount ?? 0,
          currency: evidence?.currencyCode.toLowerCase() || "usd",
          status: "succeeded",
          metadata: evidence ? { gymRefundOperationKey: evidence.operationKey, gymRefundCurrency: evidence.currencyCode, gymRefundReason: evidence.reason } : {}
        };
        testRefunds.set(key, refund);
        return structuredClone(refund);
      },
      async findRefundPayment(paymentIntentId, operationKey2) {
        const refund = [...testRefunds.values()].find(
          (candidate) => candidate.payment_intent === paymentIntentId && candidate.metadata?.gymRefundOperationKey === operationKey2
        );
        return refund ? structuredClone(refund) : null;
      },
      constructWebhookEvent(payload, signature2) {
        verifySignature(payload, signature2);
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
var import_core45 = require("@keystone-6/core");
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
function canSeePeople(session) {
  const role = session?.data.role;
  return Boolean(role?.canManageAllRecords || role?.canSeeOtherPeople || role?.canEditOtherPeople || role?.canManagePeople);
}
function canEditPeople(session) {
  const role = session?.data.role;
  return Boolean(role?.canManageAllRecords || role?.canEditOtherPeople || role?.canManagePeople);
}
function ownBookingFilter(session) {
  return { member: { user: { id: { equals: session.itemId } } } };
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
    const narrower = canSeePeople(session) ? void 0 : { id: { equals: session.itemId } };
    return tenantFilter({ session }, narrower);
  },
  canReadOwnMember: ({ session }) => {
    if (!session) return false;
    const narrower = canSeePeople(session) ? void 0 : { user: { id: { equals: session.itemId } } };
    return tenantFilter({ session }, narrower);
  },
  canUpdateMember: ({ session }) => {
    if (!session) return false;
    const narrower = canEditPeople(session) ? void 0 : { user: { id: { equals: session.itemId } } };
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
  // Role managers list the tenant's roles they may assign; everyone else reads their own role.
  canReadOwnRole: ({ session }) => {
    if (!session) return false;
    const narrower = isOperatorSession(session) || session.data.role?.canManageRoles ? void 0 : { assignedTo: { some: { id: { equals: session.itemId } } } };
    return tenantFilter({ session }, narrower);
  },
  // Members keep reading templates and sessions they booked after a pause or
  // cancellation, so booking history retains the class name and date.
  canReadClassSchedule: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : session?.itemId ? { OR: [{ isActive: { equals: true } }, { instances: { some: { bookings: { some: ownBookingFilter(session) } } } }] } : { isActive: { equals: true } }
  ),
  canReadInstructor: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : { isActive: { equals: true } }
  ),
  canReadClassInstance: ({ session }) => tenantFilter(
    { session },
    isOperatorSession(session) ? void 0 : session?.itemId ? { OR: [{ isCancelled: { equals: false } }, { bookings: { some: ownBookingFilter(session) } }] } : { isCancelled: { equals: false } }
  ),
  // Backward-compatible aliases for the existing User/Member update boundaries.
  canReadPeople: ({ session }) => {
    if (!session) return false;
    return tenantFilter(
      { session },
      canSeePeople(session) ? void 0 : { id: { equals: session.itemId } }
    );
  },
  // Contact details of same-tenant people; login email, password and role keep their own field rules.
  canUpdatePeople: ({ session }) => {
    if (!session) return false;
    return tenantFilter(
      { session },
      canEditPeople(session) ? void 0 : { id: { equals: session.itemId } }
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
  hooks: {
    validateInput({ resolvedData }) {
      if (resolvedData.defaultCurrency !== void 0 && resolvedData.defaultCurrency !== "USD") {
        throw new Error("Organization currency is fixed to USD until multi-currency membership contracts are supported");
      }
    }
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
init_prisma_result();
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
  const relationship44 = value;
  if (relationship44.disconnect) return null;
  return typeof relationship44.connect?.id === "string" ? relationship44.connect.id : void 0;
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
    const prisma = guardKeystonePrismaResults(context.prisma);
    for (const target of targets) {
      const relationshipValue = resolvedData[target.field];
      const relationshipId = relationshipValue === void 0 ? item?.[`${target.field}Id`] : connectedRelationshipId(relationshipValue);
      if (!relationshipId) {
        if (target.required) addValidationError(`${target.field} is required`);
        continue;
      }
      const related = await prisma[target.list].findUnique({
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  const resource = await prisma.gymResource.findUnique({
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
init_prisma_result();
function rateLimitStorageKey(key) {
  const bounded = key.trim().slice(0, 200);
  if (!bounded) return "";
  return `bucket:${(0, import_node_crypto.createHash)("sha256").update(bounded).digest("hex")}`;
}
async function authAttemptAvailable(prisma, key, limit, now = /* @__PURE__ */ new Date()) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return false;
  const existing = await guardKeystonePrismaResults(prisma).authRateLimitBucket.findUnique({ where: { key: boundedKey } });
  return !existing || existing.resetAt <= now || existing.count < limit;
}
async function consumeAuthAttempt(prisma, key, limit, windowMs, now = /* @__PURE__ */ new Date()) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return false;
  const guardedPrisma = guardKeystonePrismaResults(prisma);
  return guardedPrisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`auth-rate:${boundedKey}`}, 0))) AS acquired`;
    const existing = await transaction.authRateLimitBucket.findUnique({ where: { key: boundedKey } });
    if (!existing || existing.resetAt <= now) {
      await transaction.authRateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 60 * 60 * 1e3) }, key: { not: boundedKey } } });
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
init_prisma_result();

// features/keystone/lib/lifecycle-guards.ts
init_prisma_result();
var LIVE_APPOINTMENT = ["scheduled", "confirmed", "checked_in"];
async function upcomingServicesAtLocation(context, organizationId, locationId) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const now = /* @__PURE__ */ new Date();
  const [classes, appointments] = await Promise.all([
    prisma.classInstance.count({ where: { organizationId, isCancelled: false, date: { gt: now }, OR: [
      { locationId },
      { locationId: null, classSchedule: { locationId } }
    ] } }),
    prisma.trainerAppointment.count({ where: { organizationId, locationId, status: { in: LIVE_APPOINTMENT }, endTime: { gt: now } } })
  ]);
  return { classes, appointments };
}
async function upcomingServicesForInstructor(context, organizationId, instructorId) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const now = /* @__PURE__ */ new Date();
  const [classes, appointments] = await Promise.all([
    prisma.classInstance.count({ where: { organizationId, isCancelled: false, date: { gt: now }, OR: [
      { instructorId },
      { instructorId: null, classSchedule: { instructorId } }
    ] } }),
    prisma.trainerAppointment.count({ where: { organizationId, instructorId, status: { in: LIVE_APPOINTMENT }, endTime: { gt: now } } })
  ]);
  return { classes, appointments };
}
async function memberHasHistory(context, organizationId, memberId, userId) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const checks = [];
  if (memberId) {
    checks.push(
      prisma.classBooking.count({ where: { organizationId, memberId } }),
      prisma.checkIn.count({ where: { organizationId, memberId } }),
      prisma.gymPayment.count({ where: { organizationId, memberId } }),
      prisma.subscription.count({ where: { organizationId, memberId } }),
      prisma.trainingPackage.count({ where: { organizationId, memberId } }),
      prisma.trainerAppointment.count({ where: { organizationId, memberId } }),
      prisma.participationEvidence.count({ where: { organizationId, memberId } })
    );
  }
  if (userId) {
    checks.push(
      prisma.membership.count({ where: { organizationId, memberId: userId } }),
      prisma.membershipPayment.count({ where: { organizationId, memberId: userId } }),
      prisma.paymentSession.count({ where: { organizationId, userId } })
    );
  }
  const counts = await Promise.all(checks);
  return counts.some((count) => count > 0);
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
  const prisma = guardKeystonePrismaResults(args.context.prisma);
  const role = await prisma.role.findUnique({
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
async function syncMemberIdentity({ operation, item, originalItem, context }) {
  if (operation !== "update" || !item) return;
  const changed = {};
  if (item.email !== originalItem?.email) changed.email = item.email;
  if (item.name !== originalItem?.name) changed.name = item.name;
  if (item.phone !== originalItem?.phone) changed.phone = item.phone || null;
  if (!Object.keys(changed).length) return;
  await guardKeystonePrismaResults(context.prisma).member.updateMany({
    where: { userId: item.id, organizationId: item.organizationId },
    data: changed
  });
}
var User = (0, import_core2.list)({
  hooks: {
    validateInput: validateUserInput,
    afterOperation: syncMemberIdentity,
    // Accounts that own memberships, bookings, payments or coaching history are archived
    // (member account closed, coach retired), never deleted out from under that history.
    async validateDelete({ item, context, addValidationError }) {
      const prisma = guardKeystonePrismaResults(context.prisma);
      const member = await prisma.member.findFirst({ where: { userId: item.id, organizationId: item.organizationId }, select: { id: true } });
      const coach = await prisma.instructor.count({ where: { userId: item.id } });
      if (coach || await memberHasHistory(context, item.organizationId, member?.id ?? null, item.id)) {
        addValidationError("This account has membership, booking, payment or coaching history and can't be deleted; close or retire it instead");
      }
    }
  },
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
    // The login identity: owners change it through their profile (with password proof);
    // generic edits are limited to global administrators and stay synchronized to Member.
    email: (0, import_fields3.text)({
      isIndexed: "unique",
      access: { update: permissions.canManageAllRecords },
      hooks: {
        resolveInput: ({ resolvedData }) => resolvedData.email === void 0 ? void 0 : normalizeAuthIdentity(resolvedData.email)
      },
      validation: {
        isRequired: true
      }
    }),
    // Customers change their password with current-password proof (changeMemberPassword) or a
    // one-use reset link; staff recover members by issuing such a link, never by choosing it.
    password: (0, import_fields3.password)({
      access: {
        read: import_access3.denyAll,
        update: ({ session, item }) => permissions.canManageAllRecords({ session }) || session?.itemId === item.id && permissions.canAccessDashboard({ session })
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
    canCreateRecords: (0, import_fields4.checkbox)({ defaultValue: false, label: "Reserved: grants no access in Gym", ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } } }),
    canManageAllRecords: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can read, update and delete every record in this organization (full administrator)" }),
    canSeeOtherPeople: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can read other members and staff" }),
    canEditOtherPeople: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can update other members and staff" }),
    canManagePeople: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can invite members, issue password links and manage member accounts" }),
    canManageRoles: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can CRUD roles" }),
    canAccessDashboard: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can access the dashboard" }),
    canManageOnboarding: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can access onboarding and store configuration" }),
    canManageSettings: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can edit store settings and publish participation terms" }),
    canManageAppointments: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can manage personal training packages, appointments and availability" }),
    canManageCheckIns: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can check members in and out at the front desk" }),
    canManageFacilities: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can manage rooms and equipment, closures and facility check-ins" }),
    canManagePrograms: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can assign and review coaching work for any member" }),
    canManageCommunications: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can read and answer storefront contact messages" }),
    canManageRetail: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can record retail sales, returns, stock and cash drawer closes" }),
    canManagePayroll: (0, import_fields4.checkbox)({ defaultValue: false, label: "Reserved: Gym has no payroll features; grants no access", ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } } }),
    canViewReports: (0, import_fields4.checkbox)({ defaultValue: false, label: "User can view reports" }),
    isInstructor: (0, import_fields4.checkbox)({ defaultValue: false, label: "User is a coach: sees their own rosters, appointments and coaching members" }),
    assignedTo: (0, import_fields4.relationship)({
      ref: "User.role",
      many: true,
      access: { create: import_access5.denyAll, update: import_access5.denyAll },
      ui: {
        displayMode: "count",
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
init_prisma_result();
function sensitiveMemberRead({ session, item }) {
  return Boolean(session?.itemId && session?.data?.organization?.id === item?.organizationId && (session.data?.role?.canManageAllRecords || session.data?.role?.canManagePeople || item?.userId === session.itemId));
}
async function syncAccountContact({ operation, item, originalItem, context }) {
  if (operation !== "update" || !item?.userId) return;
  const changed = {};
  if (item.name !== originalItem?.name) changed.name = item.name;
  if (item.phone !== originalItem?.phone) changed.phone = item.phone || "";
  if (!Object.keys(changed).length) return;
  await guardKeystonePrismaResults(context.prisma).user.updateMany({ where: { id: item.userId, organizationId: item.organizationId }, data: changed });
}
var Member = (0, import_core4.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "user", list: "user" },
      { field: "membershipTier", list: "membershipTier" }
    ]),
    afterOperation: syncAccountContact,
    // Paid membership, bookings, visits and consent stay attached to their member identity.
    async validateDelete({ item, context, addValidationError }) {
      if (await memberHasHistory(context, item.organizationId, item.id, item.userId)) {
        addValidationError("Members with bookings, visits, payments or agreements can't be deleted; close the account from Members instead (history is kept)");
      }
    }
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManagePeople,
      update: isSignedIn,
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadOwnMember,
      update: rules.canUpdateMember,
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
    // A projection of the account's login email; it changes only through the account.
    email: (0, import_fields5.text)({
      isIndexed: "unique",
      access: { update: import_access7.denyAll },
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
function membershipTierChangeCurrency(agreementSnapshot, organizationDefaultCurrency, gymSettingsCurrency) {
  const currency = (value) => typeof value === "string" ? value.trim().toUpperCase() : "";
  const contractCurrency = currency(agreementSnapshot?.currencyCode);
  const organizationCurrency = currency(organizationDefaultCurrency);
  const settingsCurrency = currency(gymSettingsCurrency);
  if (contractCurrency !== "USD") {
    throw new Error("This membership agreement has no supported USD contract currency; reconcile its commercial evidence before changing tiers.");
  }
  if (organizationCurrency !== contractCurrency || settingsCurrency !== contractCurrency) {
    throw new Error("Currency settings do not match this membership agreement; reconcile Organization and Store Settings before changing tiers.");
  }
  return contractCurrency;
}
function snapshotMembershipAgreement(tier, billingCycle, currencyCode, options = {}) {
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
    ...options.initialCreditLedger ? { creditLedgerPolicy: "monthly-grant-v1" } : {},
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

// features/keystone/lib/gym-hours.ts
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function parseClockMinute(value) {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) throw new Error("Hours need a supported time");
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) throw new Error("Hours have an invalid clock hour");
    hour = hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23 || !match[2]) throw new Error("Use HH:mm for 24-hour times");
  return hour * 60 + Number(match[2] || 0);
}
function range(open, close) {
  const start = parseClockMinute(open);
  const end = parseClockMinute(close);
  if (start === end) throw new Error("Equal opening and closing times are ambiguous");
  return { start, end };
}
function parseDayHours(value) {
  try {
    if (typeof value === "string") {
      const text45 = value.trim().toLowerCase();
      if (!text45) return null;
      if (text45 === "closed") return "closed";
      if (text45 === "24/7" || text45 === "24 hours" || text45 === "open 24 hours") return "all";
      return text45.split(/\s*[,;]\s*/).filter(Boolean).map((part) => {
        const [open, close, extra] = part.split(/\s*[-–—]\s*/);
        if (!open || !close || extra !== void 0) throw new Error("Hours need one opening and closing time");
        return range(open, close);
      });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const day = value;
      if (day.enabled === false) return "closed";
      if (day.allDay === true) return "all";
      if (!Array.isArray(day.ranges) || !day.ranges.length) return null;
      const ranges = day.ranges.map((entry) => {
        if (typeof entry?.open !== "string" || typeof entry?.close !== "string") throw new Error("Hours need opening and closing times");
        return range(entry.open, entry.close);
      });
      if (ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === 23 * 60 + 59) return "all";
      return ranges;
    }
  } catch {
    return null;
  }
  return null;
}
var clock = (minute2) => `${String(Math.floor(minute2 / 60) % 24).padStart(2, "0")}:${String(minute2 % 60).padStart(2, "0")}`;
function editorWeeklyHours(hours) {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return {};
  return Object.fromEntries(Object.entries(hours).map(([day, value]) => {
    const parsed = parseDayHours(value);
    if (parsed === "closed") return [day, { enabled: false, ranges: [] }];
    if (parsed === "all") return [day, { enabled: true, allDay: true, ranges: [] }];
    if (parsed) return [day, { enabled: true, ranges: parsed.map((entry) => ({ open: clock(entry.start), close: clock(entry.end) })) }];
    return [day, value];
  }));
}
function isOpenAt(hours, day, minute2) {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) throw new Error("Facility operating hours are not configured; staff review is required");
  const daily = Object.fromEntries(Object.entries(hours).map(([key, value]) => [key.toLowerCase(), value]));
  const today = parseDayHours(daily[day]);
  if (!today) throw new Error(`Facility hours for ${day} are not configured; update Store Settings`);
  const previous = parseDayHours(daily[WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7]]);
  const todayOpen = today === "all" || today !== "closed" && today.some((entry) => entry.start < entry.end ? minute2 >= entry.start && minute2 < entry.end : minute2 >= entry.start);
  const overnightCarry = Array.isArray(previous) && previous.some((entry) => entry.start > entry.end && minute2 < entry.end);
  return todayOpen || overnightCarry;
}

// features/keystone/lib/membership-access-hours.ts
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
  const range2 = normalized.split(/\s*[-–—]\s*/);
  if (range2.length !== 2) throw new Error("Access hours need a supported time range; staff review is required");
  const start = minute(range2[0]);
  const end = minute(range2[1]);
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
  const clock2 = localClock(at, timezone);
  return isOpenAt(hours, clock2.day, clock2.minute);
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

// features/keystone/models/MembershipTier.ts
init_prisma_result();
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
  if (monthlyPriceId && Number.isFinite(monthlyPrice) && monthlyPrice <= 0) {
    args.addValidationError("A monthly price above zero is required to sell this plan online; set the price or remove the monthly Stripe Price ID");
  }
  if (annualPriceId && Number.isFinite(annualPrice) && annualPrice <= 0) {
    args.addValidationError("An annual price above zero is required to sell this plan online; set the price or remove the annual Stripe Price ID");
  }
  for (const [field, label, max] of [["guestPasses", "Guest passes", 1e3], ["personalTrainingSessions", "Included personal training sessions", 1e3], ["contractLength", "Contract length (months)", 120], ["maxClassBookings", "Maximum concurrent bookings", 1e3]]) {
    const current = value(field);
    if (current == null) continue;
    if (!Number.isInteger(current) || current < 0 || current > max) args.addValidationError(`${label} must be a whole number from 0 to ${max}`);
  }
  if (args.resolvedData.accessHours !== void 0 || args.resolvedData.accessHoursJson !== void 0) {
    try {
      membershipAccessWindow({ accessHours: value("accessHours"), accessHoursJson: value("accessHoursJson") });
    } catch {
      args.addValidationError("Access hours must be 24/7, Staffed hours, Limited (6:00 AM \u2013 10:00 PM), Closed, or one range such as 5:00 AM \u2013 11:00 PM");
    }
  }
  const features = value("features");
  if (features != null && (!Array.isArray(features) || features.length > 12 || features.some((item) => typeof item !== "string" || !item.trim() || item.length > 120))) {
    args.addValidationError("Plan features must be a list of up to 12 short lines (120 characters each)");
  }
}
var MembershipTier = (0, import_core5.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: {
    validateInput: validateMembershipTierInput,
    async validateDelete({ context, item, addValidationError }) {
      const prisma = guardKeystonePrismaResults(context.prisma);
      const [memberships, sessions] = await Promise.all([
        prisma.membership.count({ where: { tierId: item.id } }),
        prisma.paymentSession.count({ where: { membershipTierId: item.id } })
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
    // Derived from the display prices in resolveInput; never entered directly.
    monthlyPriceMinor: (0, import_fields6.integer)({ access: { create: import_access9.denyAll, update: import_access9.denyAll }, db: { isNullable: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" }, description: "Set automatically from Monthly price" } }),
    annualPriceMinor: (0, import_fields6.integer)({ access: { create: import_access9.denyAll, update: import_access9.denyAll }, db: { isNullable: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" }, description: "Set automatically from Annual price" } }),
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
        description: "Enforced at facility check-in: 24/7, Staffed hours, Limited (6:00 AM \u2013 10:00 PM), Closed, or one range such as 5:00 AM \u2013 11:00 PM"
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
    // Legacy display value: checkout sells the monthly and annual Stripe prices above, so this
    // field changes no billing and is kept only to preserve existing data.
    billingInterval: (0, import_fields6.select)({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" }
      ],
      defaultValue: "monthly",
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    features: (0, import_fields6.json)({
      defaultValue: [],
      ui: {
        description: 'Up to 12 short lines shown on the public plan card, e.g. ["Open gym access", "2 guest passes a month"]'
      }
    }),
    maxClassBookings: (0, import_fields6.integer)({
      defaultValue: 0,
      ui: {
        description: "Maximum number of concurrent class bookings allowed (0 = unlimited)"
      }
    }),
    // Not connected to admission or display (guest passes are the supported benefit); kept
    // only to preserve existing data.
    hasGuestPrivileges: (0, import_fields6.checkbox)({
      defaultValue: false,
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        listView: { fieldMode: "hidden" }
      }
    }),
    accessHoursJson: (0, import_fields6.json)({
      defaultValue: { type: "limited", hours: "6am-10pm" },
      ui: {
        description: "Access hours configuration (stored as JSON)"
      }
    }),
    paymentSessions: (0, import_fields6.relationship)({
      ref: "PaymentSession.membershipTier",
      many: true,
      access: { create: import_access9.denyAll, update: import_access9.denyAll },
      ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
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
      validation: {
        isRequired: true,
        match: {
          regex: /^stripe$/,
          explanation: "Gym production payments support only the registered Stripe adapter."
        }
      },
      ui: { description: "Registered production adapter key. Synthetic test adapters are never persisted." }
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
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([])(args);
      if (args.operation === "update" && args.resolvedData.isActive === false && args.item?.isActive) {
        const upcoming = await upcomingServicesAtLocation(args.context, args.item.organizationId, args.item.id);
        if (upcoming.classes || upcoming.appointments) {
          args.addValidationError(`Move or cancel the ${upcoming.classes} upcoming class sessions and ${upcoming.appointments} appointments at this location before closing it`);
        }
      }
    },
    async validateDelete({ item, context, addValidationError }) {
      const prisma = context.prisma;
      const [schedules, instances, appointments, checkIns] = await Promise.all([
        prisma.classSchedule.count({ where: { locationId: item.id } }),
        prisma.classInstance.count({ where: { locationId: item.id } }),
        prisma.trainerAppointment.count({ where: { locationId: item.id } }),
        prisma.checkIn.count({ where: { locationId: item.id } })
      ]);
      if (schedules || instances || appointments || checkIns) addValidationError("Locations with classes, appointments or visits keep their history: mark the location inactive instead of deleting it");
    }
  },
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

// features/platform/store-settings/lib/untitled-logo-registry.ts
var LOGO_ICONS = [
  {
    id: "3portals",
    name: "3Portals",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" fill="#8098f9"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#6172f3"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#444ce7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" opacity=".5"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" opacity=".7"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z"/></g></svg>`
  },
  {
    id: "45-degrees",
    name: "45 Degrees",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`
  },
  {
    id: "acme-corp",
    name: "Acme Corp",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "alphawave",
    name: "AlphaWave",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`
  },
  {
    id: "alt-shift",
    name: "Alt+Shift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2727-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2728-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`
  },
  {
    id: "biosynthesis",
    name: "Biosynthesis",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" fill="#a4bcfd"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" fill="#6172f3"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" fill="#a4bcfd"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" fill="#6172f3"/><g fill="#444ce7"><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/></g><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" fill="#6172f3"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" fill="#a4bcfd"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" opacity=".5"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" opacity=".7"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" opacity=".5"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" opacity=".7"/><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" opacity=".7"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" opacity=".5"/></g></svg>`
  },
  {
    id: "boltshift",
    name: "Boltshift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "buildingblocks",
    name: "BuildingBlocks",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "calescence",
    name: "Calescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#1570ef" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`
  },
  {
    id: "capsule",
    name: "Capsule",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="18" fill="#1570ef" r="14"/><circle cx="26" cy="30" fill="#53b1fd" r="14"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><circle cx="14" cy="18" opacity=".7" r="14"/><circle cx="26" cy="30" opacity=".7" r="14"/></g></svg>`
  },
  {
    id: "constellation",
    name: "Constellation",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`
  },
  {
    id: "codecraft",
    name: "Codecraft",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`
  },
  {
    id: "command-r",
    name: "Command+R",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" fill="#155eef"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" fill="#2e90fa"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" fill="#53b1fd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" opacity=".7"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" opacity=".7"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" opacity=".7"/></g></svg>`
  },
  {
    id: "contrast-ai",
    name: "ContrastAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "convergence",
    name: "Convergence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "core-os",
    name: "CoreOS",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "cubekit",
    name: "Cubekit",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" fill="#155eef" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" fill="#155eef" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" opacity=".5"/></g></svg>`
  },
  {
    id: "europa",
    name: "Europa",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`
  },
  {
    id: "feather-dev",
    name: "FeatherDev",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" fill="#53b1fd"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" fill="#2e90fa"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z" fill="#1570ef"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3831 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" fill="#53b1fd"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" fill="#2e90fa"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z" fill="#1570ef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" opacity=".5"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" opacity=".7"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3832 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" opacity=".5"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" opacity=".7"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z"/></g></svg>`
  },
  {
    id: "flora-fauna",
    name: "Flora&Fauna",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "focal-point",
    name: "FocalPoint",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13175 8.8884c-.3177-.2034-.62928-.4156-.9344-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613487-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13174 8.8884c-.31771-.2034-.62929-.4156-.93441-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613486-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#fff"/></svg>`
  },
  {
    id: "foresight",
    name: "Foresight",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#444ce7"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`
  },
  {
    id: "galileo",
    name: "Galileo",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" fill="#6172f3"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" opacity=".7"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z"/></g></svg>`
  },
  {
    id: "global-bank",
    name: "GlobalBank",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#fff"/></svg>`
  },
  {
    id: "hexsmith",
    name: "Hexsmith",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1014.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0021z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1013.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0022z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`
  },
  {
    id: "hourglass",
    name: "Hourglass",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 30 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 41.2222c0 1.5341 1.24365 2.7778 2.77778 2.7778h24.44442c1.5341 0 2.7778-1.2437 2.7778-2.7778v-7.2222c0-8.2843-6.7157-15-15-15-8.28427 0-15 6.7157-15 15z" fill="#1570ef"/><path d="m0 6.77778c0-1.53413 1.24365-2.77778 2.77778-2.77778h24.44442c1.5341 0 2.7778 1.24365 2.7778 2.77778v7.22222c0 8.2843-6.7157 15-15 15-8.28427 0-15-6.7157-15-15z" fill="#53b1fd" opacity=".5"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 30 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path opacity="0.7" d="M0 41.2222C0 42.7563 1.24365 44 2.77778 44H27.2222C28.7563 44 30 42.7563 30 41.2222V34C30 25.7157 23.2843 19 15 19C6.71573 19 0 25.7157 0 34V41.2222Z" fill="white"/><path opacity="0.7" d="M0 6.77778C0 5.24365 1.24365 4 2.77778 4H27.2222C28.7563 4 30 5.24365 30 6.77778V14C30 22.2843 23.2843 29 15 29C6.71573 29 0 22.2843 0 14V6.77778Z" fill="white"/></svg>`
  },
  {
    id: "kintsugi",
    name: "Kintsugi",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`
  },
  {
    id: "layers",
    name: "Layers",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6796c-2.80085.7505-4.462904-.9115-3.712306-3.7124z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6795c-2.80085.7506-4.462904-.9114-3.712306-3.7123z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`
  },
  {
    id: "lightspeed",
    name: "Lightspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`
  },
  {
    id: "luminescence",
    name: "Luminescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`
  },
  {
    id: "luminous",
    name: "Luminous",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".6"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".8"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".5"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".7"/></g></svg>`
  },
  {
    id: "pollinate",
    name: "Pollinate",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`
  },
  {
    id: "polymath",
    name: "Polymath",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#155eef" stroke-width="6"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#fff" stroke-width="6"/></svg>`
  },
  {
    id: "prometheus",
    name: "Prometheus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".7"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".75"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`
  },
  {
    id: "quantum",
    name: "Quantum",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`
  },
  {
    id: "quartz-ai",
    name: "QuartzAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "radius",
    name: "Radius",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`
  },
  {
    id: "railspeed",
    name: "Railspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`
  },
  {
    id: "refractional",
    name: "Refractional",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#444ce7"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#155eef"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#8098f9"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/></g></svg>`
  },
  {
    id: "renaissance",
    name: "Renaissance",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3248-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#1849a9" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3247-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "sisyphus",
    name: "Sisyphus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`
  },
  {
    id: "solaris-energy",
    name: "Solaris Energy",
    lightSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="#175CD3" stroke-width="4"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="white" stroke-width="4"/></svg>`
  }
];

// features/keystone/lib/storefront-branding.ts
var DEFAULT_STOREFRONT_HUE = 16;
var DEFAULT_GYM_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === "boltshift").lightSvg;
var DEFAULT_LIBRARY_LOGO_COLOR = "151";
var DEFAULT_GYM_LOGO_COLOR = "0";
function normalizeStorefrontHue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STOREFRONT_HUE;
  const rounded = Math.round(numeric);
  return (rounded % 360 + 360) % 360;
}
function isGymLogoColor(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Number(value.trim()));
}
function normalizeGymLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_GYM_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_GYM_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
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
    logoColor: (0, import_fields17.text)({
      defaultValue: DEFAULT_GYM_LOGO_COLOR,
      ui: { description: "Logo color as a hue rotation in degrees; the storefront accent follows it" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === void 0 ? value : normalizeGymLogoColor(value);
        },
        validate: ({ inputData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (submitted !== void 0 && !isGymLogoColor(submitted)) {
            addValidationError("Logo color must be a hue rotation in degrees");
          }
        }
      }
    }),
    brandHue: (0, import_fields17.integer)({
      defaultValue: DEFAULT_STOREFRONT_HUE,
      validation: { isRequired: true, min: 0, max: 359 },
      // Kept for existing tenants' data; the storefront accent now follows the logo color.
      ui: { description: "Legacy accent hue (no longer used; the accent follows the logo color)", itemView: { fieldMode: "read" } },
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
    // Owner-pasted participation terms. Saving changed text through Store Settings
    // publishes a new ParticipationPolicy version that members accept.
    participationTerms: (0, import_fields17.text)({
      defaultValue: "",
      ui: { displayMode: "textarea", description: "Participation waiver / terms shown at /waiver. Edit in Store Settings so a new version is published." }
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
init_prisma_result();
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
        const prisma = guardKeystonePrismaResults(args.context.prisma);
        const inheritedInstances = await prisma.classInstance.findMany({
          where: { classScheduleId: args.item.id, maxCapacity: null },
          select: { id: true }
        });
        const instanceIds = inheritedInstances.map((instance) => instance.id);
        if (instanceIds.length) {
          const counts = await prisma.classBooking.groupBy({
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
    // The class as booked (title, type, coach, site, times, credit terms), captured in the
    // reservation transaction so later catalog edits never rewrite booking history.
    serviceSnapshot: (0, import_fields27.json)({
      access: { create: import_access45.denyAll, update: import_access45.denyAll },
      ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" }, description: "Class details at the time of booking" }
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
var NonexistentLocalTimeError = class extends Error {
};
function exactLocalTimeToUtc(parts, timeZone) {
  const zone = normalizeTimeZone(timeZone);
  const second = parts.second ?? 0;
  const integers = [parts.year, parts.month, parts.day, parts.hour, parts.minute, second];
  if (!integers.every(Number.isInteger) || parts.month < 1 || parts.month > 12 || parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59 || second < 0 || second > 59) {
    throw new NonexistentLocalTimeError("Choose a valid date and time");
  }
  const localEpoch = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  const calendar = new Date(localEpoch);
  if (calendar.getUTCFullYear() !== parts.year || calendar.getUTCMonth() !== parts.month - 1 || calendar.getUTCDate() !== parts.day) {
    throw new NonexistentLocalTimeError("Choose a valid date and time");
  }
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => timeZoneOffsetMilliseconds(new Date(localEpoch + hours * 36e5), zone)));
  const matches = [...offsets].map((offset) => new Date(localEpoch - offset)).filter((candidate) => {
    const round = localDateParts(candidate, zone);
    return round.year === parts.year && round.month === parts.month && round.day === parts.day && round.hour === parts.hour && round.minute === parts.minute && round.second === second;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (!matches.length) throw new NonexistentLocalTimeError(`That time does not exist in ${zone} because of a daylight-saving change. Choose another time.`);
  return matches[0];
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
  try {
    return exactLocalTimeToUtc({
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour,
      minute: minute2,
      second: 0
    }, timeZone);
  } catch (error) {
    if (error instanceof NonexistentLocalTimeError) return null;
    throw error;
  }
}

// features/keystone/lib/participation-terms.ts
init_operational_policy();
var PARTICIPATION_TERMS_PATH = "/waiver";
var PARTICIPATION_TERMS_PLACEHOLDER = "Please replace this with your gym\u2019s terms of service.";
function isParticipationTermsPlaceholder(text45) {
  const normalize = (value) => value.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(text45) === normalize(PARTICIPATION_TERMS_PLACEHOLDER);
}
var PARTICIPATION_TERMS_MAX_LENGTH = 5e4;
async function publishParticipationTerms(tx, organizationId, text45, publishedBy) {
  await lockParticipationPolicy(tx, organizationId);
  const body = text45.trim();
  const enforce = Boolean(body) && !isParticipationTermsPlaceholder(body);
  const latest = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (latest && latest.documentReference === PARTICIPATION_TERMS_PATH && latest.documentText === body && latest.enforceWaiver === enforce) return latest;
  if (!latest && !body) return null;
  const published = await tx.participationPolicy.count({ where: { organizationId } });
  return tx.participationPolicy.create({
    data: {
      organizationId,
      version: `v${published + 1}`,
      documentReference: PARTICIPATION_TERMS_PATH,
      documentText: body,
      // The gym's own published terms must be accepted. Clearing them, or leaving the
      // onboarding placeholder, publishes a version with nothing to accept.
      enforceWaiver: enforce,
      adultOnly: latest?.adultOnly ?? false,
      healthPurpose: latest?.healthPurpose ?? "",
      retentionDays: latest?.retentionDays ?? 365,
      publishedBy
    }
  });
}
async function currentParticipationTerms(prisma, organizationId) {
  if (!organizationId) return null;
  const latest = await prisma.participationPolicy.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, version: true, documentText: true, enforceWaiver: true }
  });
  if (!latest?.documentText || isParticipationTermsPlaceholder(latest.documentText)) return null;
  return { policyId: latest.id, version: latest.version, text: latest.documentText, acceptanceRequired: Boolean(latest.enforceWaiver) };
}
async function participationPolicyForEditor(prisma, organizationId) {
  const latest = await prisma.participationPolicy.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, version: true, documentReference: true, documentText: true, enforceWaiver: true, adultOnly: true, healthPurpose: true, retentionDays: true, createdAt: true }
  });
  if (!latest) return null;
  return {
    policyId: latest.id,
    version: latest.version,
    source: latest.documentReference === PARTICIPATION_TERMS_PATH ? "pasted" : "document",
    documentReference: latest.documentReference,
    text: latest.documentText || "",
    placeholder: isParticipationTermsPlaceholder(String(latest.documentText || "")),
    acceptanceRequired: Boolean(latest.enforceWaiver),
    adultOnly: Boolean(latest.adultOnly),
    healthPurpose: latest.healthPurpose || "",
    retentionDays: latest.retentionDays,
    publishedAt: latest.createdAt instanceof Date ? latest.createdAt.toISOString() : String(latest.createdAt)
  };
}

// features/keystone/mutations/gymSettingsLifecycle.ts
init_prisma_result();
init_operational_policy();
init_classCapacity();

// features/keystone/lib/gym-settings-content.ts
var SETTINGS_LIMITS = {
  contactTopics: { items: 12, title: 100, details: 12, detail: 300 },
  facilityHighlights: { items: 12, title: 200, description: 1e3, features: 20, feature: 100 },
  heroStats: { items: 6, value: 50, label: 100 },
  hoursJson: 1e4
};
var WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
var PUBLIC_CTA_PATHS = [
  /^\/$/,
  /^\/classes$/,
  /^\/classes\/[A-Za-z0-9_-]{1,64}$/,
  /^\/schedule$/,
  /^\/memberships$/,
  /^\/join$/,
  /^\/instructors$/,
  /^\/instructors\/[A-Za-z0-9_-]{1,64}$/,
  /^\/facilities$/,
  /^\/contact$/,
  /^\/policies$/,
  /^\/waiver$/,
  /^\/account$/
];
function publicCtaHref(value) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.includes("..") || /[\u0000-\u001f\u007f]/.test(href) || href.length > 500) return null;
  let url;
  try {
    url = new URL(href, "https://storefront.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://storefront.invalid") return null;
  return PUBLIC_CTA_PATHS.some((pattern) => pattern.test(url.pathname)) ? `${url.pathname}${url.search}${url.hash}` : null;
}
function text24(value, field, max, required = true) {
  if (value == null || value === "") {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return trimmed;
}
function list25(value, field, max) {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list`);
  if (value.length > max) throw new Error(`${field} allows at most ${max} entries`);
  return value;
}
function validateContactTopics(value) {
  const limits = SETTINGS_LIMITS.contactTopics;
  return list25(value, "Contact cards", limits.items).map((item, index) => {
    const label = `Contact card ${index + 1}`;
    const details = list25(item?.details, `${label} details`, limits.details).map((detail, line) => text24(detail, `${label} detail ${line + 1}`, limits.detail));
    if (!details.length) throw new Error(`${label} needs at least one detail`);
    return { title: text24(item?.title, `${label} title`, limits.title), details };
  });
}
function validateFacilityHighlights(value) {
  const limits = SETTINGS_LIMITS.facilityHighlights;
  return list25(value, "Facility highlights", limits.items).map((item, index) => {
    const label = `Facility highlight ${index + 1}`;
    return {
      title: text24(item?.title, `${label} title`, limits.title),
      description: text24(item?.description, `${label} description`, limits.description),
      features: list25(item?.features ?? [], `${label} features`, limits.features).map((feature, line) => text24(feature, `${label} feature ${line + 1}`, limits.feature))
    };
  });
}
function validateHeroStats(value) {
  const limits = SETTINGS_LIMITS.heroStats;
  return list25(value, "Hero stats", limits.items).map((item, index) => ({
    value: text24(item?.value, `Hero stat ${index + 1} value`, limits.value),
    label: text24(item?.label, `Hero stat ${index + 1} label`, limits.label)
  }));
}
function validateWeeklyHours(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Opening hours must list each day of the week");
  const source = value;
  const output = {};
  for (const day of WEEKDAY_KEYS) {
    const parsed = parseDayHours(source[day]);
    if (!parsed) throw new Error(`Opening hours for ${day[0].toUpperCase()}${day.slice(1)} are missing or unreadable; set closed, all day, or valid times`);
    output[day] = source[day];
  }
  if (JSON.stringify(output).length > SETTINGS_LIMITS.hoursJson) throw new Error("Opening hours are too long");
  return output;
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
var CTA_PAIRS = [["heroPrimaryCtaLabel", "heroPrimaryCtaHref", "Primary button"], ["heroSecondaryCtaLabel", "heroSecondaryCtaHref", "Secondary button"]];
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
function normalizeCtaHref(value, label) {
  if (typeof value !== "string" || !value.trim()) return "";
  const href = publicCtaHref(value);
  if (!href) throw new Error(`${label} link must open a public storefront page such as /join, /schedule or /contact`);
  return href;
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
    if (value !== "USD") throw new Error("Gym billing, retail and training currently support USD only");
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
  if ("logoColor" in input && input.logoColor != null) {
    if (!isGymLogoColor(input.logoColor)) throw new Error("logoColor must be a hue rotation in degrees");
    output.logoColor = normalizeGymLogoColor(input.logoColor);
  }
  if ("brandHue" in input && input.brandHue != null) {
    output.brandHue = normalizeStorefrontHue(input.brandHue);
  }
  for (const [labelField, hrefField, label] of CTA_PAIRS) {
    if (hrefField in input && input[hrefField] != null) output[hrefField] = normalizeCtaHref(input[hrefField], label);
  }
  if ("hours" in input && input.hours != null) output.hours = validateWeeklyHours(input.hours);
  if ("contactTopics" in input && input.contactTopics != null) output.contactTopics = validateContactTopics(input.contactTopics);
  if ("facilityHighlights" in input && input.facilityHighlights != null) output.facilityHighlights = validateFacilityHighlights(input.facilityHighlights);
  if ("heroStats" in input && input.heroStats != null) output.heroStats = validateHeroStats(input.heroStats);
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
function settingsActor(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId || !(session.data?.role?.canManageOnboarding || session.data?.role?.canManageSettings)) {
    throw new Error("Store Settings management permission required");
  }
  return { userId: session.itemId, organizationId };
}
var EDITABLE_FIELDS = [
  "id",
  "name",
  "tagline",
  "logoIcon",
  "logoColor",
  "description",
  "address",
  "phone",
  "email",
  "currencyCode",
  "locale",
  "timezone",
  "countryCode",
  "hours",
  "heroEyebrow",
  "heroHeadline",
  "heroSubheadline",
  "heroImageUrl",
  "heroPrimaryCtaLabel",
  "heroPrimaryCtaHref",
  "heroSecondaryCtaLabel",
  "heroSecondaryCtaHref",
  "promoBanner",
  "footerTagline",
  "copyrightName",
  "facilityHeadline",
  "facilityDescription",
  "facilityHighlights",
  "heroStats",
  "contactTopics",
  "updatedAt"
];
async function gymSettingsEditor(_root, _args, context) {
  const actor2 = settingsActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const [settings, policy] = await Promise.all([
    prisma.gymSettings.findFirst({ where: { organizationId: actor2.organizationId }, orderBy: [{ createdAt: "asc" }], select: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, true])) }),
    participationPolicyForEditor(prisma, actor2.organizationId)
  ]);
  return {
    settings: settings ? { ...settings, updatedAt: settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt } : null,
    participationPolicy: policy
  };
}
async function upsertGymSettings(root, { data, expectedUpdatedAt }, context) {
  const actor2 = settingsActor(context);
  if (data && "participationTerms" in data) throw new Error("Participation terms are published separately; use Publish terms");
  const normalized = normalizeGymSettingsInput(data || {});
  for (const [labelField, hrefField, label] of CTA_PAIRS) {
    const labelValue = labelField in normalized ? normalized[labelField] : void 0;
    const hrefValue = hrefField in normalized ? normalized[hrefField] : void 0;
    if (labelValue === void 0 !== (hrefValue === void 0)) throw new Error(`${label} needs its label and link saved together`);
    if (labelValue !== void 0 && Boolean(labelValue) !== Boolean(hrefValue)) throw new Error(`${label} needs both a label and a link, or neither for the default button`);
  }
  const saved = await context.transaction(async (transactionContext) => {
    const tx = guardKeystonePrismaResults(transactionContext.prisma);
    await lockTransactionKey(tx, `gym-settings:${actor2.organizationId}`);
    const existing = await tx.gymSettings.findMany({ where: { organizationId: actor2.organizationId }, orderBy: [{ createdAt: "asc" }], take: 2, select: { id: true, updatedAt: true } });
    if (existing.length > 1) throw new Error("Store Settings singleton invariant is violated");
    if (existing[0] && expectedUpdatedAt && new Date(String(expectedUpdatedAt)).getTime() !== new Date(existing[0].updatedAt).getTime()) {
      throw new Error("Settings changed since you opened this page. Reload to see the latest values, then save your change again.");
    }
    if (!existing[0] && (!normalized.name || !normalized.heroImageUrl)) {
      throw new Error("Initial gym settings require a business name and canonical hero image");
    }
    return existing[0] ? transactionContext.sudo().db.GymSettings.updateOne({ where: { id: existing[0].id }, data: normalized }) : transactionContext.sudo().db.GymSettings.createOne({ data: { ...normalized, organization: { connect: { id: actor2.organizationId } } } });
  });
  return saved;
}
async function publishGymParticipationTerms(_root, { text: text45, expectedPolicyId }, context) {
  const actor2 = settingsActor(context);
  if (typeof text45 !== "string") throw new Error("Participation terms must be text");
  const body = text45.trim();
  if (body.length > PARTICIPATION_TERMS_MAX_LENGTH) throw new Error(`Participation terms must be ${PARTICIPATION_TERMS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer`);
  return publishTermsForOrganization(context, actor2.organizationId, actor2.userId, body, expectedPolicyId ?? null);
}
async function publishTermsForOrganization(context, organizationId, userId, body, expectedPolicyId) {
  return context.transaction(async (transactionContext) => {
    const tx = guardKeystonePrismaResults(transactionContext.prisma);
    await lockParticipationPolicy(tx, organizationId);
    const current = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (expectedPolicyId !== void 0 && (current?.id ?? null) !== expectedPolicyId) {
      throw new Error("The participation policy changed since you opened this page. Reload, review the current version, then publish again.");
    }
    const settings = await tx.gymSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { id: true } });
    if (settings) await tx.gymSettings.update({ where: { id: settings.id }, data: { participationTerms: body } });
    const policy = await publishParticipationTerms(tx, organizationId, body, userId);
    return participationPolicyForEditor(tx, organizationId).then((editor) => editor ?? (policy ? { policyId: policy.id } : null));
  });
}

// features/keystone/models/Instructor.ts
function certificationProblem(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 50) return "Certifications must be a list of up to 50 entries";
  for (const [index, entry] of value.entries()) {
    if (typeof entry === "string") {
      if (entry.length > 200) return `Certification ${index + 1} is too long`;
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return `Certification ${index + 1} must be text or a qualification object`;
    const item = entry;
    if (typeof item.name !== "string" || !item.name.trim()) return `Certification ${index + 1} needs a name`;
    if (item.required !== void 0 && typeof item.required !== "boolean") return `Certification ${index + 1}: required must be true or false`;
    for (const key of ["verifiedAt", "expiresAt"]) if (item[key] != null && !Number.isFinite(new Date(String(item[key])).getTime())) return `Certification ${index + 1}: ${key} must be a date`;
    if (item.required === true && (typeof item.evidenceReference !== "string" || !item.evidenceReference.trim() || !item.verifiedAt || !item.expiresAt)) return `Certification ${index + 1} is required, so it needs evidenceReference, verifiedAt and expiresAt`;
  }
  return null;
}
var Instructor = (0, import_core25.list)({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: {
    async validateInput(args) {
      await validateTenantOwnership([
        { field: "user", list: "user" }
      ])(args);
      const { resolvedData, addValidationError } = args;
      const linkedUserId = resolvedData.user?.connect?.id;
      if (args.operation === "create" && linkedUserId) {
        const linked = await args.context.sudo().query.User.findOne({ where: { id: linkedUserId }, query: "id role { isInstructor }" });
        if (!linked?.role?.isInstructor) addValidationError("Link the coach profile to an account with the instructor role");
      }
      const certifications = certificationProblem(resolvedData.certifications);
      if (resolvedData.certifications !== void 0 && certifications) addValidationError(certifications);
      if (args.operation === "update" && resolvedData.isActive === false && args.item?.isActive) {
        const upcoming = await upcomingServicesForInstructor(args.context, args.item.organizationId, args.item.id);
        if (upcoming.classes || upcoming.appointments) {
          addValidationError(`Reassign or cancel this coach's ${upcoming.classes} upcoming class sessions and ${upcoming.appointments} appointments before retiring them`);
        }
      }
      if (resolvedData.photo === void 0) return;
      try {
        resolvedData.photo = normalizeOnboardingMediaPath(resolvedData.photo);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    },
    async validateDelete({ item, context, addValidationError }) {
      const prisma = context.prisma;
      const [schedules, instances, appointments] = await Promise.all([
        prisma.classSchedule.count({ where: { instructorId: item.id } }),
        prisma.classInstance.count({ where: { instructorId: item.id } }),
        prisma.trainerAppointment.count({ where: { instructorId: item.id } })
      ]);
      if (schedules || instances || appointments) addValidationError("Coaches with classes or appointments keep their history: mark them inactive after reassigning upcoming work instead of deleting");
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
    // A scalar label: the shared dashboard core selects labels as scalars (`label: <field>`).
    labelField: "displayName"
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
      // Linked once at creation; placeholder coach accounts are claimed through Coach accounts.
      ui: {
        displayMode: "select",
        description: "The user account for this instructor",
        itemView: { fieldMode: "read" }
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
    // JSON array of certifications: descriptive strings, or structured entries that gate coaching
    certifications: (0, import_fields28.json)({
      defaultValue: [],
      ui: {
        description: 'Descriptive names ("ACE") or structured entries. An entry with "required": true needs name, evidenceReference, verifiedAt and expiresAt, and blocks coaching once expired or "revoked": true.'
      }
    }),
    photo: (0, import_fields28.text)({
      access: { create: permissions.canManageOnboarding, update: import_access47.denyAll },
      ui: {
        description: "Photo set during onboarding",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" }
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
init_prisma_result();
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
        const prisma = guardKeystonePrismaResults(args.context.prisma);
        const confirmed = await prisma.classBooking.count({
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
    // Who changed capacity/exclusivity/buffers/activity and why; written only by the controlled
    // resource service, never by generic edits (descriptive metadata stays editable).
    allocationHistory: (0, import_fields30.json)({
      defaultValue: [],
      access: { create: import_access51.denyAll, update: import_access51.denyAll },
      ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
    }),
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
    leaseToken: (0, import_fields33.text)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    // Starter records this run created or adopted, their seeded values, placeholder coach
    // accounts and the requested configuration: the provenance retries and claims rely on.
    manifest: (0, import_fields33.json)({ access: { read: import_access55.denyAll, create: import_access55.denyAll, update: import_access55.denyAll } }),
    ...trackingFields
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
    // Frozen request/provider identity lives with its refund attempt, not in diagnostics.
    reservation: (0, import_fields34.json)({ access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    lastError: (0, import_fields34.text)({ defaultValue: "", access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    requestedAt: (0, import_fields34.timestamp)({ access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    completedAt: (0, import_fields34.timestamp)({ access: { read: import_access56.denyAll, create: import_access56.denyAll, update: import_access56.denyAll } }),
    ...trackingFields
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
    completedAt: (0, import_fields35.timestamp)({ access: { read: import_access57.denyAll, create: import_access57.denyAll, update: import_access57.denyAll } }),
    ...trackingFields
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
    resetAt: (0, import_fields36.timestamp)({ access: { read: import_access58.denyAll, create: import_access58.denyAll, update: import_access58.denyAll } }),
    ...trackingFields
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
  // Snapshot of owner-pasted terms for this version; empty for external-document policies.
  documentText: (0, import_fields37.text)({ ui: { displayMode: "textarea" } }),
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
    kind: (0, import_fields41.select)({ options: ["issued", "reserved", "restored", "refunded", "refund_reserved", "refund_released"], validation: { isRequired: true } }),
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

// features/keystone/models/ContactMessage.ts
var import_core41 = require("@keystone-6/core");
var import_access71 = require("@keystone-6/core/access");
var import_fields44 = require("@keystone-6/core/fields");
var canManageMessages = (args) => canManageTenant(args, "canManageCommunications");
var readOnly = { create: import_access71.denyAll, update: import_access71.denyAll };
var ContactMessage = (0, import_core41.list)({
  access: {
    operation: { query: canManageMessages, create: import_access71.denyAll, update: canManageMessages, delete: canManageMessages },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter },
    item: { update: (args) => tenantItemAccess(args), delete: (args) => tenantItemAccess(args) }
  },
  ui: {
    labelField: "subject",
    listView: {
      initialColumns: ["subject", "email", "topic", "status", "createdAt"],
      initialSort: { field: "createdAt", direction: "DESC" }
    }
  },
  fields: {
    organization: (0, import_fields44.relationship)({
      ref: "Organization",
      access: readOnly,
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") }
    }),
    subject: (0, import_fields44.text)({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    reference: (0, import_fields44.text)({ access: readOnly, isIndexed: true, ui: { itemView: { fieldMode: "read" } } }),
    name: (0, import_fields44.text)({ access: readOnly, validation: { isRequired: true }, ui: { itemView: { fieldMode: "read" } } }),
    email: (0, import_fields44.text)({ access: readOnly, validation: { isRequired: true }, ui: { description: "Reply from the club's own email to this address, then set Status to Replied. Gym does not send replies.", itemView: { fieldMode: "read" } } }),
    phone: (0, import_fields44.text)({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    topic: (0, import_fields44.text)({ access: readOnly, ui: { itemView: { fieldMode: "read" } } }),
    message: (0, import_fields44.text)({ access: readOnly, validation: { isRequired: true }, ui: { displayMode: "textarea", itemView: { fieldMode: "read" } } }),
    sourcePath: (0, import_fields44.text)({ access: readOnly, ui: { description: "Storefront page the message was sent from", itemView: { fieldMode: "read" } } }),
    status: (0, import_fields44.select)({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In progress", value: "in_progress" },
        { label: "Replied", value: "replied" },
        { label: "Closed", value: "closed" }
      ],
      defaultValue: "new",
      validation: { isRequired: true },
      ui: { displayMode: "segmented-control", description: "Replied: staff answered by email, phone or in person. Account and sign-in requests are reset at the front desk after a photo ID check (Members \u2192 Set temporary password)." }
    }),
    staffNotes: (0, import_fields44.text)({ ui: { displayMode: "textarea", description: "Internal notes; never shown to the sender" } }),
    ...trackingFields
  }
});

// features/keystone/models/MemberImportRecord.ts
var import_core42 = require("@keystone-6/core");
var import_access72 = require("@keystone-6/core/access");
var import_fields45 = require("@keystone-6/core/fields");
var MemberImportRecord = (0, import_core42.list)({
  access: { operation: { query: permissions.canManagePeople, create: import_access72.denyAll, update: import_access72.denyAll, delete: import_access72.denyAll }, filter: { query: tenantFilter } },
  hooks: { validateInput: validateTenantOwnership([{ field: "member", list: "member" }]) },
  fields: {
    organization: (0, import_fields45.relationship)({ ref: "Organization", access: { update: import_access72.denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    key: (0, import_fields45.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    source: (0, import_fields45.text)({ validation: { isRequired: true } }),
    externalId: (0, import_fields45.text)({ validation: { isRequired: true } }),
    payloadHash: (0, import_fields45.text)({ validation: { isRequired: true } }),
    status: (0, import_fields45.select)({ options: ["processing", "completed", "failed"], defaultValue: "processing" }),
    member: (0, import_fields45.relationship)({ ref: "Member" }),
    lastError: (0, import_fields45.text)(),
    completedAt: (0, import_fields45.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/RetailModels.ts
var import_core43 = require("@keystone-6/core");
var import_access74 = require("@keystone-6/core/access");
var import_fields46 = require("@keystone-6/core/fields");
var access2 = { operation: { query: (args) => canManageTenant(args, "canManageRetail"), create: import_access74.denyAll, update: import_access74.denyAll, delete: import_access74.denyAll }, filter: { query: tenantFilter } };
var organization2 = () => (0, import_fields46.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } });
var location = () => (0, import_fields46.relationship)({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } });
var RetailItem = (0, import_core43.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, locationId, sku") },
  fields: { organization: organization2(), location: location(), sku: (0, import_fields46.text)({ validation: { isRequired: true } }), name: (0, import_fields46.text)({ validation: { isRequired: true } }), unitAmount: (0, import_fields46.integer)({ validation: { isRequired: true, min: 0 } }), currencyCode: (0, import_fields46.text)({ defaultValue: "USD" }), stockOnHand: (0, import_fields46.integer)({ defaultValue: 0, validation: { min: 0 } }), isActive: (0, import_fields46.checkbox)({ defaultValue: true }), ...trackingFields }
});
var RetailSale = (0, import_core43.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), requestKey: (0, import_fields46.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields46.text)({ validation: { isRequired: true } }), lines: (0, import_fields46.json)({ defaultValue: [] }), totalAmount: (0, import_fields46.integer)({ validation: { isRequired: true, min: 0 } }), currencyCode: (0, import_fields46.text)({ defaultValue: "USD" }), tender: (0, import_fields46.text)({ validation: { isRequired: true } }), paymentReference: (0, import_fields46.text)(), soldAt: (0, import_fields46.timestamp)({ validation: { isRequired: true } }), recordedBy: (0, import_fields46.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailReturn = (0, import_core43.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), sale: (0, import_fields46.relationship)({ ref: "RetailSale", db: { extendPrismaSchema: requiredRelationshipDb("sale") } }), requestKey: (0, import_fields46.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields46.text)({ validation: { isRequired: true } }), lines: (0, import_fields46.json)({ defaultValue: [] }), refundAmount: (0, import_fields46.integer)({ validation: { isRequired: true, min: 0 } }), refundReference: (0, import_fields46.text)(), tender: (0, import_fields46.text)({ validation: { isRequired: true } }), reason: (0, import_fields46.text)({ validation: { isRequired: true } }), returnedAt: (0, import_fields46.timestamp)({ validation: { isRequired: true } }), recordedBy: (0, import_fields46.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailStockEntry = (0, import_core43.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  fields: { organization: organization2(), location: location(), item: (0, import_fields46.relationship)({ ref: "RetailItem", db: { extendPrismaSchema: requiredRelationshipDb("item") } }), eventKey: (0, import_fields46.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields46.text)(), quantity: (0, import_fields46.integer)({ validation: { isRequired: true } }), balanceAfter: (0, import_fields46.integer)({ validation: { isRequired: true, min: 0 } }), reason: (0, import_fields46.text)({ validation: { isRequired: true } }), recordedBy: (0, import_fields46.relationship)({ ref: "User" }), ...trackingFields }
});
var RetailClose = (0, import_core43.list)({
  access: access2,
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization2(), location: location(), requestKey: (0, import_fields46.text)({ validation: { isRequired: true } }), requestHash: (0, import_fields46.text)({ validation: { isRequired: true } }), periodStart: (0, import_fields46.timestamp)({ validation: { isRequired: true } }), periodEnd: (0, import_fields46.timestamp)({ validation: { isRequired: true } }), openingAmount: (0, import_fields46.integer)({ validation: { min: 0 } }), expectedAmount: (0, import_fields46.integer)({ validation: { isRequired: true } }), countedAmount: (0, import_fields46.integer)({ validation: { isRequired: true, min: 0 } }), varianceAmount: (0, import_fields46.integer)({ validation: { isRequired: true } }), reason: (0, import_fields46.text)(), evidence: (0, import_fields46.json)({ defaultValue: {} }), recordedBy: (0, import_fields46.relationship)({ ref: "User" }), ...trackingFields }
});

// features/keystone/models/CounterPaymentAttempt.ts
var import_core44 = require("@keystone-6/core");
var import_access75 = require("@keystone-6/core/access");
var import_fields47 = require("@keystone-6/core/fields");
var CounterPaymentAttempt = (0, import_core44.list)({
  access: { operation: { query: import_access75.denyAll, create: import_access75.denyAll, update: import_access75.denyAll, delete: import_access75.denyAll } },
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: {
    organization: (0, import_fields47.relationship)({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    location: (0, import_fields47.relationship)({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } }),
    purpose: (0, import_fields47.select)({
      type: "string",
      options: [
        { label: "Retail sale", value: "retail_sale" },
        { label: "Training package sale", value: "training_sale" },
        { label: "Retail refund", value: "retail_refund" },
        { label: "Training package refund", value: "training_refund" },
        { label: "Unfulfilled payment refund", value: "exception_refund" }
      ],
      validation: { isRequired: true }
    }),
    requestKey: (0, import_fields47.text)({ validation: { isRequired: true } }),
    requestHash: (0, import_fields47.text)({ validation: { isRequired: true } }),
    status: (0, import_fields47.select)({
      type: "string",
      options: [
        { label: "Reserved", value: "reserved" },
        { label: "Awaiting card payment", value: "open" },
        { label: "Fulfilled", value: "fulfilled" },
        { label: "Paid, needs staff action", value: "exception" },
        { label: "Released", value: "released" },
        { label: "Refund in progress", value: "refund_pending" },
        { label: "Refunded", value: "refunded" },
        { label: "Refund failed", value: "refund_failed" }
      ],
      defaultValue: "reserved",
      validation: { isRequired: true }
    }),
    amount: (0, import_fields47.integer)({ validation: { isRequired: true, min: 0 } }),
    currencyCode: (0, import_fields47.text)({ defaultValue: "USD" }),
    // Accepted lines/terms, captured when the attempt is reserved and never re-derived.
    quote: (0, import_fields47.json)({ defaultValue: {} }),
    providerId: (0, import_fields47.text)({ defaultValue: "" }),
    providerKey: (0, import_fields47.text)({ defaultValue: "" }),
    providerCheckoutId: (0, import_fields47.text)({ defaultValue: "" }),
    providerPaymentId: (0, import_fields47.text)({ defaultValue: "" }),
    providerRefundId: (0, import_fields47.text)({ defaultValue: "" }),
    claimToken: (0, import_fields47.text)({ defaultValue: "" }),
    result: (0, import_fields47.json)({ defaultValue: {} }),
    lastError: (0, import_fields47.text)({ defaultValue: "" }),
    expiresAt: (0, import_fields47.timestamp)(),
    resolvedAt: (0, import_fields47.timestamp)(),
    recordedBy: (0, import_fields47.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  RetailItem,
  RetailSale,
  RetailReturn,
  RetailStockEntry,
  RetailClose,
  CounterPaymentAttempt,
  MemberImportRecord,
  TrainingPackage,
  TrainingCreditEntry,
  CoachingAssignment,
  TrainingLead,
  ContactMessage,
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
init_prisma_result();
async function getBillingStats(_root, _args, context) {
  if (!context.session?.data?.role?.canManageAllRecords) {
    throw new Error("Operator access required");
  }
  const organizationId = getTenantId(context.session);
  if (!organizationId) throw new Error("Organization context required");
  const now = /* @__PURE__ */ new Date();
  const prisma = guardKeystonePrismaResults(context.prisma);
  const [settings, organization3] = await Promise.all([
    prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, timezone: true }
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, defaultCurrency: true }
    })
  ]);
  const currencyCode = String(settings?.currencyCode || "USD").toUpperCase();
  if (currencyCode !== "USD" || String(organization3?.defaultCurrency || "USD").toUpperCase() !== currencyCode) {
    throw new Error("Billing currency settings do not match the supported USD contract; reconcile Organization and Store Settings before reporting.");
  }
  const receiptCurrencies = await prisma.membershipPayment.groupBy({ by: ["currencyCode"], where: { organizationId, status: { in: ["completed", "refunded"] } }, _count: { _all: true } });
  if (receiptCurrencies.some((row) => String(row.currencyCode || "").toUpperCase() !== currencyCode)) {
    throw new Error("Settled receipt currencies are outside the supported USD report scope; reconcile receipt history before reporting.");
  }
  const timeZone = resolveGymTimeZone(settings?.timezone, organization3?.timezone);
  const startOfMonth = zonedStartOfMonth(now, timeZone);
  const [
    activeSubscriptions,
    activeMemberships,
    pastDueMemberships,
    completedPayments,
    monthlyPayments
  ] = await Promise.all([
    prisma.subscription.count({ where: { organizationId, status: "active" } }),
    prisma.membership.count({ where: { organizationId, status: "active" } }),
    prisma.membership.count({ where: { organizationId, status: "past-due" } }),
    prisma.membershipPayment.aggregate({
      where: { organizationId, currencyCode, status: { in: ["completed", "refunded"] } },
      _sum: { amount: true, refundAmount: true }
    }),
    prisma.membershipPayment.aggregate({
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
var BILLING_QUEUE_PAGE = 20;
var BILLING_TIER_LIMIT = 500;
async function getBillingWorkspace(root, args, context) {
  if (!context.session?.data?.role?.canManageAllRecords) throw new Error("Operator access required");
  const organizationId = getTenantId(context.session);
  if (!organizationId) throw new Error("Organization context required");
  const tenant = { organization: { id: { equals: organizationId } } };
  const sudo = context.sudo();
  const q = typeof args?.q === "string" ? args.q.trim().slice(0, 100) : "";
  const offset = (value) => Number.isSafeInteger(value) ? Math.min(Math.max(0, value), 1e4) : 0;
  const person = (path) => q ? [{ OR: [
    path({ name: { contains: q, mode: "insensitive" } }),
    path({ email: { contains: q, mode: "insensitive" } })
  ] }] : [];
  const where = {
    plans: { AND: [tenant, { status: { in: ["active", "frozen", "past-due"] } }, ...person((match) => ({ member: match }))] },
    recovery: { AND: [tenant, { status: { equals: "past-due" } }, ...person((match) => ({ member: match }))] },
    refunds: { AND: [tenant, { status: { equals: "succeeded" } }, ...person((match) => ({ member: match }))] },
    failed: { AND: [tenant, { status: { equals: "failed" } }, ...person((match) => ({ membership: { member: match } }))] }
  };
  const skip = { plans: offset(args?.planSkip), recovery: offset(args?.recoverySkip), refunds: offset(args?.refundSkip), failed: offset(args?.failedSkip) };
  const [
    stats,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    tierCount,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
    planTotal,
    recoveryTotal,
    refundTotal,
    failedTotal
  ] = await Promise.all([
    getBillingStats(root, args, context),
    sudo.query.MembershipPayment.findMany({ where: tenant, take: 10, orderBy: [{ paymentDate: "desc" }], query: "id amount currencyCode refundAmount status paymentDate paymentType member { id name }" }),
    sudo.query.Subscription.findMany({ where: tenant, take: 10, orderBy: [{ startDate: "desc" }], query: "id status startDate member { id name } membershipTier { name }" }),
    sudo.query.Membership.findMany({ where: where.plans, skip: skip.plans, take: BILLING_QUEUE_PAGE, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], query: "id status billingCycle stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.MembershipTier.findMany({ where: tenant, take: BILLING_TIER_LIMIT, orderBy: [{ name: "asc" }, { id: "asc" }], query: "id name" }),
    sudo.query.MembershipTier.count({ where: tenant }),
    sudo.query.Membership.findMany({ where: where.recovery, skip: skip.recovery, take: BILLING_QUEUE_PAGE, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], query: "id status nextBillingDate stripeSubscriptionId tier { id name } member { id name email }" }),
    sudo.query.GymPayment.findMany({ where: where.refunds, skip: skip.refunds, take: BILLING_QUEUE_PAGE, orderBy: [{ paymentDate: "desc" }, { id: "asc" }], query: "id amount currencyCode refundAmount paymentDate receiptNumber description member { id name email }" }),
    sudo.query.MembershipPayment.findMany({ where: where.failed, skip: skip.failed, take: BILLING_QUEUE_PAGE, orderBy: [{ paymentDate: "desc" }, { id: "asc" }], query: "id amount currencyCode paymentDate description membership { id member { id name email } }" }),
    sudo.query.Membership.count({ where: where.plans }),
    sudo.query.Membership.count({ where: where.recovery }),
    sudo.query.GymPayment.count({ where: where.refunds }),
    sudo.query.MembershipPayment.count({ where: where.failed })
  ]);
  return {
    stats,
    timeZone: stats.timeZone,
    q,
    recentPayments,
    recentSubscriptions,
    managedMemberships,
    availableTiers,
    tiersTruncated: tierCount > BILLING_TIER_LIMIT,
    billingRecoveryMembers,
    refundablePayments,
    failedPayments,
    queues: {
      pageSize: BILLING_QUEUE_PAGE,
      plans: { total: planTotal, skip: skip.plans },
      recovery: { total: recoveryTotal, skip: skip.recovery },
      refunds: { total: refundTotal, skip: skip.refunds },
      failed: { total: failedTotal, skip: skip.failed }
    }
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
function generateQRSignature(memberId, organizationId, timestamp32) {
  const data = `${organizationId}:${memberId}:${timestamp32}`;
  return import_crypto.default.createHmac("sha256", qrSecret()).update(data).digest("hex");
}
function createQRCodeData(memberId, organizationId) {
  const timestamp32 = Date.now();
  const signature2 = generateQRSignature(memberId, organizationId, timestamp32);
  return { memberId, organizationId, timestamp: timestamp32, signature: signature2 };
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
init_prisma_result();
init_operational_policy();

// features/keystone/lib/password-proof.ts
async function verifyCurrentPassword(context, userId, password2) {
  if (typeof password2 !== "string" || !password2) throw new Error("Enter your current password");
  if (!await consumeAuthAttempt(context.prisma, `password-proof:${userId}`, 10, 15 * 60 * 1e3)) {
    throw new Error("Too many password attempts. Wait 15 minutes and try again");
  }
  const user = await context.sudo().query.User.findOne({ where: { id: userId }, query: "id email" });
  if (!user?.email) throw new Error("Account not found");
  const result = await context.sudo().graphql.raw({
    query: `mutation VerifyCurrentPassword($email: String!, $password: String!) {
      authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess { item { id } }
        ... on UserAuthenticationWithPasswordFailure { message }
      }
    }`,
    variables: { email: user.email, password: password2 }
  });
  if (result.errors?.length || result.data?.authenticateUserWithPassword?.item?.id !== userId) {
    throw new Error("Your current password is incorrect");
  }
}
async function changeMemberPassword(_root, { currentPassword, newPassword, confirmPassword }, context) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error("Authentication required");
  if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) throw new Error("Use a new password of 12 to 128 characters");
  if (newPassword !== confirmPassword) throw new Error("The new passwords don't match");
  await verifyCurrentPassword(context, userId, currentPassword);
  await context.sudo().db.User.updateOne({ where: { id: userId }, data: { password: newPassword } });
  return true;
}

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
      id name email phone dateOfBirth joinDate status updatedAt
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
    lastCheckIn: member.lastCheckIn ?? null,
    updatedAt: member.updatedAt ? new Date(member.updatedAt).toISOString() : null
  };
}
async function getMemberProfile(_root, _args, context) {
  return projectProfile(await profileForActor(context));
}
async function updateMemberProfile(_root, { data }, context) {
  const current = await profileForActor(context);
  const { userId, organizationId } = actor(context);
  const has = (key) => data[key] !== void 0 && data[key] !== null;
  const values = {};
  if (has("name")) values.name = String(data.name).trim();
  if (has("email")) values.email = String(data.email).trim().toLowerCase();
  if (has("phone")) values.phone = String(data.phone).trim();
  if (has("dateOfBirth")) values.dateOfBirth = String(data.dateOfBirth).trim();
  if (has("emergencyContactName")) values.emergencyContactName = String(data.emergencyContactName).trim();
  if (has("emergencyContactPhone")) values.emergencyContactPhone = String(data.emergencyContactPhone).trim();
  if (has("healthNotes")) values.healthNotes = normalizeHealthNotes(data.healthNotes);
  if (values.name !== void 0 && (!values.name || values.name.length > MAX_PROFILE_NAME_LENGTH)) throw new Error("Name is required and must be 120 characters or fewer");
  if (values.email !== void 0 && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) throw new Error("Enter a valid email address");
  if (values.phone !== void 0 && values.phone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Phone number is too long");
  if (values.dateOfBirth !== void 0 && values.dateOfBirth.length > MAX_PROFILE_DATE_LENGTH) throw new Error("Date of birth is too long");
  if (values.emergencyContactName !== void 0 && values.emergencyContactName.length > MAX_PROFILE_NAME_LENGTH) throw new Error("Emergency contact name is too long");
  if (values.emergencyContactPhone !== void 0 && values.emergencyContactPhone.length > MAX_PROFILE_PHONE_LENGTH) throw new Error("Emergency contact phone is too long");
  if (values.dateOfBirth) {
    const parsed = new Date(values.dateOfBirth);
    if (Number.isNaN(parsed.getTime()) || parsed > /* @__PURE__ */ new Date()) throw new Error("Date of birth must be a valid past date");
  }
  const emailChanged = values.email !== void 0 && values.email !== String(current.email || "").toLowerCase();
  if (emailChanged) await verifyCurrentPassword(context, userId, data.currentPassword);
  const expectedVersion = has("expectedUpdatedAt") ? new Date(String(data.expectedUpdatedAt)) : null;
  await context.transaction(async (transactionContext) => {
    const prisma = guardKeystonePrismaResults(transactionContext.prisma);
    await lockParticipationPolicy(prisma, organizationId);
    const member = await prisma.member.findFirst({ where: { id: current.id, userId, organizationId }, select: { id: true, updatedAt: true } });
    if (!member) throw new Error("Member profile not found");
    if (expectedVersion && (!Number.isFinite(expectedVersion.getTime()) || expectedVersion.getTime() !== new Date(member.updatedAt).getTime())) {
      throw new Error("Your profile changed since this page was opened. Reload it, then make your change again.");
    }
    const notes = values.healthNotes;
    if (notes && (notes.notes || notes.conditions?.length || notes.injuries?.length)) {
      const policy = await prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const consent = policy && await prisma.participationEvidence.findFirst({ where: {
        organizationId,
        memberId: member.id,
        policyId: policy.id,
        healthConsent: true,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: /* @__PURE__ */ new Date() } }]
      } });
      if (!consent) throw new Error("Review the studio policy and record health-data consent in Participation and privacy before saving optional health information");
    }
    const memberData = {};
    if (values.name !== void 0) memberData.name = values.name;
    if (values.email !== void 0) memberData.email = values.email;
    if (values.phone !== void 0) memberData.phone = values.phone || null;
    if (values.dateOfBirth !== void 0) memberData.dateOfBirth = values.dateOfBirth ? new Date(values.dateOfBirth) : null;
    if (values.emergencyContactName !== void 0) memberData.emergencyContactName = values.emergencyContactName;
    if (values.emergencyContactPhone !== void 0) memberData.emergencyContactPhone = values.emergencyContactPhone;
    if (values.healthNotes !== void 0) memberData.healthNotes = values.healthNotes;
    if (Object.keys(memberData).length) await prisma.member.update({ where: { id: member.id }, data: memberData });
    const userData = {};
    if (values.name !== void 0) userData.name = values.name;
    if (values.email !== void 0) userData.email = values.email;
    if (values.phone !== void 0) userData.phone = values.phone || "";
    if (Object.keys(userData).length) {
      await transactionContext.sudo().query.User.updateOne({ where: { id: userId }, data: userData, query: "id" });
    }
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

// features/keystone/lib/scheduling-time.ts
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
        id date endsAt isCancelled maxCapacity bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) location { id name } resource { id name }
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
        instancesCount
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
        id date endsAt isCancelled cancellationReason bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) maxCapacity location { id name } resource { id name }
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

// features/keystone/access/currentRoleActor.ts
async function currentRoleActor(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  const user = await context.query.User.findOne({
    where: { id: session.itemId },
    query: "id organization { id } role { id canManageAllRecords canManagePeople canManageCheckIns canManageFacilities isInstructor organization { id } }"
  });
  if (!user || user.organization?.id !== organizationId || user.role && user.role.organization?.id !== organizationId) {
    throw new Error("Actor organization mismatch");
  }
  const role = user.role;
  return {
    userId: session.itemId,
    organizationId,
    canManageAllRecords: Boolean(role?.canManageAllRecords),
    canManagePeople: Boolean(role?.canManagePeople),
    canManageCheckIns: Boolean(role?.canManageCheckIns),
    canManageFacilities: Boolean(role?.canManageFacilities),
    isInstructor: Boolean(role?.isInstructor)
  };
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
async function assertActiveInstructor(context, actor2) {
  if (!actor2.instructorOnly) return;
  const active = await context.sudo().query.Instructor.count({ where: { AND: [
    { organization: { id: { equals: actor2.organizationId } } },
    { user: { id: { equals: actor2.userId } } },
    { isActive: { equals: true } }
  ] } });
  if (!active) throw new Error("Roster access requires an active instructor profile");
}
function assignmentFilter(userId) {
  return { OR: [
    { instructor: { user: { id: { equals: userId } } } },
    { AND: [{ instructor: null }, { classSchedule: { instructor: { user: { id: { equals: userId } } } } }] }
  ] };
}
var ROSTER_GYM_SETTINGS_PROJECTION = "name address timezone";
var ROSTER_ORGANIZATION_PROJECTION = "name timezone";
var ROSTER_SESSION_PROJECTION = `
  id date maxCapacity isCancelled
  bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } })
  waitlistCount: bookingsCount(where: { status: { equals: "waitlist" } })
  location { id name address }
  classSchedule { id name maxCapacity startTime endTime instructor { user { name } } location { id name address } }
  instructor { user { name } }
`;
var ROSTER_DETAIL_PROJECTION = `
  id date maxCapacity isCancelled cancellationReason
  location { id name address }
  classSchedule { id name dayOfWeek startTime endTime maxCapacity instructor { id user { name email } } location { id name address } }
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
  const [settings, organizations] = await Promise.all([
    sudo.query.GymSettings.findMany({
      where: { organization: { id: { equals: organizationId } } },
      take: 1,
      query: ROSTER_GYM_SETTINGS_PROJECTION
    }),
    sudo.query.Organization.findMany({
      where: { id: { equals: organizationId } },
      take: 1,
      query: ROSTER_ORGANIZATION_PROJECTION
    })
  ]);
  const gym = settings[0];
  const organization3 = organizations[0];
  return { gymTimezone: resolveGymTimeZone(gym?.timezone, organization3?.timezone) };
}
function withEffectiveLocation(session) {
  const location2 = session.location || session.classSchedule?.location || null;
  return { ...session, effectiveLocation: location2 ? { id: location2.id, name: location2.name, address: location2.address || null } : null };
}
async function getInstructorAccount(_root, _args, context) {
  const current = await currentRoleActor(context);
  if (!current.isInstructor) throw new Error("Instructor access required");
  const actor2 = { userId: current.userId, organizationId: current.organizationId };
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
var ROSTER_PAGE_SIZE = 25;
var ROSTER_SCAN_LIMIT = 1e3;
var ROSTER_STATES = ["all", "upcoming", "full", "started", "cancelled"];
var ROSTER_SORTS = ["soonest", "latest", "fullest"];
function localDayBound(value, timeZone, endOfDay) {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  try {
    const start = exactLocalTimeToUtc({ year, month, day, hour: 0, minute: 0 }, timeZone);
    return endOfDay ? new Date(start.getTime() + 24 * 60 * 60 * 1e3) : start;
  } catch {
    const noon = exactLocalTimeToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone);
    return new Date(noon.getTime() + (endOfDay ? 12 : -12) * 60 * 60 * 1e3);
  }
}
function sessionCapacity(session) {
  return session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
}
async function getRosterSessions(_root, args, context) {
  const actor2 = rosterActor(context);
  await assertActiveInstructor(context, actor2);
  const presentation = await getRosterPresentation(context, actor2.organizationId);
  const timeZone = presentation.gymTimezone;
  const state = ROSTER_STATES.includes(args.state || "") ? args.state : "all";
  const sort = ROSTER_SORTS.includes(args.sort || "") ? args.sort : "soonest";
  const q = String(args.q || "").trim().slice(0, 100);
  const skip = Number.isSafeInteger(args.skip) ? Math.min(Math.max(0, args.skip), 1e4) : 0;
  const now = /* @__PURE__ */ new Date();
  const from = localDayBound(args.from, timeZone, false) || new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  const to = localDayBound(args.to, timeZone, true);
  if (to && to <= from) throw new Error("The end date must be on or after the start date");
  const text45 = (path) => path({ contains: q, mode: "insensitive" });
  const base = [
    { organization: { id: { equals: actor2.organizationId } } },
    { date: { gte: from.toISOString() } },
    ...to ? [{ date: { lt: to.toISOString() } }] : [],
    ...actor2.instructorOnly ? [assignmentFilter(actor2.userId)] : [],
    ...q ? [{ OR: [
      text45((match) => ({ classSchedule: { name: match } })),
      text45((match) => ({ instructor: { user: { name: match } } })),
      text45((match) => ({ AND: [{ instructor: null }, { classSchedule: { instructor: { user: { name: match } } } }] })),
      text45((match) => ({ location: { name: match } })),
      text45((match) => ({ AND: [{ location: null }, { classSchedule: { location: { name: match } } }] }))
    ] }] : []
  ];
  const nowIso = now.toISOString();
  const stateWhere = {
    all: [],
    cancelled: [{ isCancelled: { equals: true } }],
    started: [{ isCancelled: { equals: false } }, { date: { lte: nowIso } }],
    future: [{ isCancelled: { equals: false } }, { date: { gt: nowIso } }]
  };
  const sudo = context.sudo();
  const count = (extra) => sudo.query.ClassInstance.count({ where: { AND: [...base, ...extra] } });
  const [allCount, cancelledCount, startedCount, futureCount] = await Promise.all([
    count(stateWhere.all),
    count(stateWhere.cancelled),
    count(stateWhere.started),
    count(stateWhere.future)
  ]);
  const classify = state === "upcoming" || state === "full";
  const scanWhere = classify ? stateWhere.future : stateWhere[state];
  const scanned = classify || sort === "fullest";
  let sessions;
  let total;
  let scanLimited = false;
  let fullCount = null;
  if (scanned) {
    const rows = await sudo.query.ClassInstance.findMany({
      where: { AND: [...base, ...scanWhere] },
      orderBy: [{ date: sort === "latest" ? "desc" : "asc" }, { id: "asc" }],
      take: ROSTER_SCAN_LIMIT + 1,
      query: ROSTER_SESSION_PROJECTION
    });
    scanLimited = rows.length > ROSTER_SCAN_LIMIT;
    let matches = rows.slice(0, ROSTER_SCAN_LIMIT);
    const isFull = (session) => sessionCapacity(session) > 0 && (session.bookingsCount ?? 0) >= sessionCapacity(session);
    if (classify) {
      fullCount = matches.filter(isFull).length;
      matches = matches.filter((session) => state === "full" === isFull(session));
    }
    if (sort === "fullest") {
      const fill = (session) => (session.bookingsCount ?? 0) / Math.max(sessionCapacity(session), 1);
      matches = [...matches].sort((a, b) => fill(b) - fill(a) || String(a.date).localeCompare(String(b.date)));
    }
    total = matches.length;
    sessions = matches.slice(skip, skip + ROSTER_PAGE_SIZE);
  } else {
    total = state === "all" ? allCount : state === "cancelled" ? cancelledCount : startedCount;
    sessions = await sudo.query.ClassInstance.findMany({
      where: { AND: [...base, ...scanWhere] },
      orderBy: [{ date: sort === "latest" ? "desc" : "asc" }, { id: "asc" }],
      skip,
      take: ROSTER_PAGE_SIZE,
      query: ROSTER_SESSION_PROJECTION
    });
  }
  if (fullCount === null && futureCount <= ROSTER_SCAN_LIMIT) {
    const future = await sudo.query.ClassInstance.findMany({
      where: { AND: [...base, ...stateWhere.future] },
      take: ROSTER_SCAN_LIMIT,
      query: 'id maxCapacity bookingsCount: bookingsCount(where: { status: { equals: "confirmed" } }) classSchedule { maxCapacity }'
    });
    fullCount = future.filter((session) => sessionCapacity(session) > 0 && (session.bookingsCount ?? 0) >= sessionCapacity(session)).length;
  }
  return {
    sessions: sessions.map((session) => ({ ...withEffectiveLocation(session), ...presentation })),
    total,
    skip,
    pageSize: ROSTER_PAGE_SIZE,
    scanLimited,
    timeZone,
    window: { from: from.toISOString(), to: to?.toISOString() ?? null },
    counts: {
      all: allCount,
      cancelled: cancelledCount,
      started: startedCount,
      full: futureCount > ROSTER_SCAN_LIMIT ? null : fullCount,
      upcoming: futureCount > ROSTER_SCAN_LIMIT || fullCount === null ? null : futureCount - fullCount
    }
  };
}
async function getRosterDetail(_root, { classInstanceId }, context) {
  const actor2 = rosterActor(context);
  await assertActiveInstructor(context, actor2);
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
    ...withEffectiveLocation(instance),
    ...presentation,
    bookings: bookings.map((booking) => ({
      ...booking,
      attendance: attendanceByBookingId.get(booking.id) ?? null
    }))
  };
}

// features/keystone/access/currentCheckInActor.ts
async function currentCheckInActor(context) {
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords && !actor2.canManageFacilities && !actor2.canManageCheckIns) {
    throw new Error("Facility check-in management permission required");
  }
  return actor2;
}

// features/keystone/queries/checkIn.ts
init_membership_credits();
var OPEN_VISIT_PAGE = 25;
async function getFrontDeskWorkspace(_root, { query, visitQuery, visitLocationId, visitOrder, visitSkip }, context) {
  const actor2 = await currentCheckInActor(context);
  const organizationId = actor2.organizationId;
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
  const tenantWhere = { organization: { id: { equals: organizationId } } };
  const visitSearch = typeof visitQuery === "string" ? visitQuery.trim().slice(0, 100) : "";
  const visitSite = typeof visitLocationId === "string" && visitLocationId ? visitLocationId : null;
  const skip = Number.isSafeInteger(visitSkip) ? Math.min(Math.max(0, visitSkip), 1e4) : 0;
  const openWhere = { AND: [
    tenantWhere,
    { checkOutTime: { equals: null } },
    ...visitSearch ? [{ member: { name: { contains: visitSearch, mode: "insensitive" } } }] : [],
    ...visitSite ? [{ location: { id: { equals: visitSite } } }] : []
  ] };
  const sudo = context.sudo();
  const [members, checkIns, openVisitTotal, locations, gymSettings] = await Promise.all([
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
      where: openWhere,
      skip,
      take: OPEN_VISIT_PAGE,
      orderBy: [{ checkInTime: visitOrder === "oldest" ? "asc" : "desc" }, { id: "asc" }],
      query: "id checkInTime method membershipValidated member { name } location { id name }"
    }),
    sudo.query.CheckIn.count({ where: openWhere }),
    sudo.query.Location.findMany({
      where: { AND: [tenantWhere, { isActive: { equals: true } }] },
      take: 200,
      orderBy: [{ name: "asc" }],
      query: "id name"
    }),
    sudo.query.GymSettings.findMany({
      where: tenantWhere,
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
    openVisits: { total: openVisitTotal, skip, pageSize: OPEN_VISIT_PAGE },
    locations,
    gymSettings
  };
}

// features/keystone/queries/reports.ts
init_prisma_result();
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  const [settings, organization3] = await Promise.all([
    prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { currencyCode: true, timezone: true }
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, defaultCurrency: true }
    })
  ]);
  const timeZone = resolveGymTimeZone(settings?.timezone, organization3?.timezone);
  const reportCurrency = String(settings?.currencyCode || "USD").toUpperCase();
  if (reportCurrency !== "USD" || String(organization3?.defaultCurrency || "USD").toUpperCase() !== reportCurrency) {
    throw new Error("Report currency settings do not match the supported USD contract; reconcile Organization and Store Settings before reporting.");
  }
  const receiptCurrencies = await prisma.membershipPayment.groupBy({ by: ["currencyCode"], where: { organizationId, status: { in: ["completed", "refunded"] } }, _count: { _all: true } });
  if (receiptCurrencies.some((row) => String(row.currencyCode || "").toUpperCase() !== reportCurrency)) {
    throw new Error("Settled receipt currencies are outside the supported USD report scope; reconcile receipt history before reporting.");
  }
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
    prisma.member.count({ where: { organizationId, status: "active", user: { membership: {
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
    prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { lt: now }
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true }
    }),
    prisma.membershipPayment.aggregate({
      where: {
        organizationId,
        currencyCode: reportCurrency,
        status: { in: ["completed", "refunded"] },
        paymentDate: { gte: monthStart, lt: now }
      },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true }
    }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now } } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: true } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, lateArrival: true } }),
    prisma.attendanceRecord.count({ where: { organizationId, markedAt: { gte: attendanceWindowStart, lt: now }, attended: false } }),
    sudo.query.ClassInstance.findMany({
      where: { ...organizationWhere, date: { gte: now.toISOString() }, isCancelled: { equals: false } },
      take: 12,
      orderBy: [{ date: "asc" }],
      query: "id date maxCapacity classSchedule { id name maxCapacity instructor { user { name } } } instructor { user { name } } bookings { id status }"
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
      // A dated session without its own coach runs with its template's coach (same rule as rosters).
      instructorName: instance.instructor?.user?.name ?? instance.classSchedule?.instructor?.user?.name ?? "Instructor TBD",
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

// features/keystone/lib/stripe-environment-provider.ts
function environmentProviderWhere(requireNewCharges) {
  const organizationId = process.env.STOREFRONT_ORGANIZATION_ID;
  if (process.env.STRIPE_USE_ENVIRONMENT_PROVIDER !== "true" || requireNewCharges && process.env.STRIPE_ENABLED !== "true" || !organizationId || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return { isInstalled: { equals: true } };
  }
  return { OR: [
    { isInstalled: { equals: true } },
    { code: { equals: "pp_stripe" }, adapterKey: { equals: "stripe" }, organization: { id: { equals: organizationId } } }
  ] };
}
function installedPaymentProviderWhere() {
  return environmentProviderWhere(true);
}
function reconciliationPaymentProviderWhere() {
  return environmentProviderWhere(false);
}
function newPaymentChargesEnabled() {
  return process.env.STRIPE_ENABLED === "true";
}

// features/keystone/queries/publicGym.ts
init_prisma_result();
var DEFAULT_INSTANCE_WINDOW_DAYS = 14;
var MAX_INSTANCE_WINDOW_DAYS = 90;
var DEFAULT_LIST_LIMIT = 50;
var MAX_LIST_LIMIT = 100;
function documentToPlainText(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object") return null;
  const document4 = value.document;
  const text45 = document4?.flatMap((node) => node.children ?? []).map((child) => typeof child.text === "string" ? child.text : "").join(" ").replace(/\s+/g, " ").trim();
  return text45 || null;
}
function normalizePublicLimit(value) {
  if (!Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIST_LIMIT);
}
function publicSkip(value) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, 5e3) : 0;
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
  const text45 = value.trim();
  return text45 ? text45.slice(0, limit) : null;
}
function publicInternalHref(value) {
  return publicCtaHref(value);
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
      const text45 = publicText(detail, 300);
      return text45 ? [text45] : [];
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
      const text45 = publicText(feature, 100);
      return text45 ? [text45] : [];
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
    logoColor: normalizeGymLogoColor(settings.logoColor),
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
    features: Array.isArray(tier.features) ? tier.features.filter((item) => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item) => item.slice(0, 120)) : [],
    // A plan is purchasable only with a mapped price above zero (paid-only service).
    monthlyCheckoutAvailable: providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeMonthlyPriceId) && Number(tier.monthlyPrice) > 0,
    annualCheckoutAvailable: providerEnabled && Boolean(tier.stripeProductId) && Boolean(tier.stripeAnnualPriceId) && Number(tier.annualPrice) > 0
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
  const site = instance.location ?? instance.classSchedule?.location ?? null;
  return {
    id: instance.id,
    startsAt: instance.date,
    schedule: publicSchedule(instance.classSchedule),
    instructor: publicInstructor(instructor),
    location: site ? { id: site.id, name: publicText(site.name, 200) || "Location", address: publicText(site.address, 500) } : null,
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
        logoColor
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
  const projected = projectPublicGymSettings(settings, organization3?.timezone);
  if (!projected) return null;
  const participationTerms = await currentParticipationTerms(guardKeystonePrismaResults(context.prisma), organizationId);
  return { ...projected, participationTerms };
}
async function getPublicGymClassTypes(root, args, context) {
  const organizationId = await publicOrganizationId(context);
  const records = await publicContext(context).query.ClassType.findMany({
    where: publicTenantWhere(organizationId),
    take: normalizePublicLimit(args.limit),
    skip: publicSkip(args.skip),
    orderBy: [{ name: "asc" }, { id: "asc" }],
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
  const skip = Number.isInteger(args.skip) && args.skip > 0 ? Math.min(args.skip, 5e3) : 0;
  const filters = [];
  if (args.instructorId) filters.push({ OR: [
    { instructor: { id: { equals: args.instructorId } } },
    { AND: [{ instructor: null }, { classSchedule: { instructor: { id: { equals: args.instructorId } } } }] }
  ] });
  if (args.locationId) filters.push({ OR: [
    { location: { id: { equals: args.locationId } } },
    { AND: [{ location: null }, { classSchedule: { location: { id: { equals: args.locationId } } } }] }
  ] });
  const records = await publicContext(context).query.ClassInstance.findMany({
    where: publicTenantWhere(organizationId, {
      date: { gte: window.from, lte: window.to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...args.scheduleId ? { id: { equals: args.scheduleId } } : {},
        ...args.classTypeId ? { classType: { id: { equals: args.classTypeId } } } : {}
      },
      ...filters.length ? { AND: filters } : {}
    }),
    take: normalizePublicLimit(args.limit),
    skip,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    query: `
      id date maxCapacity
      location { id name address isActive }
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity
        location { id name address isActive }
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
      location { id name address isActive }
      instructor { id displayName bio { document } specialties certifications photo }
      classSchedule {
        id name description dayOfWeek startTime endTime maxCapacity isActive
        location { id name address isActive }
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
    skip: publicSkip(args.skip),
    orderBy: [{ id: "asc" }],
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
      AND: [{ code: { equals: "pp_stripe" } }, installedPaymentProviderWhere()]
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
    skip: publicSkip(args.skip),
    orderBy: [{ monthlyPrice: "asc" }, { id: "asc" }],
    query: `
      id name description { document } monthlyPrice annualPrice classCreditsPerMonth
      accessHours guestPasses personalTrainingSessions freezeAllowed contractLength
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId features
    `
  });
  return records.map((record) => publicMembershipTier(record, providerEnabled)).filter((tier) => !providerEnabled || tier.monthlyCheckoutAvailable || tier.annualCheckoutAvailable);
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
      stripeMonthlyPriceId stripeAnnualPriceId stripeProductId features
    `
  });
  const tier = publicMembershipTier(record, providerEnabled);
  return tier && (!providerEnabled || tier.monthlyCheckoutAvailable || tier.annualCheckoutAvailable) ? tier : null;
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
async function currentOperatorActor(context) {
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords) throw new Error("Operator access required");
  return actor2;
}
async function bookClass(root, args, context) {
  const actor2 = await currentRoleActor(context);
  const { classInstanceId, memberId } = args;
  const organizationId = actor2.organizationId;
  const result = await createCapacityControlledBooking(context.prisma, {
    classInstanceId,
    memberId,
    actorUserId: actor2.userId,
    actorOrganizationId: organizationId,
    actorCanManageAllRecords: actor2.canManageAllRecords,
    capacityMode: "waitlist"
  });
  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: "id status waitlistPosition bookedAt"
  });
  return { booking, creditsRemaining: result.creditsRemaining };
}
async function promoteFromWaitlist(root, args, context) {
  const actor2 = await currentOperatorActor(context);
  const organizationId = actor2.organizationId;
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
  stripe: () => Promise.resolve().then(() => (init_stripe_adapter(), stripe_adapter_exports))
};
async function getPaymentProviderAdapter(adapterKey) {
  const loadAdapter = paymentProviderAdapters[adapterKey];
  if (!loadAdapter) throw new Error(`Unsupported payment provider adapter: ${adapterKey}`);
  const loadedAdapter = await loadAdapter();
  return loadedAdapter.stripePaymentProviderAdapter;
}
async function getPaymentProviderAdapterForExecution(adapterKey) {
  if (adapterKey === "test") {
    throw new Error("Synthetic test adapters cannot be selected from persisted payment provider configuration.");
  }
  if (process.env.PAYMENT_TEST_MODE === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PAYMENT_TEST_MODE is prohibited in production.");
    }
    if (adapterKey === "stripe") {
      const { testPaymentProviderAdapter: testPaymentProviderAdapter2 } = await Promise.resolve().then(() => (init_test_adapter(), test_adapter_exports));
      return testPaymentProviderAdapter2;
    }
  }
  return getPaymentProviderAdapter(adapterKey);
}

// features/keystone/utils/paymentProviderAdapter.ts
var PROVIDER_QUERY = "id code adapterKey providerAccountId isInstalled organization { id }";
async function getPaymentProvider(context, providerCode, organizationId, purpose = "charge") {
  if (!organizationId) throw new Error("Payment provider organization is required.");
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      AND: [
        { code: { equals: providerCode } },
        purpose === "charge" ? installedPaymentProviderWhere() : reconciliationPaymentProviderWhere(),
        { organization: { id: { equals: organizationId } } }
      ]
    },
    take: 1,
    query: PROVIDER_QUERY
  });
  const provider = providers[0];
  if (!provider) throw new Error(`Payment provider ${providerCode} is not installed.`);
  if (purpose === "charge" && provider.adapterKey === "stripe" && !newPaymentChargesEnabled() && process.env.PAYMENT_TEST_MODE !== "true") {
    throw new Error("Card payments are turned off for this Gym deployment.");
  }
  return provider;
}
async function getAdapterForProvider(context, providerCode, organizationId, purpose = "charge") {
  const provider = await getPaymentProvider(context, providerCode, organizationId, purpose);
  const adapter = await getPaymentProviderAdapterForExecution(provider.adapterKey);
  return { provider, adapter };
}

// features/keystone/mutations/stripeSubscription.ts
init_prisma_result();
init_classCapacity();
init_membership_credits();

// features/keystone/mutations/membershipBillingAttempts.ts
var import_node_crypto4 = require("node:crypto");
init_membership_credits();
init_operational_notices();
init_classCapacity();
init_prisma_result();
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  const attempt = await prisma.membershipBillingAttempt.findUnique({
    where: uniqueAttemptWhere(scope),
    select: { requestHash: true, status: true }
  });
  assertMatchingEvidence(attempt, scope.requestHash);
  return attempt?.status === "completed";
}
async function adoptPendingMembershipBillingKey(context, rawScope) {
  const scope = normalizeScope(rawScope);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const pending = await prisma.membershipBillingAttempt.findFirst({
    where: { organizationId: scope.organizationId, membershipId: scope.membershipId, operation: scope.operation, requestHash: scope.requestHash, status: "processing" },
    select: { idempotencyKey: true }
  });
  return pending?.idempotencyKey ? { ...scope, idempotencyKey: pending.idempotencyKey } : scope;
}
async function claimMembershipBillingAttempt(context, rawScope, expectedMembership = {}) {
  const scope = normalizeScope(rawScope);
  const claimToken = (0, import_node_crypto4.randomUUID)();
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (transaction) => {
    await lockTransactionKey(transaction, `membership-billing:${scope.organizationId}:${scope.membershipId}`);
    const membership = await transaction.membership.findFirst({
      where: { id: scope.membershipId, organizationId: scope.organizationId },
      select: {
        id: true,
        memberId: true,
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
    if (scope.operation === "freeze") {
      const memberId = membership.memberId;
      if (typeof memberId !== "string" || memberId.length === 0) {
        throw new Error("Membership member not found");
      }
      const member = await transaction.member.findFirst({
        where: { organizationId: scope.organizationId, userId: memberId },
        select: { id: true }
      });
      if (member instanceof Error) throw member;
      if (!member?.id) throw new Error("Membership member not found");
      await lockTransactionKey(transaction, `member:${member.id}`);
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
    const unresolvedRemote = await transaction.membershipBillingAttempt.findFirst({
      where: { organizationId: scope.organizationId, membershipId: scope.membershipId, operation: { in: ["cancel", "freeze", "unfreeze", "tier-change"] }, status: "processing" },
      select: { id: true, operation: true }
    });
    if (unresolvedRemote instanceof Error) throw unresolvedRemote;
    if (unresolvedRemote && unresolvedRemote.id !== existing?.id) {
      const label = unresolvedRemote.operation === "tier-change" ? "plan change" : unresolvedRemote.operation === "unfreeze" ? "resume" : unresolvedRemote.operation;
      throw new Error(`A previous ${label} for this membership has not been confirmed yet. Retry that same ${label} first; nothing else can change until it is reconciled.`);
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
async function finishMembershipBillingAttempt(context, claim, membershipData, finalizeRelated) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const finalized = await prisma.$transaction(async (transaction) => {
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
    const updated = await transaction.membership.findFirst({ where: { id: claim.membershipId, organizationId: claim.organizationId } });
    if (!updated) throw new Error("Membership disappeared while finalizing billing operation");
    if (finalizeRelated) await finalizeRelated(transaction, updated);
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
async function failMembershipBillingAttempt(context, claim, error, providerOutcome = "definite") {
  const lastError = error instanceof Error ? error.message.slice(0, 2e3) : "Billing operation failed";
  const data = providerOutcome === "unknown" ? { lastError } : { status: "failed", leaseUntil: null, lastError };
  const prisma = guardKeystonePrismaResults(context.prisma);
  await prisma.membershipBillingAttempt.updateMany({
    where: {
      id: claim.attemptId,
      organizationId: claim.organizationId,
      membershipId: claim.membershipId,
      status: "processing",
      claimToken: claim.claimToken
    },
    data
  });
}

// features/keystone/mutations/stripeSubscription.ts
var PROVIDER_CODE = "pp_stripe";
function assertUserSessionAccess(actor2, userId) {
  if (actor2.userId === userId || actor2.canManageAllRecords) return;
  throw new Error("You cannot manage another member's billing");
}
async function getAuthorizedMembership(context, membershipId, currentActor) {
  const actor2 = currentActor ?? await currentRoleActor(context);
  const organizationId = actor2.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id agreementSnapshot agreementHistory organization { id defaultCurrency } stripeSubscriptionId billingCycle status autoRenew nextBillingDate creditPeriodStart creditPeriodEnd member { id stripeCustomerId organization { id } } tier { id freezeAllowed organization { id } }"
  });
  const membership = memberships[0];
  if (!membership || membership.organization?.id !== organizationId || membership.member?.organization?.id !== organizationId) {
    throw new Error("Membership not found");
  }
  assertUserSessionAccess(actor2, membership.member?.id);
  return { membership, actor: actor2 };
}
async function getAdapter(context, organizationId, purpose = "reconcile") {
  return getAdapterForProvider(context, PROVIDER_CODE, organizationId, purpose);
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
  const actor2 = await currentRoleActor(context);
  assertUserSessionAccess(actor2, userId);
  const organizationId = actor2.organizationId;
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }"
  });
  const user = users[0];
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");
  const { adapter } = await getAdapter(context, organizationId, "charge");
  const intent = await adapter.createSetupIntent(user.stripeCustomerId);
  if (!intent.clientSecret) throw new Error("Payment provider did not return a setup client secret");
  return { clientSecret: intent.clientSecret, setupIntentId: intent.id };
}
async function cancelMembership(root, { membershipId, reason, idempotencyKey }, context) {
  const { membership, actor: actor2 } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor2.organizationId;
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer");
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "cancel", idempotencyKey, { reason: normalizedReason }));
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
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    providerExecutionStarted = true;
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
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}
async function freezeMembership(root, { membershipId, endDate, idempotencyKey }, context) {
  const { membership, actor: actor2 } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor2.organizationId;
  const endsAt = new Date(endDate);
  if (Number.isNaN(endsAt.getTime())) throw new Error("Freeze end date must be in the future");
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "freeze", idempotencyKey, { endDate: endsAt.toISOString() }));
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
  let adapter;
  try {
    ({ adapter } = await getAdapter(context, organizationId));
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
  try {
    await adapter.pauseSubscription(membership.stripeSubscriptionId, endsAt, attempt.providerIdempotencyKey);
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, "unknown");
    throw error;
  }
  await finishMembershipBillingAttempt(context, attempt, { status: "frozen", freezeStartDate: startsAt, freezeEndDate: endsAt });
  return { membership: await currentMembership(context, membershipId), message: "Membership frozen immediately" };
}
async function unfreezeMembership(root, { membershipId, idempotencyKey }, context) {
  const { membership, actor: actor2 } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor2.organizationId;
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "unfreeze", idempotencyKey, {}));
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
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    providerExecutionStarted = true;
    const resumed = await adapter.resumeSubscription(membership.stripeSubscriptionId, attempt.providerIdempotencyKey);
    const paidPeriodActive = Boolean(membership.creditPeriodStart && membership.creditPeriodEnd && new Date(membership.creditPeriodStart) <= /* @__PURE__ */ new Date() && /* @__PURE__ */ new Date() < new Date(membership.creditPeriodEnd));
    await finishMembershipBillingAttempt(context, attempt, {
      status: paidPeriodActive && resumed.status !== "past_due" && resumed.status !== "unpaid" ? "active" : "past-due",
      freezeStartDate: null,
      freezeEndDate: null
    });
    return { membership: await currentMembership(context, membershipId), message: paidPeriodActive ? "Membership resumed successfully" : "Membership resumed; access returns when the next payment succeeds" };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}
async function changeMembershipTier(root, { membershipId, newTierId, idempotencyKey }, context) {
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords) throw new Error("Contact the front desk to change membership tiers");
  const { membership, actor: authorizedActor } = await getAuthorizedMembership(context, membershipId, actor2);
  const organizationId = authorizedActor.organizationId;
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "tier-change", idempotencyKey, { newTierId }));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Cannot change a ${membership.status} membership`);
  if (membership.tier?.id === newTierId) throw new Error("Membership is already on this tier");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot change tiers");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const settingsRows = await context.sudo().query.GymSettings.findMany({
    where: { organization: { id: { equals: organizationId } } },
    take: 2,
    query: "currencyCode"
  });
  if (settingsRows.length > 1) throw new Error("Gym currency settings are ambiguous; reconcile them before changing tiers.");
  const contractCurrency = membershipTierChangeCurrency(
    membership.agreementSnapshot,
    membership.organization.defaultCurrency,
    settingsRows[0]?.currencyCode
  );
  const newTiers = await context.sudo().query.MembershipTier.findMany({ where: { AND: [{ id: { equals: newTierId } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id name classCreditsPerMonth monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor freezeAllowed contractLength accessHours accessHoursJson guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }" });
  const newTier = newTiers[0];
  if (!newTier) throw new Error("New membership tier not found");
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) throw new Error("Stripe price not configured for this tier");
  const planAmount = membership.billingCycle === "monthly" ? newTier.monthlyPrice : newTier.annualPrice;
  if (!Number.isFinite(planAmount) || planAmount < 0) throw new Error("Membership tier has an invalid price");
  const newAgreementSnapshot = snapshotMembershipAgreement(newTier, membership.billingCycle, contractCurrency, {
    initialCreditLedger: membership.agreementSnapshot?.creditLedgerPolicy === "monthly-grant-v1"
  });
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId, "charge");
    await adapter.validateMembershipPrice({
      priceId: newPriceId,
      productId: newTier.stripeProductId,
      amount: tierAmountMinor(newTier, membership.billingCycle),
      currencyCode: contractCurrency,
      billingCycle: membership.billingCycle === "annual" ? "annual" : "monthly"
    });
    providerExecutionStarted = true;
    await adapter.changeSubscriptionPrice(
      membership.stripeSubscriptionId,
      newPriceId,
      { tierId: newTierId, billingCycle: membership.billingCycle },
      attempt.providerIdempotencyKey
    );
    await finishMembershipBillingAttempt(context, attempt, {
      tierId: newTierId,
      agreementSnapshot: newAgreementSnapshot,
      agreementHistory: [...Array.isArray(membership.agreementHistory) ? membership.agreementHistory : [], membership.agreementSnapshot]
    }, async (transaction, updatedMembership) => {
      const memberUpdate = await transaction.member.updateMany({
        where: { organizationId, userId: membership.member.id },
        data: { membershipTierId: newTierId }
      });
      if (memberUpdate.count !== 1) throw new Error("Membership owner projection changed while finalizing the tier change");
      await applyPlanAllowanceToCurrentGrant(transaction, updatedMembership, /* @__PURE__ */ new Date());
    });
    return { membership: await currentMembership(context, membershipId), message: "Plan changed. This month's class credits now match the new plan; Stripe adds the prorated difference to the next invoice." };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
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
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords) throw new Error("Payment recovery management permission required");
  const organizationId = actor2.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id recoveryHistory organization { id }"
  });
  const membership = memberships[0];
  if (!membership) throw new Error("Membership not found");
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `membership-recovery:${organizationId}:${membershipId}`);
    const current = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!current) throw new Error("Membership not found");
    return tx.membership.update({ where: { id: membershipId }, data: {
      recoveryHistory: [...Array.isArray(current.recoveryHistory) ? current.recoveryHistory : [], { contactedAt: (/* @__PURE__ */ new Date()).toISOString(), actorId: actor2.userId }]
    } });
  });
}
async function getStripeBillingPortal(root, { userId, returnUrl }, context) {
  const actor2 = await currentRoleActor(context);
  assertUserSessionAccess(actor2, userId);
  const organizationId = actor2.organizationId;
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
var import_node_crypto8 = __toESM(require("node:crypto"));

// features/integrations/payment/lifecycle.ts
var import_node_crypto5 = require("node:crypto");
function createMembershipCheckoutIdempotencyKey(input) {
  return `gym-membership:${(0, import_node_crypto5.createHash)("sha256").update(input.userId).digest("hex")}`;
}
function mapStripeStatusToMembership(status, collectionPaused = false) {
  if (collectionPaused) return "frozen";
  switch (status) {
    case "active":
      return "active";
    // This Gym checkout flow has no contracted free-trial entitlement. Stripe's
    // display status alone must not grant service or credits.
    case "trialing":
      return "past-due";
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
init_prisma_result();
init_classCapacity();
var PROVIDER_CODE2 = "pp_stripe";
var REUSABLE_SESSION_STATUSES = /* @__PURE__ */ new Set(["pending", "requires_action"]);
var CHECKOUT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1e3;
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
  const created = throwOnKeystonePrismaError(await ctx.query.Member.createOne({
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
  }), "Member.createOne");
  if (typeof created?.id !== "string" || !created.id) throw new Error("Member profile creation returned no identity");
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
      where: { AND: [{ code: { equals: PROVIDER_CODE2 } }, { adapterKey: { equals: "stripe" } }, installedPaymentProviderWhere()] },
      take: 2,
      query: "id providerAccountId organization { id }"
    });
    assertSingleMerchantCheckout(merchants, user.organization.id);
  }
  const amount = tierAmountMinor(tier, input.billingCycle);
  if (amount <= 0) throw new Error("This plan has no price for that billing cycle, so it can't be bought online. Contact the club.");
  const agreementSnapshot = snapshotMembershipAgreement(tier, input.billingCycle, currencyCode, { initialCreditLedger: true });
  const priceId = tierPriceId(tier, input.billingCycle);
  const idempotencyKey = createMembershipCheckoutIdempotencyKey({
    userId: user.id,
    tierId: tier.id,
    billingCycle: input.billingCycle
  });
  const organizationId = user.organization.id;
  const prisma = guardKeystonePrismaResults(input.context.prisma);
  const checkoutLeaseUntil = new Date(Date.now() + 10 * 60 * 1e3);
  const matchesRequest = (session) => session?.membershipTierId === tier.id && session?.billingCycle === input.billingCycle && session?.amount === amount && session?.currencyCode === currencyCode && session?.data?.priceId === priceId && session?.data?.productId === tier.stripeProductId;
  const reservation = await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${user.id}`);
    const [current, legacy] = await Promise.all([
      tx.membership.findFirst({ where: { organizationId, memberId: user.id, status: { in: ["active", "frozen", "past-due"] } }, select: { id: true } }),
      tx.subscription.findFirst({ where: { organizationId, member: { userId: user.id }, status: { in: ["active", "past_due", "paused"] } }, select: { id: true } })
    ]);
    if (current || legacy) throw new Error("This account already has a current membership. Contact the front desk for plan changes.");
    const now = /* @__PURE__ */ new Date();
    await tx.paymentSession.updateMany({
      where: { organizationId, userId: user.id, status: { in: [...REUSABLE_SESSION_STATUSES] }, expiresAt: { lte: now } },
      data: { status: "expired" }
    });
    const open = await tx.paymentSession.findMany({
      where: { organizationId, userId: user.id, status: { in: ["pending", "processing", "requires_action", "failed"] } },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
    const unresolved = open;
    for (const session of unresolved) {
      if (REUSABLE_SESSION_STATUSES.has(session.status)) continue;
      const age = now.getTime() - new Date(session.createdAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age > CHECKOUT_RECOVERY_MAX_AGE_MS) {
        throw new Error("This membership checkout is outside the safe automatic recovery window; reconcile its provider identity before retrying.");
      }
    }
    const conflicting = unresolved.find((session) => !matchesRequest(session));
    if (conflicting) {
      throw new Error(REUSABLE_SESSION_STATUSES.has(conflicting.status) ? "A different membership checkout is already in progress for this account." : "An unresolved checkout attempt is reserved for its original plan; retry that exact plan or reconcile it before starting another.");
    }
    const existingSession2 = unresolved[0] || null;
    if (Array.isArray(existingSession2?.data?.providerIdentityConflicts) && existingSession2.data.providerIdentityConflicts.length > 0) {
      throw new Error("Membership checkout has conflicting provider session identities; operator reconciliation is required before retry.");
    }
    if (existingSession2?.status === "processing" && existingSession2.provisioningLockedUntil && new Date(existingSession2.provisioningLockedUntil) > now) {
      throw new Error("Membership checkout is already being prepared for this account.");
    }
    if (existingSession2 && REUSABLE_SESSION_STATUSES.has(existingSession2.status) && existingSession2.checkoutUrl) {
      return { reuse: existingSession2 };
    }
    if (existingSession2) {
      const previousAttempt = Math.max(Number(existingSession2.data?.checkoutAttempt) || 0, 1);
      const providerIdempotencyKey4 = /:attempt:\d+$/.test(existingSession2.idempotencyKey) ? existingSession2.idempotencyKey : `${existingSession2.idempotencyKey}:attempt:${previousAttempt}`;
      const claimed = await tx.paymentSession.update({
        where: { id: existingSession2.id },
        data: { status: "processing", failedAt: null, provisioningLockedUntil: checkoutLeaseUntil, lastError: "" }
      });
      return { session: claimed, existingSession: existingSession2, reuseProviderAttempt: true, providerIdempotencyKey: providerIdempotencyKey4 };
    }
    const priorKeys = await tx.paymentSession.findMany({ where: { organizationId, idempotencyKey: { startsWith: idempotencyKey } }, select: { idempotencyKey: true }, take: 500 });
    const checkoutAttempt = priorKeys.reduce((max, row) => Math.max(max, Number(/:attempt:(\d+)$/.exec(row.idempotencyKey)?.[1] || 0)), 0) + 1;
    const providerIdempotencyKey3 = `${idempotencyKey}:attempt:${checkoutAttempt}`;
    const created = await tx.paymentSession.create({ data: {
      organizationId,
      userId: user.id,
      membershipTierId: tier.id,
      paymentProviderId: provider.id,
      status: "processing",
      provisioningLockedUntil: checkoutLeaseUntil,
      billingCycle: input.billingCycle,
      amount,
      currencyCode,
      idempotencyKey: providerIdempotencyKey3,
      data: { checkoutAttempt, priceId, productId: tier.stripeProductId, agreementSnapshot }
    } });
    return { session: created, existingSession: null, reuseProviderAttempt: false, providerIdempotencyKey: providerIdempotencyKey3 };
  });
  if ("reuse" in reservation) {
    return { id: reservation.reuse.id, status: reservation.reuse.status, checkoutUrl: reservation.reuse.checkoutUrl, reused: true };
  }
  const { existingSession, reuseProviderAttempt, providerIdempotencyKey: providerIdempotencyKey2 } = reservation;
  const paymentSession = { id: reservation.session.id };
  try {
    await adapter.validateMembershipPrice({
      priceId,
      productId: tier.stripeProductId,
      amount,
      currencyCode,
      billingCycle: input.billingCycle
    });
    await ensureMemberProfile(input.context, user);
  } catch (error) {
    await prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "processing" },
      data: { status: reuseProviderAttempt ? "failed" : "cancelled", provisioningLockedUntil: null, lastError: error instanceof Error ? error.message.slice(0, 1e3) : "Checkout could not be prepared" }
    });
    throw error;
  }
  let providerSession = null;
  let providerIdentityConflict = null;
  let canPersistProviderSession = false;
  try {
    providerSession = await adapter.createMembershipCheckout({
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
    if (typeof providerSession?.providerSessionId !== "string" || !providerSession.providerSessionId || typeof providerSession.providerCustomerId !== "string" || !providerSession.providerCustomerId || typeof providerSession.checkoutUrl !== "string" || !providerSession.checkoutUrl) {
      throw new Error("Payment provider did not return a valid membership checkout identity.");
    }
    canPersistProviderSession = true;
    if (reuseProviderAttempt && existingSession?.providerSessionId && existingSession.providerSessionId !== providerSession.providerSessionId) {
      providerIdentityConflict = providerSession.providerSessionId;
      throw new Error("Payment provider returned a different checkout session for the reserved attempt; operator reconciliation is required.");
    }
    if (!user.stripeCustomerId) {
      const updatedUser = throwOnKeystonePrismaError(await ctx.query.User.updateOne({
        where: { id: user.id },
        data: { stripeCustomerId: providerSession.providerCustomerId },
        query: "id"
      }), "User Stripe customer update");
      if (typeof updatedUser?.id !== "string") throw new Error("Stripe customer update returned no identity");
    }
    const finalized = await prisma.paymentSession.updateMany({
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
    requirePrismaAffectedCount(finalized, 1, "Membership checkout finalization");
    return {
      id: paymentSession.id,
      status: "requires_action",
      checkoutUrl: providerSession.checkoutUrl,
      reused: reuseProviderAttempt
    };
  } catch (error) {
    const unresolved = await prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "processing" },
      data: {
        status: "processing",
        failedAt: null,
        ...canPersistProviderSession && providerSession && !providerIdentityConflict ? {
          providerSessionId: providerSession.providerSessionId,
          providerCustomerId: providerSession.providerCustomerId,
          checkoutUrl: providerSession.checkoutUrl,
          expiresAt: providerSession.expiresAt ? new Date(providerSession.expiresAt) : null
        } : {},
        ...providerIdentityConflict ? {
          data: {
            ...existingSession?.data && typeof existingSession.data === "object" ? existingSession.data : {},
            providerIdentityConflicts: [.../* @__PURE__ */ new Set([
              ...Array.isArray(existingSession?.data?.providerIdentityConflicts) ? existingSession.data.providerIdentityConflicts.filter((id) => typeof id === "string") : [],
              providerIdentityConflict
            ])]
          }
        } : {},
        lastError: error instanceof Error ? error.message : "Payment provider checkout outcome requires reconciliation.",
        provisioningLockedUntil: null
      }
    });
    if (unresolved.count > 1) throw new Error("Membership checkout recovery fence affected multiple sessions");
    throw error;
  }
}

// features/integrations/payment/provision-membership.ts
init_classCapacity();
init_membership_credits();
init_prisma_result();
init_operational_notices();
async function provisionMembershipFromCheckoutSession(providerSessionId, expectedOrganizationId, context) {
  const ctx = context.sudo();
  const known = await ctx.query.PaymentSession.findMany({ where: { providerSessionId: { equals: providerSessionId } }, take: 2, query: "id organization { id }" });
  if (known.length > 1) throw new Error("Provider session is ambiguously assigned");
  const organizationId = expectedOrganizationId || known[0]?.organization?.id;
  if (!organizationId || known[0] && known[0].organization.id !== organizationId) throw new Error("Provider session organization does not match");
  const { provider, adapter } = await getAdapterForProvider(ctx, "pp_stripe", organizationId, "reconcile");
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
  const providerStatus = mapStripeStatusToMembership(subscription.status, Boolean(subscription.pause_collection));
  const initialEntitlementStatus = providerStatus === "cancelled" || providerStatus === "frozen" ? providerStatus : "past-due";
  const startDate = new Date(subscription.current_period_start * 1e3);
  const nextBillingDate = new Date(subscription.current_period_end * 1e3);
  if (!Number.isFinite(startDate.getTime()) || nextBillingDate <= startDate) throw new Error("Subscription service period is invalid");
  const prisma = guardKeystonePrismaResults(context.prisma);
  const membershipId = await prisma.$transaction(async (tx) => {
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
      status: initialEntitlementStatus,
      billingCycle,
      startDate,
      nextBillingDate,
      autoRenew: subscription.status !== "canceled" && !subscription.cancel_at_period_end,
      stripeSubscriptionId: subscriptionId,
      agreementSnapshot: !replacingEndedAgreement && existing?.agreementSnapshot?.version ? existing.agreementSnapshot : snapshot,
      creditPeriodStart: !replacingEndedAgreement && existing ? existing.creditPeriodStart : null,
      creditPeriodEnd: !replacingEndedAgreement && existing ? existing.creditPeriodEnd : null,
      ...existing && !replacingEndedAgreement ? {} : { classCreditsRemaining: 0, creditPeriodStart: null, creditPeriodEnd: null }
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
      status: providerStatus === "active" ? "active" : providerStatus === "frozen" ? "paused" : providerStatus === "past-due" ? "past_due" : "cancelled"
    } });
    if (session.payment_status === "no_payment_required") {
      await createFinanceException(tx, {
        organizationId,
        key: `unpaid-checkout:${session.id}`,
        kind: "unpaid-checkout",
        reference: session.id,
        summary: "A membership checkout completed without a payment. Service stays inactive until a paid invoice; review the subscription and the member's plan."
      });
    }
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

// features/keystone/mutations/paymentWebhook.ts
init_operational_notices();
init_membership_credits();
init_classCapacity();
init_prisma_result();

// features/keystone/lib/refund-reservation.ts
var import_node_crypto6 = __toESM(require("node:crypto"));
var REFUND_RESERVATION_PREFIX = "gym-refund-reservation:v1:";
function parseRefundReservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reservation = value;
  if (reservation.version !== 1 || typeof reservation.paymentId !== "string" || !reservation.paymentId || typeof reservation.providerId !== "string" || !reservation.providerId || typeof reservation.paymentIntentId !== "string" || !reservation.paymentIntentId || typeof reservation.requestKey !== "string" || !reservation.requestKey || typeof reservation.providerRequestKey !== "string" || !reservation.providerRequestKey || !Number.isSafeInteger(reservation.amount) || reservation.amount <= 0 || !Number.isSafeInteger(reservation.startingRefundAmount) || reservation.startingRefundAmount < 0 || reservation.currencyCode !== "USD" || typeof reservation.reason !== "string") return null;
  return reservation;
}
function readRefundReservation(attempt) {
  const reservation = parseRefundReservation(attempt?.reservation);
  if (reservation) {
    return { reservation, detail: typeof attempt.lastError === "string" ? attempt.lastError : "", source: "column" };
  }
  const legacy = decodeRefundReservation(attempt?.lastError);
  return legacy ? { ...legacy, source: "legacy" } : null;
}
function decodeRefundReservation(value) {
  if (typeof value !== "string" || !value.startsWith(REFUND_RESERVATION_PREFIX)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value.slice(REFUND_RESERVATION_PREFIX.length), "base64url").toString("utf8"));
    const reservation = parseRefundReservation(decoded?.reservation);
    if (!reservation) return null;
    return { reservation, detail: typeof decoded.detail === "string" ? decoded.detail : "" };
  } catch {
    return null;
  }
}
function assertSameRefundReservation(reservation, expected) {
  for (const key of Object.keys(expected)) {
    if (reservation[key] !== expected[key]) throw new Error("This refund idempotency key was already reserved with different payment, provider, amount, currency, or reason evidence");
  }
}
function providerRefundOperationKey(organizationId, paymentId, requestId) {
  const identity = import_node_crypto6.default.createHash("sha256").update(JSON.stringify([organizationId, paymentId, requestId])).digest("hex");
  return `gym-refund:${identity}`;
}
function providerRefundPaymentIntent(refund) {
  return typeof refund?.payment_intent === "string" ? refund.payment_intent : refund?.payment_intent?.id;
}
function assertExactProviderRefund(refund, reservation) {
  if (!refund || typeof refund.id !== "string" || !refund.id || providerRefundPaymentIntent(refund) !== reservation.paymentIntentId || refund.amount !== reservation.amount || String(refund.currency || "").toUpperCase() !== reservation.currencyCode || refund.metadata?.gymRefundOperationKey !== reservation.providerRequestKey || String(refund.metadata?.gymRefundCurrency || "").toUpperCase() !== reservation.currencyCode || String(refund.metadata?.gymRefundReason ?? "") !== reservation.reason) {
    throw new Error("Provider refund does not match the frozen payment, amount, currency, reason, and operation identity; operator reconciliation required");
  }
}
function reconcileProviderRefundCumulative(paymentAmount, currentRefundAmount, startingRefundAmount, attemptAmount) {
  const intendedCumulativeRefund = startingRefundAmount + attemptAmount;
  const totalRefunded = Math.max(currentRefundAmount ?? 0, intendedCumulativeRefund);
  if (![paymentAmount, currentRefundAmount ?? 0, startingRefundAmount, attemptAmount, totalRefunded].every(Number.isInteger) || startingRefundAmount < 0 || attemptAmount <= 0 || totalRefunded > paymentAmount) {
    throw new Error("Cumulative refund exceeds the payment total");
  }
  return totalRefunded;
}

// features/keystone/mutations/counterPayments.ts
init_classCapacity();
init_prisma_result();

// features/keystone/mutations/trainerAppointmentEvidence.ts
var import_node_crypto7 = require("node:crypto");
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
  return (0, import_node_crypto7.createHash)("sha256").update(JSON.stringify(stableValue(request))).digest("hex");
}
function assertTrainerAppointmentReplayMatches(existing, request) {
  if (existing.requestHash !== hashTrainerAppointmentRequest(request)) {
    throw new Error("Appointment idempotency key was already used with different details");
  }
}

// features/keystone/mutations/counterPayments.ts
init_operational_notices();

// features/keystone/lib/internal-origin.ts
function normalizeInternalOrigin(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Internal application URL must be an absolute HTTP(S) origin");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" && url.pathname !== "" || url.search || url.hash) {
    throw new Error("Internal application URL must be an HTTP(S) origin without credentials or a path");
  }
  return url.origin;
}
function resolvePublicBaseUrl() {
  const configured = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured?.trim()) throw new Error("Application base URL is not configured");
  return normalizeInternalOrigin(configured);
}
function publicAppUrl(path) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Return path must be a local path");
  const origin = resolvePublicBaseUrl();
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Return path must stay on the Gym origin");
  return url.toString();
}

// features/keystone/lib/counter-card-payment.ts
var COUNTER_SOURCE = "openfront-gym-counter";
var MINIMUM_CARD_AMOUNT = 50;
var COUNTER_CHECKOUT_MINUTES = 30;
async function counterAdapter(context, organizationId, purpose) {
  const { provider, adapter } = await getAdapterForProvider(context, "pp_stripe", organizationId, purpose);
  if (provider.adapterKey === "stripe" && process.env.PAYMENT_TEST_MODE !== "true") {
    const merchants = await context.sudo().query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: "pp_stripe" } }, { adapterKey: { equals: "stripe" } }, purpose === "charge" ? installedPaymentProviderWhere() : reconciliationPaymentProviderWhere()] },
      take: 2,
      query: "id providerAccountId organization { id }"
    });
    assertSingleMerchantCheckout(merchants, organizationId);
  }
  if (!adapter.createCounterCheckout || !adapter.retrieveCounterCheckout || !adapter.expireCounterCheckout || !adapter.findRefundPayment) {
    throw new Error("Card checkout is not available for this payment provider");
  }
  return { provider, adapter };
}
async function counterProviderId(context, organizationId) {
  return (await counterAdapter(context, organizationId, "charge")).provider.id;
}
async function createCounterProviderCheckout(context, organizationId, input) {
  if (!Number.isSafeInteger(input.amount) || input.amount < MINIMUM_CARD_AMOUNT) throw new Error("Card payments need a total of at least $0.50");
  const { adapter } = await counterAdapter(context, organizationId, "charge");
  const returnUrl = publicAppUrl(input.returnPath);
  const separator = returnUrl.includes("?") ? "&" : "?";
  const result = await adapter.createCounterCheckout({
    amount: input.amount,
    currencyCode: "USD",
    description: input.description.slice(0, 200),
    metadata: { source: COUNTER_SOURCE, kind: input.kind, organizationId, attemptId: input.attemptId, amount: String(input.amount), currencyCode: "USD" },
    // Stripe substitutes the literal {CHECKOUT_SESSION_ID} placeholder.
    successUrl: `${returnUrl}${separator}cardCheckout={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnUrl}${separator}cardAttempt=${encodeURIComponent(input.attemptId)}`,
    expiresAt: new Date(Date.now() + COUNTER_CHECKOUT_MINUTES * 6e4),
    idempotencyKey: input.providerKey
  });
  return result;
}
async function retrieveCounterProviderCheckout(context, organizationId, checkoutSessionId) {
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(checkoutSessionId)) throw new Error("Card checkout reference is invalid");
  const { adapter } = await counterAdapter(context, organizationId, "reconcile");
  return adapter.retrieveCounterCheckout(checkoutSessionId);
}
async function expireCounterProviderCheckout(context, organizationId, checkoutSessionId) {
  const { adapter } = await counterAdapter(context, organizationId, "reconcile");
  return adapter.expireCounterCheckout(checkoutSessionId);
}
function readCounterCheckout(session, expected) {
  const metadata = session?.metadata || {};
  if (session?.mode !== "payment" || metadata.source !== COUNTER_SOURCE || metadata.kind !== expected.kind || metadata.organizationId !== expected.organizationId || metadata.attemptId !== expected.attemptId) {
    throw new Error("Card checkout does not belong to this sale");
  }
  if (session.amount_total !== expected.amount || String(session.currency).toUpperCase() !== "USD") {
    throw new Error("Card payment amount does not match the reserved sale; operator reconciliation required");
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (session.status === "complete" && session.payment_status === "paid") {
    if (!paymentIntentId) throw new Error("Card payment reference is missing; check the payment provider");
    return { state: "paid", paymentIntentId };
  }
  if (session.status === "expired") return { state: "expired", paymentIntentId };
  return { state: "open", paymentIntentId };
}
function assertExactCounterRefund(refund, expected) {
  const paymentIntent = typeof refund?.payment_intent === "string" ? refund.payment_intent : refund?.payment_intent?.id;
  if (!refund?.id || paymentIntent !== expected.paymentIntentId || refund.amount !== expected.amount || String(refund.currency || "").toUpperCase() !== "USD" || refund.metadata?.gymRefundOperationKey !== expected.providerKey) {
    throw new Error("Provider refund does not match the reserved refund; operator reconciliation required");
  }
}
async function findOrCreateCounterRefund(context, organizationId, input) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) throw new Error("This sale has no card payment to refund");
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) throw new Error("Choose at least one paid unit to refund");
  const { adapter } = await counterAdapter(context, organizationId, "reconcile");
  const existing = await adapter.findRefundPayment(input.paymentIntentId, input.providerKey);
  const refund = existing || await adapter.refundPayment(input.paymentIntentId, input.amount, input.providerKey, {
    operationKey: input.providerKey,
    currencyCode: "USD",
    reason: input.reason.slice(0, 450)
  });
  assertExactCounterRefund(refund, input);
  return refund;
}

// features/keystone/security/tenant-status.ts
var import_graphql = require("graphql");
async function assertActiveOrganization(context, organizationId) {
  const organization3 = await context.sudo().query.Organization.findOne({ where: { id: organizationId }, query: "id status" });
  if (!organization3 || organization3.status !== "active") throw new Error("This organization is not accepting new activity");
}

// features/keystone/mutations/retailPolicy.ts
init_classCapacity();

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

// features/keystone/mutations/retailPolicy.ts
function assertRetailActor(actor2) {
  if (!actor2.userId || !actor2.organizationId || !actor2.canManageRetail) throw new Error("Retail management permission required");
}
function retailActorFromContext(context) {
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
  return site;
}
function retailSaleLockKey(saleId) {
  return `retail-sale:${saleId}`;
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
async function unavailableReturnUnits(tx, organizationId, saleId, excludeAttemptId) {
  const [returns, pending] = await Promise.all([
    tx.retailReturn.findMany({ where: { organizationId, saleId }, take: 1e3, select: { lines: true } }),
    tx.counterPaymentAttempt.findMany({
      where: { organizationId, purpose: "retail_refund", status: "refund_pending", quote: { path: ["saleId"], equals: saleId } },
      take: 1e3,
      select: { id: true, quote: true }
    })
  ]);
  if (returns.length >= 1e3 || pending.length >= 1e3) throw new Error("Return history requires reconciliation");
  const units = /* @__PURE__ */ new Map();
  const add = (lines) => {
    for (const line of Array.isArray(lines) ? lines : []) units.set(line.itemId, (units.get(line.itemId) || 0) + Number(line.quantity || 0));
  };
  for (const row of returns) add(row.lines);
  for (const row of pending) if (row.id !== excludeAttemptId) add(row.quote?.lines);
  return units;
}

// features/keystone/mutations/trainingPackages.ts
init_operational_notices();
init_prisma_result();
init_classCapacity();
function throwOnKeystonePrismaError2(result) {
  if (result instanceof Error) throw result;
  return result;
}
function settledPackageTerms(input, now) {
  const purchaseReference = trainingText(input.purchaseReference, "External settled payment reference", 200);
  const serviceName = trainingText(input.serviceName, "Service name", 200);
  const amount = trainingInteger(input.amount, "Paid amount in cents", 1, 1e8);
  const totalCredits = trainingInteger(input.totalCredits, "Credits", 1, 1e3);
  const durationMinutes = trainingInteger(input.durationMinutes, "Duration", 15, 480);
  const expiresAt = new Date(input.expiresAt), purchasedAt = new Date(input.purchasedAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || !Number.isFinite(purchasedAt.getTime()) || purchasedAt > now || expiresAt <= purchasedAt) throw new Error("Purchase/expiry dates are invalid");
  if (input.currencyCode !== "USD") throw new Error("Training package recording currently supports USD only");
  const terms = { serviceName, durationMinutes, totalCredits, amount, currencyCode: "USD", memberId: input.memberId, locationId: input.locationId, purchasedAt: purchasedAt.toISOString(), expiresAt: expiresAt.toISOString(), cancellationPolicy: "Cancel before the appointment starts to restore its original package credit; expired credits do not become current credits.", refundPolicy: input.cardPayment === true ? "Unused unreserved units only; refunded to the original card." : "Unused unreserved units only; external refund must already be settled and separately referenced.", ...input.cardPayment === true ? { tender: "card" } : {} };
  return { purchaseReference, serviceName, amount, totalCredits, durationMinutes, expiresAt, purchasedAt, terms };
}
async function settledPackageProblem(tx, input, organizationId, now = /* @__PURE__ */ new Date()) {
  try {
    settledPackageTerms(input, now);
  } catch (error) {
    return error instanceof Error ? error.message : "Package terms are invalid";
  }
  const member = await tx.member.findUnique({ where: { id: input.memberId } });
  const location2 = await tx.location.findUnique({ where: { id: input.locationId } });
  if (!member || member.organizationId !== organizationId || !location2 || location2.organizationId !== organizationId) return "Member or location no longer belongs to this organization";
  if (member.status !== "active") return "The member is no longer active";
  if (!location2.isActive) return "The location is no longer active";
  return null;
}
async function createSettledTrainingPackage(tx, input, recorder, now = /* @__PURE__ */ new Date()) {
  const { purchaseReference, serviceName, amount, totalCredits, durationMinutes, expiresAt, purchasedAt, terms } = settledPackageTerms(input, now);
  await lockTransactionKey(tx, `training-purchase:${recorder.organizationId}:${purchaseReference}`);
  const member = await tx.member.findUnique({ where: { id: input.memberId } });
  const location2 = await tx.location.findUnique({ where: { id: input.locationId } });
  assertTrainingTenant(member, recorder, "Member");
  assertTrainingTenant(location2, recorder, "Location");
  if (member.status !== "active" || !location2.isActive) throw new Error("Active member and location required");
  const existing = await tx.trainingPackage.findFirst({ where: { organizationId: recorder.organizationId, purchaseReference } });
  if (existing) {
    if (hashTrainerAppointmentRequest(existing.terms) !== hashTrainerAppointmentRequest(terms)) throw new Error("Payment reference already records a different package");
    return { id: existing.id, reused: true };
  }
  const pack = throwOnKeystonePrismaError2(await tx.trainingPackage.create({ data: { organizationId: recorder.organizationId, memberId: member.id, locationId: location2.id, serviceName, durationMinutes, totalCredits, creditsRemaining: totalCredits, amount, currencyCode: "USD", purchaseReference, purchasedAt, expiresAt, recordedById: recorder.userId || null, status: "active", terms } }));
  throwOnKeystonePrismaError2(await tx.trainingCreditEntry.create({ data: { organizationId: recorder.organizationId, trainingPackageId: pack.id, eventKey: `issued:${pack.id}`, kind: "issued", quantity: totalCredits, balanceAfter: totalCredits, actorId: recorder.userId || null, reason: purchaseReference } }));
  throwOnKeystonePrismaError2(await enqueueOperationalNotice(tx, { organizationId: recorder.organizationId, memberId: member.id, key: `training-package:${pack.id}`, kind: "training", message: `${totalCredits} ${serviceName} credits were recorded from your settled purchase. Review the service, expiry and cancellation terms in Account \u2192 Training.` }));
  return { id: pack.id, reused: false };
}
async function recordSettledTrainingPackage(prisma, input, actor2, now = /* @__PURE__ */ new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  if (input?.cardPayment === true) throw new Error("Card packages are recorded from their verified card checkout");
  settledPackageTerms(input, now);
  return prisma.$transaction((tx) => createSettledTrainingPackage(tx, { ...input, cardPayment: false }, actor2, now));
}
async function recordTrainingPackageRefund(prisma, input, actor2) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const reference = trainingText(input.refundReference, "External settled refund reference", 200);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `training-refund:${actor2.organizationId}:${reference}`);
    await lockTransactionKey(tx, `training-package:${input.packageId}`);
    const pack = await tx.trainingPackage.findUnique({ where: { id: input.packageId } });
    assertTrainingTenant(pack, actor2, "Training package");
    if (pack.terms?.tender === "card" && pack.status !== "refunded") throw new Error("Card packages are refunded to the original card from Training");
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
    throwOnKeystonePrismaError2(await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, eventKey: `refunded:${pack.id}`, kind: "refunded", quantity: -pack.creditsRemaining, balanceAfter: 0, actorId: actor2.userId, reason: reference } }));
    throwOnKeystonePrismaError2(await tx.trainingPackage.update({ where: { id: pack.id }, data: { status: "refunded", refundAmount: amount, refundReference: reference, refundedAt: /* @__PURE__ */ new Date(), creditsRemaining: 0 } }));
    throwOnKeystonePrismaError2(await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: pack.memberId, key: `training-package-refund:${pack.id}`, kind: "training", message: `The studio recorded an external ${pack.currencyCode} ${(amount / 100).toFixed(2)} refund for unused ${pack.serviceName} credits. The remaining package credits are retired.` }));
    return { id: pack.id, amount, reused: false };
  });
}
async function debitTrainingPackage(tx, pack, appointmentId, actor2) {
  tx = guardKeystonePrismaResults(tx);
  if (pack.creditsRemaining < 1) throw new Error("Package has no available credits");
  const balanceAfter = pack.creditsRemaining - 1;
  throwOnKeystonePrismaError2(await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } }));
  throwOnKeystonePrismaError2(await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, appointmentId, eventKey: `reserved:${appointmentId}`, kind: "reserved", quantity: -1, balanceAfter, actorId: actor2.userId } }));
}
async function restoreTrainingPackage(tx, appointment, actor2) {
  tx = guardKeystonePrismaResults(tx);
  if (!appointment.trainingPackageId) return;
  await lockTransactionKey(tx, `training-package:${appointment.trainingPackageId}`);
  const pack = await tx.trainingPackage.findUnique({ where: { id: appointment.trainingPackageId } });
  assertTrainingTenant(pack, actor2, "Training package");
  const debit = await tx.trainingCreditEntry.findFirst({ where: { organizationId: actor2.organizationId, eventKey: `reserved:${appointment.id}`, trainingPackageId: pack.id } });
  if (!debit) throw new Error("Appointment credit provenance is missing; operator review required");
  const balanceAfter = pack.creditsRemaining + 1;
  if (pack.status !== "active" || balanceAfter > pack.totalCredits) throw new Error("Package balance cannot be restored automatically");
  const restoration = await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, appointmentId: appointment.id, eventKey: `restored:${appointment.id}`, kind: "restored", quantity: 1, balanceAfter, actorId: actor2.userId } });
  if (restoration instanceof Error) throw restoration;
  const updatedPackage = await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } });
  if (updatedPackage instanceof Error) throw updatedPackage;
}

// features/keystone/mutations/counterPayments.ts
var OPEN_SALE_STATES = ["reserved", "open"];
var STALE_UNOPENED_MS = 25 * 60 * 60 * 1e3;
function kindOf(attempt) {
  if (attempt.purpose === "exception_refund") return attempt.quote?.kind === "training" ? "training" : "retail";
  return attempt.purpose === "training_sale" || attempt.purpose === "training_refund" ? "training" : "retail";
}
function workspacePath(kind) {
  return kind === "retail" ? "/dashboard/platform/retail" : "/dashboard/platform/training";
}
function describe(attempt) {
  if (attempt.purpose === "training_sale") {
    const terms = attempt.quote?.terms || {};
    return `${terms.serviceName || "Training package"} \xB7 ${terms.totalCredits || ""} sessions`;
  }
  return `Retail sale \xB7 ${(attempt.quote?.lines || []).length} item${(attempt.quote?.lines || []).length === 1 ? "" : "s"}`;
}
function counterAttemptView(attempt) {
  return {
    attemptId: attempt.id,
    purpose: attempt.purpose,
    status: attempt.status,
    amount: attempt.amount,
    currencyCode: attempt.currencyCode,
    checkoutUrl: attempt.status === "open" ? attempt.result?.checkoutUrl || null : null,
    result: attempt.result || {},
    lastError: attempt.lastError || ""
  };
}
async function noteAttemptError(context, attemptId, error) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const lastError = (error instanceof Error ? error.message : "Provider outcome requires reconciliation").slice(0, 1e3);
  await prisma.counterPaymentAttempt.updateMany({ where: { id: attemptId }, data: { lastError } });
}
async function findAttempt(context, organizationId, where) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const attempt = await prisma.counterPaymentAttempt.findFirst({ where: { organizationId, ...where } });
  if (!attempt) throw new Error("Card payment was not found for this workspace");
  return attempt;
}
async function startRetailCardSale(context, actor2, data) {
  const lines = requestLines(data?.lines).map(({ itemId, quantity }) => ({ itemId, quantity }));
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const locationId = trainingText(data?.locationId, "Location", 200);
  const reviewedTotal = data?.reviewedTotal == null || data.reviewedTotal === "" ? null : trainingInteger(data.reviewedTotal, "Reviewed total in cents", 0, 2e9);
  const requestHash = hashTrainerAppointmentRequest({ purpose: "retail_sale", locationId, lines });
  const providerId = await counterProviderId(context, actor2.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-request:${actor2.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This sale was already started with different items; start a new sale");
      return existing;
    }
    await siteLock(tx, actor2, locationId);
    const quoteLines = [];
    let amount = 0;
    for (const line of lines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      sameTenant(item, actor2, "Retail item");
      if (item.locationId !== locationId || !item.isActive || item.currencyCode !== "USD") throw new Error("Item is unavailable at this site/currency");
      if (item.stockOnHand < line.quantity) throw new Error(`Insufficient stock for ${item.sku}`);
      const lineAmount = item.unitAmount * line.quantity;
      amount += lineAmount;
      if (!Number.isSafeInteger(amount) || amount > 2e9) throw new Error("Sale amount exceeds supported bounds");
      quoteLines.push({ itemId: item.id, sku: item.sku, name: item.name, unitAmount: item.unitAmount, quantity: line.quantity, lineAmount, currencyCode: "USD", priceBasis: "operator-entered gross amount; tax accounting external" });
    }
    if (reviewedTotal !== null && reviewedTotal !== amount) throw new Error("Prices changed since this sale was reviewed. Review the new total before taking payment.");
    if (amount < MINIMUM_CARD_AMOUNT) throw new Error("Card payments need a total of at least $0.50");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor2.organizationId,
      locationId,
      purpose: "retail_sale",
      requestKey,
      requestHash,
      status: "reserved",
      amount,
      currencyCode: "USD",
      quote: { lines: quoteLines },
      providerId,
      recordedById: actor2.userId,
      expiresAt: new Date(Date.now() + (COUNTER_CHECKOUT_MINUTES + 5) * 6e4)
    } });
    for (const line of quoteLines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      const balanceAfter = item.stockOnHand - line.quantity;
      await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
      await tx.retailStockEntry.create({ data: { organizationId: actor2.organizationId, locationId, itemId: item.id, eventKey: `hold:${created.id}:${item.id}`, quantity: -line.quantity, balanceAfter, reason: `Held for card checkout ${created.id}`, recordedById: actor2.userId } });
    }
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-checkout:${actor2.organizationId}:${created.id}` } });
  });
  return openCounterCheckout(context, attempt);
}
async function startTrainingCardSale(context, actor2, data) {
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const terms = {
    memberId: trainingText(data?.memberId, "Member", 200),
    locationId: trainingText(data?.locationId, "Location", 200),
    serviceName: trainingText(data?.serviceName, "Service name", 200),
    totalCredits: trainingInteger(data?.totalCredits, "Credits", 1, 1e3),
    durationMinutes: trainingInteger(data?.durationMinutes, "Duration", 15, 480),
    expiresAt: new Date(data?.expiresAt).toISOString()
  };
  const amount = trainingInteger(data?.amount, "Package price in cents", MINIMUM_CARD_AMOUNT, 1e8);
  if (new Date(terms.expiresAt) <= /* @__PURE__ */ new Date()) throw new Error("Choose a package expiry in the future");
  const requestHash = hashTrainerAppointmentRequest({ purpose: "training_sale", amount, terms });
  const providerId = await counterProviderId(context, actor2.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-request:${actor2.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This package sale was already started with different terms; start a new sale");
      return existing;
    }
    const member = await tx.member.findUnique({ where: { id: terms.memberId } });
    const location2 = await tx.location.findUnique({ where: { id: terms.locationId } });
    assertTrainingTenant(member, actor2, "Member");
    assertTrainingTenant(location2, actor2, "Location");
    if (member.status !== "active" || !location2.isActive) throw new Error("Active member and location required");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor2.organizationId,
      locationId: location2.id,
      purpose: "training_sale",
      requestKey,
      requestHash,
      status: "reserved",
      amount,
      currencyCode: "USD",
      quote: { terms, memberName: member.name || "" },
      providerId,
      recordedById: actor2.userId,
      expiresAt: new Date(Date.now() + (COUNTER_CHECKOUT_MINUTES + 5) * 6e4)
    } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-checkout:${actor2.organizationId}:${created.id}` } });
  });
  return openCounterCheckout(context, attempt);
}
async function openCounterCheckout(context, attempt) {
  if (!OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
  const kind = kindOf(attempt);
  if (attempt.providerCheckoutId) return completeCounterCheckout(context, attempt.organizationId, { attemptId: attempt.id });
  let checkout;
  try {
    checkout = await createCounterProviderCheckout(context, attempt.organizationId, {
      attemptId: attempt.id,
      kind,
      amount: attempt.amount,
      description: describe(attempt),
      returnPath: workspacePath(kind),
      providerKey: attempt.providerKey
    });
  } catch (error) {
    await noteAttemptError(context, attempt.id, error);
    throw new Error("Card checkout could not be opened. The sale stays reserved: open it again or release it from Card payments.");
  }
  const prisma = guardKeystonePrismaResults(context.prisma);
  await prisma.counterPaymentAttempt.updateMany({
    where: { id: attempt.id, status: { in: OPEN_SALE_STATES } },
    data: {
      status: "open",
      providerCheckoutId: checkout.providerSessionId,
      result: { checkoutUrl: checkout.checkoutUrl },
      lastError: "",
      ...checkout.expiresAt ? { expiresAt: new Date(checkout.expiresAt) } : {}
    }
  });
  if (checkout.status !== "open") return completeCounterCheckout(context, attempt.organizationId, { attemptId: attempt.id });
  return { ...counterAttemptView({ ...attempt, status: "open", result: { checkoutUrl: checkout.checkoutUrl } }) };
}
async function completeCounterCheckout(context, organizationId, ref) {
  const attempt = ref.attemptId ? await findAttempt(context, organizationId, { id: ref.attemptId }) : await findAttempt(context, organizationId, { providerCheckoutId: String(ref.checkoutSessionId || "__none__") });
  if (!["retail_sale", "training_sale"].includes(attempt.purpose)) throw new Error("This is not a card sale");
  if (!OPEN_SALE_STATES.includes(attempt.status) && attempt.status !== "released") return counterAttemptView(attempt);
  if (!attempt.providerCheckoutId) return counterAttemptView(attempt);
  const session = await retrieveCounterProviderCheckout(context, organizationId, attempt.providerCheckoutId);
  const state = readCounterCheckout(session, { organizationId, kind: kindOf(attempt), attemptId: attempt.id, amount: attempt.amount });
  if (state.state === "paid") return fulfillPaidAttempt(context, attempt.id, state.paymentIntentId);
  if (state.state === "expired") return releaseHeldAttempt(context, attempt.id, "Card checkout expired before payment");
  return counterAttemptView({ ...attempt, result: { ...attempt.result || {}, checkoutUrl: session.url || attempt.result?.checkoutUrl } });
}
async function fulfillPaidAttempt(context, attemptId, paymentIntentId, retryException = false) {
  return withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new Error("Card payment was not found");
    if (attempt.status === "fulfilled" || attempt.status === "exception" && !retryException) return counterAttemptView(attempt);
    if (![...OPEN_SALE_STATES, "released", "exception"].includes(attempt.status)) return counterAttemptView(attempt);
    const organizationId = attempt.organizationId;
    const recorder = { userId: attempt.recordedById || "", organizationId };
    const now = /* @__PURE__ */ new Date();
    let problem = null;
    let result = {};
    const lines = Array.isArray(attempt.quote?.lines) ? attempt.quote.lines : [];
    let stockHeld = OPEN_SALE_STATES.includes(attempt.status);
    if (attempt.purpose === "retail_sale") {
      await siteLock(tx, { organizationId }, attempt.locationId, false);
      if (!stockHeld) {
        for (const line of lines) {
          const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
          if (!item || item.organizationId !== organizationId || item.stockOnHand < line.quantity) {
            problem = `Paid after its stock hold was released, and ${line.sku} no longer has ${line.quantity} in stock`;
            break;
          }
        }
        if (!problem) for (const line of lines) {
          const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
          const balanceAfter = item.stockOnHand - line.quantity;
          await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
          await tx.retailStockEntry.create({ data: { organizationId, locationId: attempt.locationId, itemId: item.id, eventKey: `hold-paid:${attempt.id}:${item.id}:${now.getTime()}`, quantity: -line.quantity, balanceAfter, reason: `Paid card checkout ${attempt.id}`, recordedById: recorder.userId || null } });
        }
        if (!problem) stockHeld = true;
      }
      if (!problem) {
        const duplicate = await tx.retailSale.findFirst({ where: { organizationId, paymentReference: paymentIntentId, tender: "card" } });
        if (duplicate) problem = "This card payment is already recorded on another sale";
      }
      if (!problem) {
        const sale = await tx.retailSale.create({ data: {
          organizationId,
          locationId: attempt.locationId,
          requestKey: `card:${attempt.id}`,
          requestHash: attempt.requestHash,
          lines,
          totalAmount: attempt.amount,
          currencyCode: "USD",
          tender: "card",
          paymentReference: paymentIntentId,
          soldAt: now,
          recordedById: recorder.userId || null
        } });
        result = { saleId: sale.id };
      }
    } else {
      const input = { ...attempt.quote?.terms, amount: attempt.amount, currencyCode: "USD", purchaseReference: paymentIntentId, purchasedAt: now.toISOString(), cardPayment: true };
      problem = await settledPackageProblem(tx, input, organizationId, now);
      if (!problem) result = { packageId: (await createSettledTrainingPackage(tx, input, recorder, now)).id };
    }
    if (problem) {
      if (attempt.purpose === "retail_sale" && stockHeld) {
        for (const line of lines) {
          const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
          if (!item) continue;
          const balanceAfter = item.stockOnHand + line.quantity;
          await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
          await tx.retailStockEntry.create({ data: { organizationId, locationId: attempt.locationId, itemId: item.id, eventKey: `exception-release:${attempt.id}:${item.id}:${now.getTime()}`, quantity: line.quantity, balanceAfter, reason: `Unfulfilled card checkout ${attempt.id}`, recordedById: recorder.userId || null } });
        }
      }
      const updated2 = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "exception", providerPaymentId: paymentIntentId, lastError: problem.slice(0, 1e3) } });
      await createFinanceException(tx, {
        organizationId,
        key: `counter:${attempt.id}`,
        kind: "counter-payment",
        reference: paymentIntentId,
        summary: `${problem}. Refund the card payment or retry fulfilment from Card payments (${attempt.id}).`
      });
      return counterAttemptView(updated2);
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "fulfilled", providerPaymentId: paymentIntentId, result, resolvedAt: now, lastError: "" } });
    return counterAttemptView(updated);
  });
}
async function releaseHeldAttempt(context, attemptId, reason) {
  return withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || !OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
    if (attempt.purpose === "retail_sale") {
      await siteLock(tx, { organizationId: attempt.organizationId }, attempt.locationId, false);
      for (const line of Array.isArray(attempt.quote?.lines) ? attempt.quote.lines : []) {
        const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const balanceAfter = item.stockOnHand + line.quantity;
        if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 1e8) throw new Error("Released stock exceeds supported balance");
        await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
        await tx.retailStockEntry.create({ data: { organizationId: attempt.organizationId, locationId: attempt.locationId, itemId: item.id, eventKey: `release:${attempt.id}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Released card checkout ${attempt.id}: ${reason}`.slice(0, 1e3), recordedById: attempt.recordedById || null } });
      }
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "released", resolvedAt: /* @__PURE__ */ new Date(), lastError: reason.slice(0, 1e3) } });
    return counterAttemptView(updated);
  });
}
async function cancelCounterCheckout(context, attempt) {
  if (!OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
  let sessionId = attempt.providerCheckoutId;
  if (!sessionId) {
    if (Date.now() - new Date(attempt.createdAt).getTime() > STALE_UNOPENED_MS) {
      return releaseHeldAttempt(context, attempt.id, "Released by staff; no checkout could still be payable");
    }
    const checkout = await createCounterProviderCheckout(context, attempt.organizationId, {
      attemptId: attempt.id,
      kind: kindOf(attempt),
      amount: attempt.amount,
      description: describe(attempt),
      returnPath: workspacePath(kindOf(attempt)),
      providerKey: attempt.providerKey
    });
    sessionId = checkout.providerSessionId;
    const prisma = guardKeystonePrismaResults(context.prisma);
    await prisma.counterPaymentAttempt.updateMany({ where: { id: attempt.id, status: { in: OPEN_SALE_STATES } }, data: { status: "open", providerCheckoutId: sessionId } });
  }
  const session = await expireCounterProviderCheckout(context, attempt.organizationId, sessionId);
  const state = readCounterCheckout(session, { organizationId: attempt.organizationId, kind: kindOf(attempt), attemptId: attempt.id, amount: attempt.amount });
  if (state.state === "paid") return fulfillPaidAttempt(context, attempt.id, state.paymentIntentId);
  if (state.state === "expired") return releaseHeldAttempt(context, attempt.id, "Cancelled by staff before payment");
  throw new Error("The card checkout is still open at the provider; try again in a moment");
}
async function startRetailCardRefund(context, actor2, data) {
  const saleId = trainingText(data?.saleId, "Sale", 200);
  const lines = requestLines(data?.lines);
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const reason = trainingText(data?.reason, "Return reason", 1e3);
  const requestHash = hashTrainerAppointmentRequest({ purpose: "retail_refund", saleId, lines, reason });
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-request:${actor2.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This return was already started with different units; start a new return");
      return existing;
    }
    await lockTransactionKey(tx, retailSaleLockKey(saleId));
    const sale = await tx.retailSale.findUnique({ where: { id: saleId } });
    sameTenant(sale, actor2, "Sale");
    if (sale.tender !== "card" || !sale.paymentReference) throw new Error("Only card sales refund to a card");
    const now = /* @__PURE__ */ new Date();
    if (await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const unavailable = await unavailableReturnUnits(tx, actor2.organizationId, sale.id);
    let amount = 0;
    const snapshot = [];
    for (const line of lines) {
      const sold = (sale.lines || []).find((row) => row.itemId === line.itemId);
      if (!sold) throw new Error("Returned item was not in this sale");
      if ((unavailable.get(line.itemId) || 0) + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
      const lineAmount = sold.unitAmount * line.quantity;
      amount += lineAmount;
      snapshot.push({ ...line, sku: sold.sku, name: sold.name, unitAmount: sold.unitAmount, lineAmount });
    }
    if (amount < 1) throw new Error("Choose at least one paid unit to refund");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor2.organizationId,
      locationId: sale.locationId,
      purpose: "retail_refund",
      requestKey,
      requestHash,
      status: "refund_pending",
      amount,
      currencyCode: "USD",
      quote: { saleId: sale.id, paymentIntentId: sale.paymentReference, lines: snapshot, reason },
      recordedById: actor2.userId
    } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${actor2.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, attempt);
}
async function startTrainingCardRefund(context, actor2, data) {
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const packageId = trainingText(data?.packageId, "Package", 200);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `training-package:${packageId}`);
    const pending = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor2.organizationId, purpose: "training_refund", status: "refund_pending", quote: { path: ["packageId"], equals: packageId } } });
    if (pending) return pending;
    const pack = await tx.trainingPackage.findUnique({ where: { id: packageId } });
    assertTrainingTenant(pack, actor2, "Training package");
    if (pack.terms?.tender !== "card" || !pack.purchaseReference) throw new Error("Only card-paid packages refund to a card");
    if (pack.status !== "active") throw new Error("This package is already refunded");
    const active = await tx.trainerAppointment.count({ where: { organizationId: actor2.organizationId, trainingPackageId: pack.id, status: { in: ["scheduled", "confirmed", "checked_in"] } } });
    if (active) throw new Error("Cancel or complete reserved appointments before refunding the package");
    const amount = unusedPackageRefundAmount(pack);
    if (amount < 1) throw new Error("This package has no unused paid credits to refund");
    const failures = await tx.counterPaymentAttempt.count({ where: { organizationId: actor2.organizationId, purpose: "training_refund", quote: { path: ["packageId"], equals: pack.id } } });
    const reason = `Unused ${pack.serviceName} credits`;
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor2.organizationId,
      locationId: pack.locationId,
      purpose: "training_refund",
      requestKey: `training-refund:${pack.id}:${failures}`,
      requestHash: hashTrainerAppointmentRequest({ purpose: "training_refund", packageId: pack.id, amount, credits: pack.creditsRemaining }),
      status: "refund_pending",
      amount,
      currencyCode: "USD",
      quote: { packageId: pack.id, paymentIntentId: pack.purchaseReference, credits: pack.creditsRemaining, reason },
      recordedById: actor2.userId
    } });
    await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: 0 } });
    await tx.trainingCreditEntry.create({ data: { organizationId: actor2.organizationId, trainingPackageId: pack.id, eventKey: `refund-reserved:${created.id}`, kind: "refund_reserved", quantity: -pack.creditsRemaining, balanceAfter: 0, actorId: actor2.userId, reason } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${actor2.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, attempt);
}
async function refundCounterException(context, attempt, actorUserId) {
  if (attempt.status !== "exception" || !attempt.providerPaymentId) throw new Error("Only a paid, unfulfilled checkout can be refunded here");
  const refund = await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-attempt:${attempt.id}`);
    const requestKey = `exception-refund:${attempt.id}`;
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: attempt.organizationId, requestKey } });
    if (existing) return existing;
    const current = await tx.counterPaymentAttempt.findUnique({ where: { id: attempt.id } });
    if (current.status !== "exception") throw new Error("This checkout is no longer awaiting staff action");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: attempt.organizationId,
      locationId: attempt.locationId,
      purpose: "exception_refund",
      requestKey,
      requestHash: hashTrainerAppointmentRequest({ purpose: "exception_refund", attemptId: attempt.id }),
      status: "refund_pending",
      amount: attempt.amount,
      currencyCode: "USD",
      quote: { attemptId: attempt.id, kind: kindOf(attempt), paymentIntentId: attempt.providerPaymentId, reason: "Paid counter sale could not be fulfilled" },
      recordedById: actorUserId
    } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${attempt.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, refund);
}
async function executeCounterRefund(context, attempt) {
  if (attempt.status !== "refund_pending") return counterAttemptView(attempt);
  let refund;
  try {
    refund = await findOrCreateCounterRefund(context, attempt.organizationId, {
      paymentIntentId: attempt.quote?.paymentIntentId,
      amount: attempt.amount,
      providerKey: attempt.providerKey,
      reason: attempt.quote?.reason || ""
    });
  } catch (error) {
    await noteAttemptError(context, attempt.id, error);
    throw new Error("The card refund isn't confirmed yet. The units stay reserved; use Check status in Card payments to finish it without refunding twice.");
  }
  return applyCounterRefundOutcome(context, attempt.id, refund);
}
async function applyCounterRefundOutcome(context, attemptId, refund) {
  return withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.status !== "refund_pending") return counterAttemptView(attempt);
    assertExactCounterRefund(refund, { paymentIntentId: attempt.quote?.paymentIntentId, amount: attempt.amount, providerKey: attempt.providerKey });
    const organizationId = attempt.organizationId;
    const now = /* @__PURE__ */ new Date();
    if (refund.status === "succeeded") {
      let result = {};
      if (attempt.purpose === "retail_refund") {
        const saleId = attempt.quote.saleId;
        await lockTransactionKey(tx, retailSaleLockKey(saleId));
        const sale = await tx.retailSale.findUnique({ where: { id: saleId } });
        await siteLock(tx, { organizationId }, sale.locationId, false);
        for (const line of attempt.quote.lines || []) {
          if (!line.restock) continue;
          const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
          if (!item || item.locationId !== sale.locationId) continue;
          const balanceAfter = item.stockOnHand + line.quantity;
          if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 1e8) throw new Error("Returned stock exceeds supported balance");
          await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
          await tx.retailStockEntry.create({ data: { organizationId, locationId: sale.locationId, itemId: item.id, eventKey: `return:card-refund:${attempt.id}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Return: ${attempt.quote.reason}`.slice(0, 1e3), recordedById: attempt.recordedById || null } });
        }
        const created = await tx.retailReturn.create({ data: {
          organizationId,
          locationId: sale.locationId,
          saleId: sale.id,
          requestKey: `card-refund:${attempt.id}`,
          requestHash: attempt.requestHash,
          lines: attempt.quote.lines,
          refundAmount: attempt.amount,
          refundReference: refund.id,
          tender: "card",
          reason: attempt.quote.reason,
          returnedAt: now,
          recordedById: attempt.recordedById || null
        } });
        result = { returnId: created.id };
      } else if (attempt.purpose === "training_refund") {
        const pack = await tx.trainingPackage.findUnique({ where: { id: attempt.quote.packageId } });
        await tx.trainingPackage.update({ where: { id: pack.id }, data: { status: "refunded", refundAmount: attempt.amount, refundReference: refund.id, refundedAt: now, creditsRemaining: 0 } });
        await enqueueOperationalNotice(tx, {
          organizationId,
          memberId: pack.memberId,
          key: `training-package-refund:${pack.id}`,
          kind: "training",
          message: `The studio refunded ${pack.currencyCode} ${(attempt.amount / 100).toFixed(2)} to your card for unused ${pack.serviceName} credits. The remaining package credits are retired.`
        });
        result = { packageId: pack.id };
      } else if (attempt.purpose === "exception_refund") {
        await tx.counterPaymentAttempt.updateMany({ where: { id: attempt.quote.attemptId, status: "exception" }, data: { status: "refunded", resolvedAt: now, result: { refundAttemptId: attempt.id } } });
        result = { attemptId: attempt.quote.attemptId };
      }
      const updated2 = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "refunded", providerRefundId: refund.id, result, resolvedAt: now, lastError: "" } });
      return counterAttemptView(updated2);
    }
    if (refund.status === "failed" || refund.status === "canceled") {
      if (attempt.purpose === "training_refund") {
        const pack = await tx.trainingPackage.findUnique({ where: { id: attempt.quote.packageId } });
        if (pack.status === "active" && pack.creditsRemaining === 0) {
          const restored = Number(attempt.quote.credits || 0);
          await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: restored } });
          await tx.trainingCreditEntry.create({ data: { organizationId, trainingPackageId: pack.id, eventKey: `refund-released:${attempt.id}`, kind: "refund_released", quantity: restored, balanceAfter: restored, actorId: attempt.recordedById || null, reason: `Card refund ${refund.status}` } });
        }
      }
      const updated2 = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "refund_failed", providerRefundId: refund.id, resolvedAt: now, lastError: `The provider reported the refund as ${refund.status}` } });
      return counterAttemptView(updated2);
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { providerRefundId: refund.id, lastError: "The refund is still processing at the provider" } });
    return counterAttemptView(updated);
  });
}
function assertCanAct(context, attempt) {
  const role = context.session?.data?.role || {};
  const allowed2 = kindOf(attempt) === "retail" ? role.canManageAllRecords || role.canManageRetail : role.canManageAllRecords || role.canManageAppointments;
  if (!allowed2) throw new Error(kindOf(attempt) === "retail" ? "Retail management permission required" : "Training management permission required");
}
async function reconcileCounterPayment(_root, { attemptId, checkoutSessionId, action }, context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  const sessionId = String(checkoutSessionId || "");
  if (!attemptId && !/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)) throw new Error("Card payment was not found for this workspace");
  const attempt = await findAttempt(context, organizationId, attemptId ? { id: String(attemptId) } : { providerCheckoutId: sessionId });
  assertCanAct(context, attempt);
  if (action === "status") {
    if (attempt.status === "refund_pending") return executeCounterRefund(context, attempt);
    if (["retail_sale", "training_sale"].includes(attempt.purpose)) {
      if (OPEN_SALE_STATES.includes(attempt.status) && !attempt.providerCheckoutId) {
        await assertActiveOrganization(context, organizationId);
        return openCounterCheckout(context, attempt);
      }
      return completeCounterCheckout(context, organizationId, { attemptId: attempt.id });
    }
    return counterAttemptView(attempt);
  }
  if (action === "cancel") return cancelCounterCheckout(context, attempt);
  if (action === "refund") return refundCounterException(context, attempt, session.itemId);
  if (action === "retry") {
    if (attempt.status !== "exception" || !attempt.providerPaymentId) throw new Error("Only a paid, unfulfilled checkout can be retried");
    return fulfillPaidAttempt(context, attempt.id, attempt.providerPaymentId, true);
  }
  throw new Error("Unknown card payment action");
}
async function reconcileCounterCheckoutEvent(context, organizationId, session) {
  const attemptId = session?.metadata?.attemptId;
  const prisma = guardKeystonePrismaResults(context.prisma);
  const attempt = attemptId ? await prisma.counterPaymentAttempt.findFirst({ where: { id: attemptId, organizationId } }) : null;
  if (!attempt) {
    if (session?.status === "complete" && session?.payment_status === "paid") {
      await withKeystonePrismaTransaction(context.prisma, (tx) => createFinanceException(tx, {
        organizationId,
        key: `counter-unmatched:${session.id}`,
        kind: "counter-payment",
        reference: String(session.payment_intent?.id || session.payment_intent || session.id),
        summary: "A paid counter card checkout has no matching Gym sale. Record or refund it from the provider evidence."
      }));
    }
    return { matched: false };
  }
  await completeCounterCheckout(context, organizationId, { attemptId: attempt.id });
  return { matched: true };
}
async function reconcileCounterRefundEvent(context, organizationId, refund) {
  const operationKey2 = refund?.metadata?.gymRefundOperationKey;
  if (typeof operationKey2 !== "string" || !operationKey2.startsWith("counter-refund:")) return { matched: false };
  const prisma = guardKeystonePrismaResults(context.prisma);
  const attempt = await prisma.counterPaymentAttempt.findFirst({ where: { organizationId, providerKey: operationKey2 } });
  if (!attempt) return { matched: false };
  await applyCounterRefundOutcome(context, attempt.id, refund);
  return { matched: true };
}
async function ownsCounterPayment(prisma, organizationId, paymentIntentId) {
  const [attempt, sale, pack] = await Promise.all([
    prisma.counterPaymentAttempt.findFirst({ where: { organizationId, OR: [{ providerPaymentId: paymentIntentId }, { quote: { path: ["paymentIntentId"], equals: paymentIntentId } }] }, select: { id: true } }),
    prisma.retailSale.findFirst({ where: { organizationId, paymentReference: paymentIntentId, tender: "card" }, select: { id: true } }),
    prisma.trainingPackage.findFirst({ where: { organizationId, purchaseReference: paymentIntentId }, select: { id: true } })
  ]);
  return Boolean(attempt || sale || pack);
}
async function counterAttemptsForWorkspace(prisma, organizationId, kind) {
  const purposes = kind === "retail" ? ["retail_sale", "retail_refund", "exception_refund"] : ["training_sale", "training_refund", "exception_refund"];
  const rows = await prisma.counterPaymentAttempt.findMany({
    where: { organizationId, purpose: { in: purposes }, OR: [{ status: { in: ["reserved", "open", "exception", "refund_pending"] } }, { updatedAt: { gte: new Date(Date.now() - 7 * 864e5) } }] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 50,
    select: { id: true, purpose: true, status: true, amount: true, currencyCode: true, quote: true, result: true, lastError: true, createdAt: true, expiresAt: true, providerCheckoutId: true }
  });
  return rows.filter((row) => row.purpose !== "exception_refund" || (row.quote?.kind === "training" ? "training" : "retail") === kind).map((row) => ({
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    amount: row.amount,
    currencyCode: row.currencyCode,
    summary: row.purpose === "training_sale" ? `${row.quote?.terms?.serviceName || "Package"} \xB7 ${row.quote?.memberName || ""}`.trim() : row.purpose === "training_refund" ? `Refund ${row.quote?.credits ?? ""} unused credits` : row.purpose === "exception_refund" ? "Refund of unfulfilled card payment" : (row.quote?.lines || []).map((line) => `${line.quantity} \xD7 ${line.name}`).join(", "),
    checkoutUrl: row.status === "open" ? row.result?.checkoutUrl || null : null,
    lastError: row.lastError || "",
    createdAt: row.createdAt,
    expiresAt: row.expiresAt
  }));
}
var counterPaymentTypeDefs = `extend type Mutation { reconcileCounterPayment(attemptId: ID, checkoutSessionId: String, action: String!): JSON! }`;

// features/keystone/mutations/paymentWebhook.ts
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
    evidence = Object.fromEntries(["id", "object", "mode", "metadata", "client_reference_id", "amount", "amount_total", "currency", "amount_refunded", "payment_intent", "payment_status", "status"].map((key) => [key, object[key] ?? null]));
    if (event.type === "charge.refunded") {
      evidence.refunds = { data: (object.refunds?.data || []).map((refund) => ({
        id: refund.id,
        payment_intent: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        metadata: refund.metadata || {}
      })) };
    }
    if (evidence.payment_intent && typeof evidence.payment_intent === "object") evidence.payment_intent = evidence.payment_intent.id;
    if (evidence.metadata) evidence.metadata = Object.fromEntries(["paymentSessionKey", "source", "kind", "attemptId", "organizationId", "gymRefundOperationKey"].map((key) => [key, evidence.metadata[key] ?? null]));
  }
  return { id: event.id, type: event.type, created: event.created, livemode: event.livemode, data: { object: evidence } };
}
async function claimEvent(context, providerId, organizationId, event) {
  const now = /* @__PURE__ */ new Date();
  try {
    return await withKeystonePrismaTransaction(context.prisma, async (transaction) => {
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
async function tierForProviderPrice(transaction, subscription, organizationId) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  return transaction.membershipTier.findFirst({
    where: { organizationId, OR: [{ stripeMonthlyPriceId: priceId }, { stripeAnnualPriceId: priceId }] },
    select: { id: true, classCreditsPerMonth: true }
  });
}
async function findUserForSubscription(transaction, subscription, organizationId) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const select31 = { id: true, organizationId: true, stripeCustomerId: true };
  if (subscription.metadata?.userId) {
    const user2 = await transaction.user.findFirst({
      where: { id: subscription.metadata.userId, organizationId },
      select: select31
    });
    if (user2?.stripeCustomerId && user2.stripeCustomerId !== customerId) throw new Error("Subscription customer does not match the existing user");
    if (user2) return { user: user2, customerId };
  }
  const user = await transaction.user.findFirst({
    where: { stripeCustomerId: customerId, organizationId },
    select: select31
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
  return withKeystonePrismaTransaction(context.prisma, async (transaction) => {
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
    const owner = await findUserForSubscription(transaction, incomingSubscription, organizationId);
    if (!owner) throw new Error("Subscription owner prerequisite missing; retry reconciliation");
    const { user, customerId } = owner;
    const member = await transaction.member.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true }
    });
    if (!member) throw new Error("Subscription member prerequisite missing; retry reconciliation");
    await lockTransactionKey(transaction, `member:${member.id}`);
    const subscription = assertRetrievedSubscription(
      incomingSubscription.id,
      await adapter.retrieveSubscription(incomingSubscription.id)
    );
    const checkout = await transaction.paymentSession.findFirst({ where: { organizationId, userId: user.id, idempotencyKey: subscription.metadata?.paymentSessionKey || "__missing__" } });
    const agreement = checkout?.data?.agreementSnapshot;
    const membership = await transaction.membership.findFirst({
      where: { memberId: user.id, organizationId }
    });
    if (membership && membership.stripeSubscriptionId !== subscription.id) throw new Error("Another subscription owns this membership; checkout reconciliation required");
    const priceTier = await tierForProviderPrice(transaction, subscription, organizationId);
    let tierId = membership?.tierId || checkout?.membershipTierId || null;
    if (!membership && checkout?.data?.priceId && subscription.items?.data?.[0]?.price?.id !== checkout.data.priceId) {
      throw new Error("Subscription price does not match its checkout agreement; operator reconciliation required");
    }
    if (!tierId) tierId = priceTier?.id || null;
    if (membership && priceTier?.id !== membership.tierId) {
      const pendingTierChange = await transaction.membershipBillingAttempt.findFirst({
        where: { organizationId, membershipId: membership.id, operation: "tier-change", status: "processing" },
        select: { id: true }
      });
      if (!pendingTierChange) {
        await createFinanceException(transaction, {
          organizationId,
          key: `subscription-price:${subscription.id}:${subscription.items?.data?.[0]?.price?.id || "none"}`,
          kind: "subscription-plan-mismatch",
          reference: subscription.id,
          summary: "The provider subscription bills a price that does not match the member's accepted plan. Review the subscription and change the plan from Billing, or restore the provider price."
        });
      }
    }
    const providerMembershipStatus = mapStripeStatusToMembership(
      subscription.status,
      Boolean(subscription.pause_collection)
    );
    const now = /* @__PURE__ */ new Date();
    const hasCurrentPaidServicePeriod = Boolean(
      membership?.creditPeriodStart && membership.creditPeriodEnd && new Date(membership.creditPeriodStart) <= now && now < new Date(membership.creditPeriodEnd)
    );
    const membershipStatus = providerMembershipStatus === "active" ? hasCurrentPaidServicePeriod ? "active" : "past-due" : providerMembershipStatus;
    const billingCycle = membership?.billingCycle === "annual" || !membership && subscription.metadata?.billingCycle === "annual" ? "annual" : "monthly";
    const nextBillingDate = subscription.current_period_end ? new Date(subscription.current_period_end * 1e3) : null;
    const startDate = subscription.current_period_start ? new Date(subscription.current_period_start * 1e3) : new Date(event.created * 1e3);
    const eventTime = new Date(event.created * 1e3);
    const membershipData = {
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
    } else if (tierId) {
      await transaction.membership.create({
        data: {
          organizationId,
          memberId: user.id,
          tierId,
          ...membershipData,
          agreementSnapshot: agreement,
          creditPeriodStart: null,
          creditPeriodEnd: null,
          classCreditsRemaining: 0
        }
      });
    }
    if (tierId && !membership) {
      await transaction.member.updateMany({
        where: { id: member.id, organizationId },
        data: { membershipTierId: tierId }
      });
    }
    const projectionData = {
      memberId: member.id,
      ...tierId ? { membershipTierId: tierId } : {},
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
    } else if (tierId) {
      await transaction.subscription.create({
        data: {
          organizationId,
          stripeSubscriptionId: subscription.id,
          ...projectionData
        }
      });
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
  if (String(invoice.currency || "").toUpperCase() !== "USD") throw new Error("Membership invoice currency is outside the supported USD contract");
  if (status === "succeeded" && amount <= 0) throw new Error("A positive paid invoice is required to grant membership service");
  return withKeystonePrismaTransaction(context.prisma, async (tx) => {
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
    if (updated.status === "active" && updated.creditPeriodStart && new Date(updated.creditPeriodStart) <= /* @__PURE__ */ new Date() && new Date(updated.creditPeriodEnd) > /* @__PURE__ */ new Date()) {
      const grant = await ensureMonthlyCreditGrant(tx, updated, /* @__PURE__ */ new Date());
      await tx.membership.update({ where: { id: updated.id }, data: { classCreditsRemaining: grant.remaining } });
    }
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
  await withKeystonePrismaTransaction(context.prisma, async (transaction) => {
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
      const status = refundAmount >= membershipPayment.amount ? "refunded" : membershipPayment.status === "disputed" ? "disputed" : "completed";
      if (refundAmount !== (membershipPayment.refundAmount ?? 0) || status !== membershipPayment.status) {
        await transaction.membershipPayment.update({
          where: { id: membershipPayment.id },
          data: { status, refundAmount, refundedAt }
        });
      }
    }
    if (gymPayment) {
      const attempts = await transaction.gymRefundAttempt.findMany({ where: { organizationId, paymentId: gymPayment.id, status: "processing" } });
      const providerRefunds = charge.refunds?.data || [];
      for (const refund of providerRefunds) {
        const operationKey2 = refund.metadata?.gymRefundOperationKey;
        if (typeof operationKey2 !== "string" || !operationKey2) continue;
        const attempt = attempts.find((candidate) => readRefundReservation(candidate)?.reservation.providerRequestKey === operationKey2);
        if (!attempt) continue;
        const saved = readRefundReservation(attempt);
        if (!saved) throw new Error("Refund webhook matched an attempt without frozen reservation evidence");
        assertExactProviderRefund(refund, saved.reservation);
        const succeeded = refund.status === "succeeded";
        const failed = refund.status === "failed" || refund.status === "canceled";
        const update = await transaction.gymRefundAttempt.updateMany({
          where: { id: attempt.id, status: "processing" },
          data: {
            status: succeeded ? "succeeded" : failed ? "failed" : "processing",
            providerRefundId: refund.id,
            ...succeeded ? { completedAt: refundedAt } : {},
            reservation: saved.reservation,
            lastError: succeeded ? "" : `Provider refund status: ${refund.status || "unknown"}`
          }
        });
        if (update.count > 1) requirePrismaAffectedCount(update, 1, "refund webhook reconciliation fence");
        if (succeeded) {
          await transaction.gymPayment.updateMany({ where: { id: gymPayment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
        } else if (failed) {
          await transaction.gymPayment.updateMany({ where: { id: gymPayment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
        }
      }
    }
  });
}
async function expireCheckoutSession(context, session, organizationId) {
  const key = session.metadata?.paymentSessionKey || session.client_reference_id;
  if (!key || !session.id) return;
  await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    const localSession = await tx.paymentSession.findFirst({ where: { organizationId, idempotencyKey: key }, select: { id: true, userId: true } });
    if (!localSession) return;
    await lockTransactionKey(tx, `membership-checkout:${organizationId}:${localSession.userId}`);
    await tx.paymentSession.updateMany({
      where: { id: localSession.id, organizationId, status: { notIn: ["completed", "expired"] }, OR: [{ providerSessionId: session.id }, { providerSessionId: "" }] },
      data: { status: "expired", expiresAt: /* @__PURE__ */ new Date(), provisioningLockedUntil: null }
    });
  });
}
async function recordRefundObservation(context, adapter, refundEvent, organizationId) {
  const refund = adapter.retrieveRefund ? await adapter.retrieveRefund(refundEvent.id) : refundEvent;
  if (refund.id !== refundEvent.id) throw new Error("Payment provider returned a different refund");
  const counter = await reconcileCounterRefundEvent(context, organizationId, refund);
  if (counter.matched) return;
  const operationKey2 = refund.metadata?.gymRefundOperationKey;
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (typeof operationKey2 !== "string" || !operationKey2 || !paymentIntentId) return;
  await withKeystonePrismaTransaction(context.prisma, async (tx) => {
    await lockTransactionKey(tx, `payment-refund:${organizationId}:${paymentIntentId}`);
    const payment = await tx.gymPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } });
    if (!payment) return;
    await lockTransactionKey(tx, `refund:${payment.id}`);
    const attempts = await tx.gymRefundAttempt.findMany({ where: { organizationId, paymentId: payment.id, status: "processing" } });
    const attempt = attempts.find((candidate) => readRefundReservation(candidate)?.reservation.providerRequestKey === operationKey2);
    if (!attempt) return;
    const saved = readRefundReservation(attempt);
    if (!saved) throw new Error("Refund event matched an attempt without frozen reservation evidence");
    assertExactProviderRefund(refund, saved.reservation);
    const now = /* @__PURE__ */ new Date();
    if (refund.status === "succeeded") {
      const membershipPayment = payment.stripeInvoiceId ? await tx.membershipPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } }) : null;
      const prior = Math.max(payment.refundAmount ?? 0, membershipPayment?.refundAmount ?? 0);
      const totalRefunded = reconcileProviderRefundCumulative(payment.amount, prior, saved.reservation.startingRefundAmount, saved.reservation.amount);
      const fullyRefunded = totalRefunded >= payment.amount;
      const update = await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { status: "succeeded", providerRefundId: refund.id, completedAt: now, reservation: saved.reservation, lastError: "" } });
      requirePrismaAffectedCount(update, 1, "refund event finalization fence");
      await tx.gymPayment.update({ where: { id: payment.id }, data: { status: fullyRefunded ? "refunded" : "succeeded", refundAmount: totalRefunded, refundedAt: now, ...payment.refundLockToken === attempt.claimToken ? { refundLockUntil: null, refundLockToken: "" } : {} } });
      if (membershipPayment) {
        await tx.membershipPayment.update({ where: { id: membershipPayment.id }, data: { status: fullyRefunded ? "refunded" : membershipPayment.status === "disputed" ? "disputed" : "completed", refundAmount: totalRefunded, refundedAt: now } });
      }
    } else if (refund.status === "failed" || refund.status === "canceled") {
      await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { status: "failed", providerRefundId: refund.id, reservation: saved.reservation, lastError: `Provider refund status: ${refund.status}` } });
      await tx.gymPayment.updateMany({ where: { id: payment.id, refundLockToken: attempt.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    } else {
      await tx.gymRefundAttempt.updateMany({ where: { id: attempt.id, status: "processing" }, data: { providerRefundId: refund.id, lastError: `Provider refund status: ${refund.status || "unknown"}` } });
    }
  });
}
async function replayPaymentEvent(_root, { eventId }, context) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords) throw new Error("Payment reconciliation management permission required");
  const organizationId = actor2.organizationId;
  const record = await prisma.paymentEvent.findFirst({ where: { id: eventId, organizationId } });
  return replayStoredPaymentEvent(context, organizationId, record);
}
async function replayStoredPaymentEvent(context, organizationId, record) {
  if (!record || !record.data?.event || !["failed", "processing"].includes(record.status)) throw new Error("Replayable payment event not found");
  if (record.status === "processing" && record.lockedUntil > /* @__PURE__ */ new Date()) throw new Error("Payment event is currently processing");
  const provider = await context.sudo().query.PaymentProvider.findOne({ where: { id: record.paymentProviderId }, query: "id adapterKey organization { id }" });
  if (!provider || provider.organization?.id !== organizationId) throw new Error("Payment event provider organization mismatch");
  const event = record.data.event;
  if (event.id !== record.providerEventId || event.type !== record.eventType) throw new Error("Stored payment event evidence mismatch");
  const adapter = await getPaymentProviderAdapterForExecution(provider.adapterKey);
  return processVerifiedPaymentEvent(context, provider, adapter, organizationId, event);
}
var INVOICE_PREREQUISITE_ERROR = /^Invoice (?:membership|member) prerequisite missing/;
async function recordInvoiceWithCheckoutPrerequisites(context, providerId, adapter, organizationId, invoice, status, eventCreated) {
  try {
    return await recordInvoicePayment(context, providerId, organizationId, invoice, status, eventCreated);
  } catch (error) {
    if (!(error instanceof Error) || !INVOICE_PREREQUISITE_ERROR.test(error.message)) throw error;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    if (!subscriptionId || !await provisionCheckoutForSubscription(context, adapter, organizationId, subscriptionId)) throw error;
    return recordInvoicePayment(context, providerId, organizationId, invoice, status, eventCreated);
  }
}
async function provisionCheckoutForSubscription(context, adapter, organizationId, subscriptionId) {
  const subscription = assertRetrievedSubscription(subscriptionId, await adapter.retrieveSubscription(subscriptionId));
  const key = subscription.metadata?.paymentSessionKey;
  if (!key) return false;
  const prisma = guardKeystonePrismaResults(context.prisma);
  const local = await prisma.paymentSession.findFirst({
    where: { organizationId, OR: [{ idempotencyKey: key }, { idempotencyKey: key.replace(/:attempt:\d+$/, "") }] },
    select: { providerSessionId: true }
  });
  if (!local?.providerSessionId) return false;
  await provisionMembershipFromCheckoutSession(local.providerSessionId, organizationId, context);
  return true;
}
async function replayDeferredInvoiceEvents(context, organizationId, subscriptionId) {
  if (!subscriptionId) return 0;
  const prisma = guardKeystonePrismaResults(context.prisma);
  const deferred = await prisma.paymentEvent.findMany({
    where: {
      organizationId,
      status: "failed",
      eventType: { in: ["invoice.paid", "invoice.payment_failed"] },
      lastError: { contains: "prerequisite missing" },
      data: { path: ["event", "data", "object", "subscription"], equals: subscriptionId }
    },
    orderBy: { createdAt: "asc" },
    take: 10
  });
  let replayed = 0;
  for (const record of deferred) {
    try {
      await replayStoredPaymentEvent(context, organizationId, record);
      replayed += 1;
    } catch (error) {
      console.error("Deferred payment event replay failed", { eventType: record.eventType, name: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return replayed;
}
async function processVerifiedPaymentEvent(context, provider, adapter, organizationId, event) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const eventRecord = await claimEvent(context, provider.id, organizationId, event);
  if (!eventRecord) return { received: true, duplicate: true };
  try {
    if (event.type === "refund.failed") {
      await recordRefundObservation(context, adapter, event.data.object, organizationId);
    } else switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.metadata?.source === COUNTER_SOURCE) {
          await reconcileCounterCheckoutEvent(context, organizationId, session);
        } else if (session.mode === "subscription" && event.type === "checkout.session.completed") {
          const provisioned = await provisionMembershipFromCheckoutSession(session.id, organizationId, context);
          await replayDeferredInvoiceEvents(context, organizationId, provisioned.subscriptionId);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.metadata?.source === COUNTER_SOURCE) await reconcileCounterCheckoutEvent(context, organizationId, session);
        else await expireCheckoutSession(context, session, organizationId);
        break;
      }
      case "refund.created":
      case "refund.updated":
        await recordRefundObservation(context, adapter, event.data.object, organizationId);
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
        await recordInvoiceWithCheckoutPrerequisites(context, provider.id, adapter, organizationId, event.data.object, "succeeded", event.created);
        break;
      case "invoice.payment_failed":
        await recordInvoiceWithCheckoutPrerequisites(context, provider.id, adapter, organizationId, event.data.object, "failed", event.created);
        break;
      case "invoice.payment_action_required":
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "payout.failed":
      case "payout.paid": {
        const object = event.data.object;
        await withKeystonePrismaTransaction(context.prisma, async (tx) => {
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
      case "charge.refunded": {
        const charge = event.data.object;
        let counterRefunds = 0;
        for (const refund of charge.refunds?.data || []) {
          if ((await reconcileCounterRefundEvent(context, organizationId, refund)).matched) counterRefunds += 1;
        }
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        const counterCharge = counterRefunds > 0 || (paymentIntentId ? await ownsCounterPayment(prisma, organizationId, paymentIntentId) : false);
        if (!counterCharge) await recordRefund(context, charge, organizationId, new Date(event.created * 1e3));
        break;
      }
      default:
        const ignored = await prisma.paymentEvent.updateMany({
          where: { id: eventRecord.id, status: "processing", attempts: eventRecord.attempts },
          data: { status: "ignored", processedAt: /* @__PURE__ */ new Date(), lockedUntil: null }
        });
        requirePrismaAffectedCount(ignored, 1, "payment event ignore fence");
        return { received: true, ignored: true };
    }
    const processed = await prisma.paymentEvent.updateMany({
      where: { id: eventRecord.id, status: "processing", attempts: eventRecord.attempts },
      data: { status: "processed", processedAt: /* @__PURE__ */ new Date(), lockedUntil: null }
    });
    requirePrismaAffectedCount(processed, 1, "payment event completion fence");
    return { received: true };
  } catch (error) {
    await prisma.paymentEvent.updateMany({
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

// features/keystone/mutations/paymentLifecycle.ts
init_prisma_result();
var PROVIDER_CODE3 = "pp_stripe";
async function acquireRefundAdvisoryLock(transaction, paymentId) {
  const lockResult = await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${paymentId}`}, 0))) AS acquired`;
  if (lockResult instanceof Error) throw lockResult;
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
  const provisioned = await provisionMembershipFromCheckoutSession(normalizedSessionId, organizationId, context);
  await replayDeferredInvoiceEvents(context, organizationId, provisioned.subscriptionId);
  return provisioned;
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
  const { provider, adapter } = await getAdapterForProvider(context, PROVIDER_CODE3, organizationId, "reconcile");
  const deadline = Date.now() + 3e4;
  let claim;
  while (Date.now() < deadline) {
    const refundToken = import_node_crypto8.default.randomUUID();
    claim = await withKeystonePrismaTransaction(context.prisma, async (transaction) => {
      await acquireRefundAdvisoryLock(transaction, paymentId);
      const payment = await transaction.gymPayment.findFirst({
        where: { id: paymentId, organizationId }
      });
      if (!payment) throw new Error("Payment not found");
      if (!payment.stripePaymentIntentId) throw new Error("Payment has no provider payment intent");
      const currencyCode = String(payment.currencyCode || "").toUpperCase();
      if (currencyCode !== "USD") throw new Error("Refund payment currency is outside the supported USD scope; operator reconciliation required");
      if (payment.paymentProviderId && payment.paymentProviderId !== provider.id) throw new Error("Payment provider does not match the organization refund adapter");
      const existing = await transaction.gymRefundAttempt.findUnique({ where: { organizationId_requestKey: { organizationId, requestKey } } });
      if (existing && amount != null && amount !== existing.amount) throw new Error("This refund idempotency key was already used with a different amount");
      const alreadyRefunded = payment.refundAmount ?? 0;
      if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 || !Number.isSafeInteger(alreadyRefunded) || alreadyRefunded < 0 || alreadyRefunded > payment.amount) {
        throw new Error("Payment refund totals require operator reconciliation");
      }
      const remaining = payment.amount - alreadyRefunded;
      const refundAmount = existing?.amount ?? amount ?? remaining;
      const startingRefundAmount = existing?.startingRefundAmount ?? alreadyRefunded;
      if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > payment.amount - startingRefundAmount) {
        throw new Error("Refund amount must be a positive minor-unit amount within the reserved payment total");
      }
      const expectedProviderKey = providerRefundOperationKey(organizationId, payment.id, requestId);
      const reservation = {
        version: 1,
        paymentId: payment.id,
        providerId: provider.id,
        paymentIntentId: payment.stripePaymentIntentId,
        requestKey,
        providerRequestKey: expectedProviderKey,
        amount: refundAmount,
        startingRefundAmount,
        currencyCode: "USD",
        reason: normalizedReason
      };
      const stored = existing ? readRefundReservation(existing) : null;
      if (existing && !stored) throw new Error("Legacy refund attempt lacks frozen evidence; operator reconciliation required before retry");
      if (stored) assertSameRefundReservation(stored.reservation, reservation);
      const frozenReservation = stored?.reservation || reservation;
      if (existing) {
        if (existing.status === "succeeded") {
          if (!existing.providerRefundId || existing.providerRefundId === "reconciled-cumulative-provider-evidence") throw new Error("Refund attempt lacks exact provider identity; operator reconciliation required");
          if (alreadyRefunded < startingRefundAmount + refundAmount) throw new Error("Exact refund attempt and cumulative payment totals disagree; operator reconciliation required");
          return { done: true, paymentId: payment.id, attemptId: existing.id, refundAmount: existing.amount };
        }
        if (existing.status === "failed") throw new Error("This refund attempt definitively failed; use a new idempotency key after reviewing provider evidence");
      }
      const unresolved = await transaction.gymRefundAttempt.findFirst({
        where: { organizationId, paymentId: payment.id, status: "processing" },
        select: { id: true }
      });
      if (unresolved && unresolved.id !== existing?.id) {
        throw new Error("Another refund has an unresolved provider outcome; retry its original idempotency key before starting another refund");
      }
      if (payment.status !== "succeeded") throw new Error("Only succeeded payments can be refunded");
      const lockActive = Boolean(payment.refundLockUntil && payment.refundLockUntil > /* @__PURE__ */ new Date());
      if (lockActive) return { wait: true };
      const attempt = existing ? await transaction.gymRefundAttempt.update({
        where: { id: existing.id },
        data: { status: "processing", claimToken: refundToken, reservation: frozenReservation, lastError: stored?.detail || "", requestedAt: /* @__PURE__ */ new Date() }
      }) : await transaction.gymRefundAttempt.create({
        data: {
          organizationId,
          paymentId: payment.id,
          requestKey,
          claimToken: refundToken,
          amount: refundAmount,
          startingRefundAmount,
          status: "processing",
          reservation: frozenReservation,
          lastError: "",
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
        paymentIntentId: payment.stripePaymentIntentId,
        currencyCode: reservation.currencyCode,
        reason: frozenReservation.reason,
        providerRequestKey: frozenReservation.providerRequestKey,
        currentRefundAmount: alreadyRefunded,
        isExistingAttempt: Boolean(existing),
        reservation: frozenReservation
      };
    });
    if (!claim.wait) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claim || claim.wait) throw new Error("Refund remained busy; retry with the same idempotency key");
  if (claim.done) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  let providerRefund = null;
  let providerResponseMatchesReservation = false;
  try {
    if (claim.isExistingAttempt && typeof adapter.findRefundPayment !== "function") {
      throw new Error("Payment adapter cannot reconcile exact refund identity; operator reconciliation required");
    }
    providerRefund = await adapter.findRefundPayment?.(claim.paymentIntentId, claim.providerRequestKey) || null;
    if (!providerRefund && claim.currentRefundAmount > claim.startingRefundAmount) {
      throw new Error("Cumulative refund evidence changed without an exact provider refund identity; operator reconciliation required");
    }
    if (!providerRefund) {
      providerRefund = await adapter.refundPayment(claim.paymentIntentId, claim.refundAmount, claim.providerRequestKey, {
        operationKey: claim.providerRequestKey,
        currencyCode: claim.currencyCode,
        reason: claim.reason
      });
    }
    assertExactProviderRefund(providerRefund, claim.reservation);
    providerResponseMatchesReservation = true;
    if (["failed", "canceled"].includes(providerRefund.status)) {
      throw new Error(`Provider refund definitively ${providerRefund.status}; use a new idempotency key after reviewing the receipt`);
    }
    if (providerRefund.status !== "succeeded") {
      throw new Error(`Refund remains unresolved at the payment provider (status: ${providerRefund.status || "unknown"})`);
    }
    const finalized = await withKeystonePrismaTransaction(context.prisma, async (transaction) => {
      await acquireRefundAdvisoryLock(transaction, claim.paymentId);
      const payment = await transaction.gymPayment.findFirst({
        where: { id: claim.paymentId, organizationId }
      });
      const attempt = await transaction.gymRefundAttempt.findUnique({ where: { id: claim.attemptId } });
      if (!payment || !attempt) return false;
      if (attempt.status === "succeeded" && attempt.providerRefundId === providerRefund.id) return true;
      if (attempt.status !== "processing" || attempt.claimToken !== claim.claimToken || payment.refundLockToken !== claim.claimToken) return false;
      if (payment.stripePaymentIntentId !== claim.paymentIntentId || String(payment.currencyCode || "").toUpperCase() !== claim.currencyCode || payment.paymentProviderId && payment.paymentProviderId !== provider.id) {
        throw new Error("Payment identity changed while refund was in flight; operator reconciliation required");
      }
      const membershipPayments = payment.stripeInvoiceId ? await transaction.membershipPayment.findMany({
        where: { organizationId, stripePaymentIntentId: claim.paymentIntentId, status: { in: ["completed", "refunded", "disputed"] } }
      }) : [];
      if (payment.stripeInvoiceId && membershipPayments.length !== 1) throw new Error("Invoice receipt projection is missing or ambiguous during refund finalization");
      const memberReceipt = membershipPayments[0];
      if (memberReceipt && (memberReceipt.amount !== payment.amount || String(memberReceipt.currencyCode || "").toUpperCase() !== claim.currencyCode)) {
        throw new Error("Payment receipt projections disagree on amount or currency; operator reconciliation required");
      }
      const priorRefundAmount = Math.max(payment.refundAmount ?? 0, memberReceipt?.refundAmount ?? 0);
      const totalRefunded = reconcileProviderRefundCumulative(payment.amount, priorRefundAmount, claim.startingRefundAmount, claim.refundAmount);
      const attemptUpdate = await transaction.gymRefundAttempt.updateMany({
        where: { id: attempt.id, status: "processing", claimToken: claim.claimToken },
        data: { status: "succeeded", providerRefundId: providerRefund.id, completedAt: /* @__PURE__ */ new Date(), reservation: claim.reservation, lastError: "" }
      });
      if (!attemptUpdate.count) return false;
      requirePrismaAffectedCount(attemptUpdate, 1, "refund attempt finalization fence");
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
      requirePrismaAffectedCount(paymentUpdate, 1, "gym payment refund finalization fence");
      if (memberReceipt) {
        await transaction.membershipPayment.update({
          where: { id: memberReceipt.id },
          data: {
            status: fullyRefunded ? "refunded" : memberReceipt.status === "disputed" ? "disputed" : "completed",
            refundAmount: totalRefunded,
            refundedAt,
            refundReason: normalizedReason
          }
        });
      }
      return true;
    });
    if (!finalized) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 2e3) : "Refund provider outcome requires reconciliation";
    const definiteProviderFailure = providerResponseMatchesReservation && ["failed", "canceled"].includes(providerRefund?.status);
    await withKeystonePrismaTransaction(context.prisma, async (transaction) => {
      const attemptUpdate = await transaction.gymRefundAttempt.updateMany({
        where: { id: claim.attemptId, status: "processing", claimToken: claim.claimToken },
        data: {
          status: definiteProviderFailure ? "failed" : "processing",
          ...providerRefund?.id ? { providerRefundId: providerRefund.id } : {},
          reservation: claim.reservation,
          lastError: detail
        }
      });
      if (attemptUpdate.count > 1) requirePrismaAffectedCount(attemptUpdate, 1, "refund outcome fence");
      await transaction.gymPayment.updateMany({ where: { id: claim.paymentId, refundLockToken: claim.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    });
    throw error;
  }
  return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
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
init_prisma_result();
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
  prisma = guardKeystonePrismaResults(prisma);
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
  prisma = guardKeystonePrismaResults(prisma);
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
  prisma = guardKeystonePrismaResults(prisma);
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
    const effectiveInstructor2 = booking.classInstance.instructor ?? booking.classInstance.classSchedule?.instructor ?? null;
    const assignedToActor = Boolean(effectiveInstructor2?.isActive && effectiveInstructor2?.user?.id === input.actor.userId);
    if (!input.actor.canManageAllRecords && !(input.actor.isInstructor && assignedToActor)) {
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
  prisma = guardKeystonePrismaResults(prisma);
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
    if (member.user.membership?.id) await assertNoPendingMembershipFreeze(transaction, input.actor.organizationId, member.user.membership.id);
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
  prisma = guardKeystonePrismaResults(prisma);
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
  prisma = guardKeystonePrismaResults(prisma);
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
async function actorFromContext(context) {
  return currentRoleActor(context);
}
async function cancelClassBooking(root, { bookingId }, context) {
  const result = await cancelCapacityControlledBooking(context.prisma, {
    bookingId,
    actor: await actorFromContext(context)
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
    actor: await actorFromContext(context)
  });
}
async function markClassAttendance(root, args, context) {
  const result = await markCapacityControlledAttendance(context.prisma, {
    ...args,
    actor: await actorFromContext(context)
  });
  return context.db.AttendanceRecord.findOne({ where: { id: result.id } });
}
async function authorizedCheckInResult(context, checkInId) {
  const organizationId = context.session?.data?.organization?.id;
  const rows = await context.sudo().db.CheckIn.findMany({ where: { AND: [{ id: { equals: checkInId } }, { organization: { id: { equals: organizationId } } }] }, take: 1 });
  if (!rows[0]) throw new Error("The check-in was recorded but could not be read back; refresh the front desk");
  return rows[0];
}
async function recordMemberCheckIn(root, args, context) {
  const result = await recordCapacityControlledMemberCheckIn(context.prisma, {
    ...args,
    actor: await currentCheckInActor(context)
  });
  return { checkIn: await authorizedCheckInResult(context, result.checkIn.id), reused: result.reused };
}
async function checkOutMember(root, { checkInId }, context) {
  const result = await checkOutControlledMember(context.prisma, {
    checkInId,
    actor: await currentCheckInActor(context)
  });
  return { checkIn: await authorizedCheckInResult(context, result.checkIn.id), reused: result.reused };
}

// features/keystone/mutations/deterministicOnboarding.ts
var import_node_crypto9 = __toESM(require("node:crypto"));

// features/keystone/onboarding/seed.json
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
          "San Francisco, CA 94102",
          "Replace with your gym's address."
        ]
      },
      {
        title: "Phone",
        details: [
          "(415) 555-0100",
          "Replace with your gym's phone number."
        ]
      },
      {
        title: "Email",
        details: [
          "hello@example.invalid",
          "Replace with your gym's email address."
        ]
      },
      {
        title: "Hours",
        details: [
          "Monday: 5:00 AM - 10:00 PM",
          "Tuesday: 5:00 AM - 10:00 PM",
          "Wednesday: 5:00 AM - 10:00 PM",
          "Thursday: 5:00 AM - 10:00 PM",
          "Friday: 5:00 AM - 9:00 PM",
          "Saturday: 6:00 AM - 6:00 PM",
          "Sunday: 7:00 AM - 4:00 PM"
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

// features/keystone/onboarding/onboardingSchema.ts
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
  logoColor: import_zod.z.union([import_zod.z.number().finite(), import_zod.z.string().trim().regex(/^-?\d+(?:\.\d+)?$/)]).optional(),
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
  participationTerms: optionalText(5e4),
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
    if (instructorId && effectiveInstructor(other) === instructorId && overlapping(candidate.date, candidate.endsAt, other.date, otherEnd)) throw new Error("This coach already teaches another class at that time. Choose another time or coach");
    const otherResourceId = other.endsAt ? other.resourceId : other.resourceId ?? other.classSchedule?.resourceId;
    if (resource && otherResourceId === resource.id) {
      const otherResource = other.resource ?? resource;
      if (overlapping(
        start,
        end,
        new Date(other.date.getTime() - (otherResource.setupBufferMinutes || 0) * 6e4),
        new Date(otherEnd.getTime() + (otherResource.cleanupBufferMinutes || 0) * 6e4)
      )) throw new Error("This resource is already allocated to another class at that time. Choose another time or resource");
    }
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
      if (instructorId && appointment.instructorId === instructorId && overlapping(candidate.date, candidate.endsAt, appointment.startTime, appointment.endTime)) throw new Error("This coach has a training appointment at that time. Choose another time or coach");
      if (resource && appointment.resourceId === resource.id && overlapping(start, end, appointment.resourceStartsAt || new Date(appointment.startTime.getTime() - before), appointment.resourceEndsAt || new Date(appointment.endTime.getTime() + after))) throw new Error("This resource is allocated to a training appointment at that time. Choose another time or resource");
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
        await assertNoMemberServiceConflict(tx, booking.memberId, organizationId, { ...data, id: existing.id, classSchedule: schedule });
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

// features/keystone/mutations/deterministicOnboarding.ts
init_prisma_result();
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
function requiredSeedId(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`Onboarding seed did not produce ${label}`);
  return value;
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
var BOUNDED_INSTRUCTOR_ROLE = {
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
  isInstructor: true
};
function placeholderCoachEmail(seedEmail, organizationId) {
  const local = seedEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const tenant = import_node_crypto9.default.createHash("sha256").update(organizationId).digest("hex").slice(0, 12);
  return `${local}+${tenant}@example.invalid`;
}
async function onboardingReadiness(tx, organizationId) {
  const now = /* @__PURE__ */ new Date();
  const chargesOn = newPaymentChargesEnabled();
  const [settings, locations, plans, purchasablePlans, classTypes, coaches, schedules, sessions, resources, availability, retailItems, policy, provider] = await Promise.all([
    tx.gymSettings.findFirst({ where: { organizationId }, select: { email: true, hours: true } }),
    tx.location.count({ where: { organizationId, isActive: true } }),
    tx.membershipTier.count({ where: { organizationId } }),
    tx.membershipTier.count({ where: { organizationId, stripeProductId: { not: "" }, OR: [
      { stripeMonthlyPriceId: { not: "" }, monthlyPrice: { gt: 0 } },
      { stripeAnnualPriceId: { not: "" }, annualPrice: { gt: 0 } }
    ] } }),
    tx.classType.count({ where: { organizationId } }),
    tx.instructor.count({ where: { organizationId, isActive: true } }),
    tx.classSchedule.count({ where: { organizationId, isActive: true } }),
    tx.classInstance.count({ where: { organizationId, isCancelled: false, date: { gt: now } } }),
    tx.gymResource.count({ where: { organizationId, isActive: true } }),
    tx.trainerAvailability.count({ where: { organizationId } }),
    tx.retailItem.count({ where: { organizationId, isActive: true } }),
    tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { documentText: true, enforceWaiver: true } }),
    tx.paymentProvider.findFirst({ where: { organizationId, code: "pp_stripe" }, select: { id: true } })
  ]);
  const step = (key, label, done, href, required = true) => ({ key, label, done, required, href });
  const steps = [
    step("settings", "Store Settings: name, contact email and opening hours", Boolean(settings?.hours && Object.keys(settings.hours).length && settings?.email && !String(settings.email).endsWith(".invalid")), "/dashboard/platform/store-settings"),
    step("location", "At least one open location", locations > 0, "/dashboard/platform/locations"),
    step("plans", "Membership plans", plans > 0, "/dashboard/platform/membership-plans"),
    step("checkout", chargesOn ? "At least one plan sellable online (Stripe product and price above zero)" : "Online checkout is off; plans are sold at the front desk", !chargesOn || purchasablePlans > 0, "/dashboard/platform/membership-plans", chargesOn),
    step("payments", "Stripe payment provider record", Boolean(provider), "/dashboard/platform/billing", chargesOn),
    step("classes", "Class types", classTypes > 0, "/dashboard/platform/class-catalog"),
    step("coaches", "Active coaches (send each a setup link from Instructors)", coaches > 0, "/dashboard/platform/instructors"),
    step("schedule", "Weekly class schedule with upcoming sessions", schedules > 0 && sessions > 0, "/dashboard/platform/scheduling"),
    step("terms", "Your participation terms (replace the setup placeholder)", Boolean(policy?.documentText) && policy?.enforceWaiver === true, "/dashboard/platform/store-settings", false),
    step("resources", "Rooms and equipment for scheduling (optional)", resources > 0, "/dashboard/gym-resources", false),
    step("availability", "Personal-training availability (optional)", availability > 0, "/dashboard/platform/training", false),
    step("retail", "Front-desk retail items (optional)", retailItems > 0, "/dashboard/platform/retail", false)
  ];
  return { ready: steps.every((item) => !item.required || item.done), steps };
}
async function runDeterministicOnboarding(_root, args, context) {
  const template = args.template;
  const onboardingSeed = resolveOnboardingSeed(template, args.data);
  const { userId, organizationId } = actorOrganization(context);
  const actorUser = await context.query.User.findOne({
    where: { id: userId },
    query: "id onboardingStatus organization { id } role { id canManageOnboarding organization { id } }"
  });
  if (!actorUser || actorUser.organization?.id !== organizationId) throw new Error("Onboarding actor organization mismatch");
  if (actorUser.role?.organization?.id !== organizationId || !actorUser.role?.canManageOnboarding) {
    throw new Error("Onboarding management permission required");
  }
  if (actorUser.onboardingStatus === "dismissed") throw new Error("Dismissed onboarding must be restarted from the dashboard");
  const configHash = import_node_crypto9.default.createHash("sha256").update(JSON.stringify({ template, seed: onboardingSeed })).digest("hex");
  const timeZone = normalizeTimeZone(onboardingSeed.gymSettings.timezone || "UTC");
  return context.transaction(async (txContext) => {
    const tx = guardKeystonePrismaResults(txContext.prisma);
    const sudo = txContext.sudo();
    await lockTransactionKey(tx, `onboarding:${organizationId}`);
    const run = await tx.onboardingRun.findUnique({ where: { organizationId } });
    const previous = run?.manifest || null;
    if (run?.status === "completed") {
      if (previous?.configHash && previous.configHash !== configHash) {
        throw new Error("Setup already completed with a different starter configuration. Change plans, classes and coaches from their pages instead of rerunning setup.");
      }
      await tx.user.updateMany({ where: { id: userId, organizationId }, data: { onboardingStatus: "completed" } });
      const readiness2 = await onboardingReadiness(tx, organizationId);
      const instanceCount2 = await tx.classInstance.count({ where: { organizationId } });
      return { success: true, organizationId, runId: run.id, instanceCount: instanceCount2, readiness: readiness2 };
    }
    const manifest = { version: 2, template, configHash, records: {}, created: [], adopted: [], placeholderUsers: { ...previous?.placeholderUsers || {} }, skippedSessions: [] };
    const created = (kind, id) => {
      manifest.created.push(`${kind}:${id}`);
      return id;
    };
    const adopted = (kind, id) => {
      manifest.adopted.push(`${kind}:${id}`);
      return id;
    };
    const existingSettings = await tx.gymSettings.findFirst({ where: { organizationId }, select: { id: true, logoIcon: true, participationTerms: true } });
    if (existingSettings) {
      manifest.records.settings = adopted("settings", existingSettings.id);
      if (!existingSettings.logoIcon) await tx.gymSettings.update({ where: { id: existingSettings.id }, data: { logoIcon: DEFAULT_GYM_LOGO_ICON, logoColor: DEFAULT_LIBRARY_LOGO_COLOR } });
    } else {
      const { participationTerms: _terms, ...seedSettings } = onboardingSeed.gymSettings;
      const values = normalizeGymSettingsInput({
        logoIcon: DEFAULT_GYM_LOGO_ICON,
        logoColor: DEFAULT_LIBRARY_LOGO_COLOR,
        ...seedSettings,
        ...seedSettings.hours ? { hours: editorWeeklyHours(seedSettings.hours) } : {}
      });
      const row = await sudo.db.GymSettings.createOne({ data: { ...values, organization: { connect: { id: organizationId } } } });
      manifest.records.settings = created("settings", String(row.id));
    }
    const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, select: { id: true } });
    if (!policy) {
      const terms = String(onboardingSeed.gymSettings.participationTerms || "").trim() || PARTICIPATION_TERMS_PLACEHOLDER;
      const settingsId = manifest.records.settings;
      await tx.gymSettings.update({ where: { id: settingsId }, data: { participationTerms: terms } });
      await publishParticipationTerms(tx, organizationId, terms, userId);
    }
    const locationSeed = onboardingSeed.location;
    const existingLocation = await tx.location.findFirst({ where: { organizationId, name: locationSeed.name }, select: { id: true } });
    const locationId = existingLocation ? adopted("location", existingLocation.id) : created("location", String((await sudo.query.Location.createOne({ data: { ...locationSeed, organization: { connect: { id: organizationId } } }, query: "id" })).id));
    manifest.records.location = locationId;
    const tiers = {};
    for (const tier of onboardingSeed.membershipTiers) {
      const { handle: tierHandle, ...tierInput } = tier;
      const existing = await tx.membershipTier.findFirst({ where: { organizationId, name: tier.name }, select: { id: true } });
      tiers[tierHandle] = existing ? adopted("membershipTier", existing.id) : created("membershipTier", String((await sudo.query.MembershipTier.createOne({ data: { ...tierInput, description: documentValue(tier.description), organization: { connect: { id: organizationId } } }, query: "id" })).id));
    }
    manifest.records.membershipTiers = tiers;
    const classTypes = {};
    for (const classType of onboardingSeed.classTypes) {
      const { handle: classTypeHandle, ...classTypeInput } = classType;
      const existing = await tx.classType.findFirst({ where: { organizationId, name: classType.name }, select: { id: true } });
      classTypes[classTypeHandle] = existing ? adopted("classType", existing.id) : created("classType", String((await sudo.query.ClassType.createOne({ data: { ...classTypeInput, description: documentValue(classType.description), organization: { connect: { id: organizationId } } }, query: "id" })).id));
    }
    manifest.records.classTypes = classTypes;
    if (process.env.GYM_DATABASE_TESTS === "true" && process.env.GYM_ONBOARDING_INJECT_FAILURE === "true") {
      throw new Error("Injected onboarding recovery failure");
    }
    const roles = await tx.role.findMany({ where: { organizationId }, take: 200 });
    const bounded = roles.find((role) => Object.entries(BOUNDED_INSTRUCTOR_ROLE).every(([key, value]) => role[key] === value));
    let instructorRoleId;
    if (bounded) instructorRoleId = adopted("role", bounded.id);
    else {
      const names = new Set(roles.map((role) => role.name));
      const name = names.has("Instructor") ? "Coach (setup)" : "Instructor";
      instructorRoleId = created("role", (await tx.role.create({ data: { ...BOUNDED_INSTRUCTOR_ROLE, name, organizationId } })).id);
    }
    manifest.records.instructorRole = instructorRoleId;
    const instructors = {};
    for (const instructor of onboardingSeed.instructors) {
      const fullName = `${instructor.firstName} ${instructor.lastName}`.trim();
      const tenantEmail = placeholderCoachEmail(instructor.email, organizationId);
      const existingUser = await tx.user.findFirst({ where: { organizationId, email: { in: [tenantEmail, instructor.email.toLowerCase()] } }, select: { id: true, email: true } });
      let instructorUserId;
      if (existingUser) {
        instructorUserId = adopted("user", existingUser.id);
      } else {
        const user = await sudo.db.User.createOne({ data: { name: fullName, email: tenantEmail, password: import_node_crypto9.default.randomBytes(32).toString("base64url"), organization: { connect: { id: organizationId } } } });
        instructorUserId = created("user", String(user.id));
        await tx.user.update({ where: { id: instructorUserId }, data: { roleId: instructorRoleId } });
        manifest.placeholderUsers[instructorUserId] = { handle: instructor.handle, seedEmail: tenantEmail };
      }
      const existingInstructor = await tx.instructor.findFirst({ where: { organizationId, userId: instructorUserId }, select: { id: true } });
      instructors[instructor.handle] = existingInstructor ? adopted("instructor", existingInstructor.id) : created("instructor", String((await sudo.query.Instructor.createOne({ data: {
        organization: { connect: { id: organizationId } },
        user: { connect: { id: instructorUserId } },
        bio: documentValue(instructor.bio),
        specialties: instructor.specialties ?? [],
        certifications: instructor.certifications ?? [],
        photo: instructor.photo ?? "",
        isActive: instructor.isActive ?? true
      }, query: "id" })).id));
    }
    manifest.records.instructors = instructors;
    const schedules = [];
    for (const schedule of onboardingSeed.schedules) {
      const instructorId = requiredSeedId(instructors[schedule.instructorHandle], `instructor ${schedule.instructorHandle}`);
      const classTypeId = requiredSeedId(classTypes[schedule.classTypeHandle], `class type ${schedule.classTypeHandle}`);
      const { instructorHandle: _instructorHandle, classTypeHandle: _classTypeHandle, ...scheduleInput } = schedule;
      const existing = await tx.classSchedule.findFirst({ where: { organizationId, name: schedule.name, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, instructorId }, select: { id: true, isActive: true } });
      const id = existing ? adopted("classSchedule", existing.id) : created("classSchedule", String((await sudo.query.ClassSchedule.createOne({ data: {
        ...scheduleInput,
        organization: { connect: { id: organizationId } },
        instructor: { connect: { id: instructorId } },
        classType: { connect: { id: classTypeId } },
        location: { connect: { id: locationId } }
      }, query: "id" })).id));
      schedules.push({ id, name: schedule.name, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, isActive: existing ? existing.isActive : schedule.isActive !== false });
    }
    const now = /* @__PURE__ */ new Date();
    let instanceCount = 0;
    for (const schedule of schedules) {
      if (!schedule.isActive) continue;
      for (let offset = 0; offset <= 14; offset += 1) {
        const date = dateForSchedule(schedule.dayOfWeek, schedule.startTime, offset, now, timeZone);
        if (!date || date <= now) continue;
        const key = `${schedule.id}:${date.toISOString()}`;
        const found = await tx.classInstance.findFirst({ where: { organizationId, classScheduleId: schedule.id, OR: [{ occurrenceKey: key }, { date }] }, select: { id: true } });
        if (found) {
          instanceCount += 1;
          continue;
        }
        try {
          await saveControlledOccurrence(tx, organizationId, { classScheduleId: schedule.id, date, actorId: userId });
          instanceCount += 1;
        } catch (error) {
          manifest.skippedSessions.push({ schedule: schedule.name, date: date.toISOString(), reason: error instanceof Error ? error.message.slice(0, 300) : "Not allocatable" });
        }
      }
    }
    const provider = await tx.paymentProvider.findFirst({ where: { organizationId, code: "pp_stripe" }, select: { id: true } });
    if (provider) manifest.records.paymentProvider = adopted("paymentProvider", provider.id);
    else {
      const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
      manifest.records.paymentProvider = created("paymentProvider", String((await sudo.query.PaymentProvider.createOne({ data: {
        organization: { connect: { id: organizationId } },
        name: "Stripe",
        code: "pp_stripe",
        adapterKey: "stripe",
        providerAccountId: process.env.STRIPE_ACCOUNT_ID?.trim() || null,
        isInstalled: stripeConfigured,
        metadata: { credentialSource: "environment", purpose: "membership-billing", setupRequired: !stripeConfigured }
      }, query: "id" })).id));
    }
    manifest.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    const runData = { status: "completed", completedAt: /* @__PURE__ */ new Date(), lastError: "", leaseUntil: null, leaseToken: "", startedAt: now, manifest };
    const saved = run ? await tx.onboardingRun.update({ where: { id: run.id }, data: { ...runData, attempts: { increment: 1 } } }) : await tx.onboardingRun.create({ data: { ...runData, organizationId, attempts: 1 } });
    await tx.user.updateMany({ where: { id: userId, organizationId }, data: { onboardingStatus: "completed" } });
    const readiness = await onboardingReadiness(tx, organizationId);
    return { success: true, organizationId, runId: saved.id, instanceCount, readiness, skippedSessions: manifest.skippedSessions };
  }, { maxWait: 3e4, timeout: 12e4 });
}

// lib/clientSource.ts
var import_node_crypto10 = require("node:crypto");
var CLIENT_SOURCE_HEADER = "x-gym-client-source";
function header(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const value = headers[name];
  return Array.isArray(value) ? value[0] || "" : value || "";
}
function normalizeSource(value) {
  const trimmed = value.trim().slice(0, 64);
  return /^[0-9A-Fa-f:.]{2,64}$/.test(trimmed) ? trimmed : "";
}
function clientSourceFromHeaders(headers, remoteAddress = "") {
  const forwarded = header(headers, "x-forwarded-for").split(",").map((entry) => entry.trim()).filter(Boolean);
  return normalizeSource(forwarded.at(-1) || "") || normalizeSource(header(headers, "x-real-ip")) || normalizeSource(remoteAddress) || "unknown";
}
function signature(source) {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) return "";
  return (0, import_node_crypto10.createHmac)("sha256", secret).update(`client-source:${source}`).digest("base64url").slice(0, 32);
}
function requestClientSource(req) {
  const headers = req?.headers;
  const claimed = header(headers, CLIENT_SOURCE_HEADER);
  const separator = claimed.lastIndexOf(".");
  if (separator > 0) {
    const source = claimed.slice(0, separator);
    const expected = signature(source);
    const supplied = claimed.slice(separator + 1);
    if (expected && supplied.length === expected.length && (0, import_node_crypto10.timingSafeEqual)(Buffer.from(supplied), Buffer.from(expected))) return source;
  }
  return clientSourceFromHeaders(headers, req?.socket?.remoteAddress || "");
}

// features/keystone/mutations/memberRegistration.ts
init_prisma_result();

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
  if (!await consumeAuthAttempt(context.prisma, `signup-source:${requestClientSource(context.req)}`, 20, 60 * 60 * 1e3) || !await consumeAuthAttempt(context.prisma, `signup:${email}:${requestClientSource(context.req)}`, 5, 60 * 60 * 1e3)) {
    throw new Error("Too many signup attempts. Try again later");
  }
  const organizationId = process.env.PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID?.trim();
  if (!organizationId) throw new Error("Public signup is not configured for an organization");
  const storefrontOrganizationId = process.env.STOREFRONT_ORGANIZATION_ID?.trim();
  if (!storefrontOrganizationId || storefrontOrganizationId !== organizationId) {
    throw new Error("Public signup organization must match the configured storefront organization");
  }
  return context.transaction(async (transactionContext) => {
    const prisma = guardKeystonePrismaResults(transactionContext.prisma);
    const sudo = transactionContext.sudo();
    await prisma.$queryRaw`
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
var import_node_crypto11 = __toESM(require("node:crypto"));
init_prisma_result();
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
    const prisma = guardKeystonePrismaResults(transactionContext.prisma);
    await prisma.$queryRaw`
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
        password: import_node_crypto11.default.randomBytes(32).toString("base64url")
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
init_prisma_result();
async function setMemberAccountStatus(_root, { memberId, status }, context) {
  const actor2 = await currentRoleActor(context);
  const organizationId = actor2.organizationId;
  if (!actor2.canManagePeople) throw new Error("Member management permission required");
  if (status !== "active" && status !== "suspended" && status !== "cancelled") {
    throw new Error("Member account status must be active, suspended, or cancelled");
  }
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (transaction) => {
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
var import_node_crypto12 = __toESM(require("node:crypto"));

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function mailDeliveryEnabled() {
  const flag = process.env.MAIL_ENABLED;
  const enabled = flag === "true" || flag === void 0 && process.env.NODE_ENV !== "production";
  return enabled && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}
function mailTransport() {
  if (!mailDeliveryEnabled()) throw new Error("Email delivery is turned off for this Gym deployment");
  const port = Number(process.env.SMTP_PORT || 587);
  return (0, import_nodemailer.createTransport)({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : void 0
  });
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function passwordLinkEmail({ url, heading }) {
  const href = escapeHtml(url);
  return `
    <body style="background: #f9f9f9;">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
            ${escapeHtml(heading)}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="#346df1"><a href="${href}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid #346df1; display: inline-block; font-weight: bold;">Set password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
            The link works once and expires soon. If you did not request it, you can ignore this email.
          </td>
        </tr>
      </table>
    </body>
  `;
}
function passwordResetUrl(resetToken, identity, audience) {
  const origin = resolvePublicBaseUrl();
  if (audience === "dashboard") return `${origin}/dashboard/reset?token=${encodeURIComponent(resetToken)}`;
  return `${origin}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(identity)}`;
}
async function sendPasswordResetEmail(resetToken, to, audience = "storefront") {
  const info = await mailTransport().sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Set your password",
    html: passwordLinkEmail({ url: passwordResetUrl(resetToken, to, audience), heading: "Use this link to set your password." })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mutations/instructorAccount.ts
init_prisma_result();
init_classCapacity();
var emailPattern3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var LINK_MINUTES = 60;
async function peopleActor(context) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");
  const user = await context.sudo().query.User.findOne({ where: { id: session.itemId }, query: "id organization { id } role { canAccessDashboard canManagePeople canManageAllRecords organization { id } }" });
  if (!user || user.organization?.id !== organizationId || user.role?.organization?.id !== organizationId) throw new Error("Actor organization mismatch");
  if (!user.role?.canAccessDashboard || !user.role?.canManagePeople) throw new Error("People management permission required");
  return { userId: session.itemId, organizationId, canManageAllRecords: Boolean(user.role.canManageAllRecords) };
}
function parseDelivery(value) {
  if (value === "email" || value === "inPerson") return value;
  return mailDeliveryEnabled() ? "email" : "inPerson";
}
async function issueAccessLink(context, input) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  if (!await consumeAuthAttempt(context.prisma, `access-link:${input.user.id}`, 5, 60 * 60 * 1e3)) {
    throw new Error("Too many links were issued for this account in the last hour; try again later");
  }
  if (input.delivery === "email" && !mailDeliveryEnabled()) throw new Error("Email delivery is turned off; issue the link for an in-person handoff instead");
  const token = import_node_crypto12.default.randomBytes(24).toString("base64url");
  const issuedAt = /* @__PURE__ */ new Date();
  await context.sudo().db.User.updateOne({ where: { id: input.user.id }, data: { passwordResetToken: token, passwordResetIssuedAt: issuedAt, passwordResetRedeemedAt: null } });
  if (input.memberId) {
    await prisma.operationalNotice.create({ data: {
      organizationId: input.actor.organizationId,
      memberId: input.memberId,
      key: import_node_crypto12.default.createHash("sha256").update(`${input.actor.organizationId}:access-link:${input.user.id}:${issuedAt.toISOString()}`).digest("hex"),
      kind: "account",
      status: "pending",
      message: "Staff issued a one-use password link for your account. If you did not ask for it, contact the club.",
      history: [{ at: issuedAt.toISOString(), userId: input.actor.userId, action: `issued-${input.purpose}-link`, delivery: input.delivery }]
    } });
  }
  const expiresAt = new Date(issuedAt.getTime() + LINK_MINUTES * 6e4).toISOString();
  if (input.delivery === "email") {
    try {
      await sendPasswordResetEmail(token, input.user.email, input.audience);
    } catch {
      return { delivered: "failed", email: input.user.email, url: null, expiresAt };
    }
    return { delivered: "email", email: input.user.email, url: null, expiresAt };
  }
  return { delivered: "inPerson", email: input.user.email, url: passwordResetUrl(token, input.user.email, input.audience), expiresAt };
}
async function issueMemberAccessLink(_root, { memberId, delivery }, context) {
  const actor2 = await peopleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId: actor2.organizationId }, select: { id: true, userId: true, status: true } });
  if (!member?.userId) throw new Error("This member has no account yet; send an invitation instead");
  if (member.status === "cancelled") throw new Error("Closed member accounts can't be recovered");
  if (member.userId === actor2.userId) throw new Error("Use Reset password for your own account");
  const user = await prisma.user.findFirst({ where: { id: member.userId, organizationId: actor2.organizationId }, select: { id: true, email: true, role: { select: Object.fromEntries(roleCapabilityFields.map((field) => [field, true])) } } });
  if (!user?.email) throw new Error("Member account not found");
  const staffCapabilities = user.role ? roleCapabilityFields.filter((field) => user.role[field]) : [];
  if (staffCapabilities.length && !actor2.canManageAllRecords) throw new Error("This account has staff access; an administrator must recover it");
  return issueAccessLink(context, { actor: actor2, user, audience: staffCapabilities.includes("canAccessDashboard") ? "dashboard" : "storefront", delivery: parseDelivery(delivery), memberId: member.id, purpose: "recovery" });
}
async function prepareInstructorAccount(_root, { instructorId, email, delivery }, context) {
  const actor2 = await peopleActor(context);
  const normalizedEmail = normalizeAuthIdentity(email);
  if (!emailPattern3.test(normalizedEmail) || normalizedEmail.length > 254 || normalizedEmail.endsWith(".invalid")) {
    throw new Error("Enter the coach's real email address");
  }
  const prisma = guardKeystonePrismaResults(context.prisma);
  const claimed = await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `instructor-claim:${actor2.organizationId}:${instructorId}`);
    const instructor = await tx.instructor.findFirst({ where: { id: instructorId, organizationId: actor2.organizationId }, select: { id: true, userId: true } });
    if (!instructor?.userId) throw new Error("Instructor account was not found in this organization");
    const run = await tx.onboardingRun.findUnique({ where: { organizationId: actor2.organizationId }, select: { id: true, manifest: true } });
    const placeholders = run?.manifest?.placeholderUsers || {};
    const provenance = placeholders[instructor.userId];
    if (!provenance) throw new Error("Only coach accounts created as onboarding placeholders can be claimed here; existing coaches manage their own sign-in");
    const user = await tx.user.findFirst({ where: { id: instructor.userId, organizationId: actor2.organizationId }, select: { id: true, email: true, passwordResetRedeemedAt: true, role: { select: Object.fromEntries(roleCapabilityFields.map((field) => [field, true])) } } });
    if (!user) throw new Error("Instructor account was not found in this organization");
    if (user.passwordResetRedeemedAt || provenance.claimedAt) throw new Error("This coach has already claimed the account; they manage their own email and password");
    const extra = roleCapabilityFields.filter((field) => field !== "canAccessDashboard" && field !== "isInstructor" && user.role?.[field]);
    if (!user.role?.isInstructor || extra.length) throw new Error("This account no longer has the bounded instructor role; an administrator must handle it");
    if (user.email !== provenance.seedEmail && user.email !== provenance.claimEmail) throw new Error("This account's email was changed outside the claim workflow; an administrator must review it");
    const owner = await tx.user.findFirst({ where: { email: normalizedEmail }, select: { id: true } });
    if (owner && owner.id !== user.id) throw new Error("Another account already uses that email");
    await tx.user.update({ where: { id: user.id }, data: { email: normalizedEmail } });
    await tx.onboardingRun.update({ where: { id: run.id }, data: { manifest: { ...run.manifest, placeholderUsers: { ...placeholders, [user.id]: { ...provenance, claimEmail: normalizedEmail, claimIssuedAt: (/* @__PURE__ */ new Date()).toISOString(), claimIssuedBy: actor2.userId } } } } });
    return { id: user.id, email: normalizedEmail };
  });
  const issued = await issueAccessLink(context, { actor: actor2, user: claimed, audience: "dashboard", delivery: parseDelivery(delivery), memberId: null, purpose: "claim" });
  return { userId: claimed.id, ...issued };
}
async function instructorClaimQueue(_root, _args, context) {
  const actor2 = await peopleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const run = await prisma.onboardingRun.findUnique({ where: { organizationId: actor2.organizationId }, select: { manifest: true } });
  const placeholders = run?.manifest?.placeholderUsers || {};
  const userIds = Object.keys(placeholders).slice(0, 200);
  if (!userIds.length) return [];
  const instructors = await prisma.instructor.findMany({
    where: { organizationId: actor2.organizationId, userId: { in: userIds } },
    select: { id: true, isActive: true, userId: true, user: { select: { name: true, email: true, passwordResetRedeemedAt: true } } },
    orderBy: [{ id: "asc" }]
  });
  return instructors.map((row) => {
    const provenance = placeholders[row.userId] || {};
    const claimed = Boolean(row.user?.passwordResetRedeemedAt || provenance.claimedAt);
    return {
      instructorId: row.id,
      name: row.user?.name || "Coach",
      isActive: row.isActive,
      email: claimed || provenance.claimEmail ? row.user?.email || "" : "",
      status: claimed ? "claimed" : provenance.claimIssuedAt ? "link_issued" : "unclaimed",
      claimIssuedAt: provenance.claimIssuedAt || null
    };
  });
}

// features/keystone/mutations/onboardingStatus.ts
init_prisma_result();
init_classCapacity();
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `onboarding:${organizationId}`);
    const user = await tx.user.findFirst({ where: { id: session.itemId, organizationId }, select: { onboardingStatus: true } });
    const current = user?.onboardingStatus ?? "not_started";
    if (!allowed[current]?.has(status)) {
      throw new Error(`Onboarding transition ${current} -> ${status} is not allowed`);
    }
    const updated = await tx.user.updateMany({
      where: { id: session.itemId, organizationId, onboardingStatus: current },
      data: { onboardingStatus: status }
    });
    requirePrismaAffectedCount(updated, 1, "onboarding status transition");
    return { id: session.itemId, onboardingStatus: status };
  });
}

// features/keystone/mutations/scheduling.ts
init_prisma_result();
init_membership_credits();
init_operational_policy();
init_classCapacity();
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
async function schedulingManager(context) {
  const actor2 = await currentRoleActor(context);
  if (!actor2.canManageAllRecords) throw new Error("Scheduling management permission required");
  return { userId: actor2.userId, organizationId: actor2.organizationId };
}
async function updateClassScheduleCapacity(_root, { classScheduleId, maxCapacity }, context) {
  const { organizationId } = await schedulingManager(context);
  return updateCapacityControlledClassSchedule(context.prisma, {
    classScheduleId,
    maxCapacity,
    organizationId
  });
}
async function updateClassInstanceCapacity(_root, { classInstanceId, maxCapacity }, context) {
  const { organizationId } = await schedulingManager(context);
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
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const sudo = context.sudo();
  const [settings, organization3] = await Promise.all([
    prisma.gymSettings.findUnique({
      where: { organizationId },
      select: { timezone: true }
    }),
    prisma.organization.findUnique({
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
  let skippedNonexistent = 0;
  for (const schedule of schedules) {
    if (schedule.organization?.id !== organizationId) throw new Error("Schedule tenant mismatch");
    const targetDay = DAY_MAP[schedule.dayOfWeek];
    if (targetDay === void 0) continue;
    const [hours, minutes] = String(schedule.startTime).split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) throw new Error("Schedule time is invalid");
    for (let offset = 0; offset <= weeks * 7; offset += 1) {
      if (localWeekdayAtOffset(now, timeZone, offset) !== targetDay) continue;
      const date = futureLocalOccurrence(now, timeZone, offset, hours, minutes);
      if (!date) {
        skippedNonexistent += 1;
        continue;
      }
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
  const createdCount = await prisma.$transaction(async (tx) => {
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
  return { success: true, createdCount, skippedNonexistent };
}
async function saveGymClassSchedule(_root, { id, data }, context) {
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    if (id) await lockTransactionKey(tx, `class-schedule:${id}`);
    const existing = id ? await tx.classSchedule.findFirst({ where: { id, organizationId } }) : null;
    if (id && !existing) throw new Error("Schedule not found");
    const next = { organizationId };
    for (const key of ["name", "description", "dayOfWeek", "startTime", "endTime", "maxCapacity", "isActive"]) if (data[key] !== void 0) next[key] = data[key];
    for (const [field, list46] of [["instructor", "instructor"], ["classType", "classType"], ["location", "location"], ["resource", "gymResource"]]) {
      if (data[field] === void 0) continue;
      const relatedId = data[field]?.disconnect ? null : data[field]?.connect?.id;
      if (relatedId !== null && (typeof relatedId !== "string" || !await tx[list46].findFirst({ where: { id: relatedId, organizationId } }))) throw new Error(`${field} is not in this organization`);
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
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const input = { actorId: context.session.itemId };
  for (const key of ["date", "maxCapacity"]) if (data[key] !== void 0) input[key] = data[key];
  for (const key of ["classSchedule", "instructor", "location", "resource"]) if (data[key] !== void 0) {
    const value = data[key]?.disconnect ? null : data[key]?.connect?.id;
    if (value !== null && typeof value !== "string") throw new Error(`Invalid ${key} relation`);
    input[`${key}Id`] = value;
  }
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    return saveControlledOccurrence(tx, organizationId, input, id);
  });
}
async function reconcileGymEntitlements(_root, { afterId, limit = 50 }, context) {
  const { organizationId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be from 1 to 100");
  const rows = await prisma.membership.findMany({ where: { organizationId, ...afterId ? { id: { gt: afterId } } : {} }, orderBy: { id: "asc" }, take: limit + 1, select: { id: true } });
  const results = [];
  for (const row of rows.slice(0, limit)) results.push(await refreshScopedMembership(prisma, organizationId, row.id));
  return { processed: results.length, nextAfterId: rows.length > limit ? rows[limit - 1].id : null, results };
}
async function updateGymResource(_root, { id, data }, context) {
  const { organizationId, userId } = await schedulingManager(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
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
  return prisma.$transaction(async (tx) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `gym-scheduling:${organizationId}`);
    const resource = await tx.gymResource.findFirst({ where: { id, organizationId } });
    if (!resource) throw new Error("Resource not found in this organization");
    const changed = Object.keys(values).some((key) => resource[key] !== values[key]);
    if (!changed) return { id, reused: true };
    const now = /* @__PURE__ */ new Date();
    const cleanupBufferMs = Math.max(0, Number(resource.cleanupBufferMinutes) || 0) * 6e4;
    const classCandidates = await tx.classInstance.findMany({ where: {
      organizationId,
      isCancelled: false,
      AND: [
        { OR: [{ resourceId: id }, { endsAt: null, resourceId: null, classSchedule: { resourceId: id } }] },
        { OR: [
          { endsAt: { gt: new Date(now.getTime() - cleanupBufferMs) } },
          { endsAt: null, date: { gt: new Date(now.getTime() - 864e5 - cleanupBufferMs) } }
        ] }
      ]
    }, include: { classSchedule: true }, take: 1e3 });
    if (classCandidates.length >= 1e3) throw new Error("Resource class dependency window requires review");
    const classDependency = classCandidates.some((instance) => {
      const classEnd = instance.endsAt ? new Date(instance.endsAt) : new Date(instance.date.getTime() + scheduleDuration(instance.classSchedule));
      return classEnd.getTime() + cleanupBufferMs > now.getTime();
    });
    const trainingDependency = await tx.trainerAppointment.findFirst({ where: {
      organizationId,
      resourceId: id,
      status: { in: ["scheduled", "confirmed", "checked_in"] },
      OR: [
        { resourceEndsAt: { gt: now } },
        { resourceEndsAt: null, endTime: { gt: new Date(now.getTime() - cleanupBufferMs) } },
        { endTime: { gt: now } }
      ]
    }, select: { id: true } });
    if (classDependency || trainingDependency) throw new Error("Cancel or reassign upcoming/in-progress classes and appointments before changing this resource");
    const history2 = Array.isArray(resource.allocationHistory) && resource.allocationHistory.length ? resource.allocationHistory : Array.isArray(resource.metadata?.allocationHistory) ? resource.metadata.allocationHistory : [];
    if (history2.length >= 500) throw new Error("Resource allocation history requires archival review");
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, resource[key]]));
    await tx.gymResource.update({ where: { id }, data: { ...values, allocationHistory: [...history2, { at: now.toISOString(), actorId: userId, reason, before, after: values }] } });
    return { id, reused: false };
  });
}

// features/kiosk/auth.ts
var import_node_crypto13 = require("node:crypto");
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
  return leftBytes.length === rightBytes.length && (0, import_node_crypto13.timingSafeEqual)(leftBytes, rightBytes);
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
  const budget = `kiosk-fail:${requestClientSource(context.req)}`;
  if (!await authAttemptAvailable(context.prisma, budget, 30)) throw new Error("Too many kiosk unlock attempts from this device; wait 15 minutes");
  try {
    kioskTenant(credential, organizationId);
  } catch (error) {
    await consumeAuthAttempt(context.prisma, budget, 30, 15 * 60 * 1e3);
    throw error;
  }
  await assertActiveOrganization(context, organizationId);
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
  await assertActiveOrganization(context, tenantId);
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
  await assertActiveOrganization(context, tenantId);
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
var import_node_crypto14 = require("node:crypto");
var import_graphql2 = require("graphql");
init_classCapacity();
init_prisma_result();
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
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 201);
  const skip = Math.min(Math.max(Math.trunc(options?.skip ?? 0), 0), 5e3);
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
  const instances = await ctx.query.ClassInstance.findMany({
    where: {
      organization: { id: { equals: options.organizationId } },
      date: { gte: from, lte: to },
      isCancelled: { equals: false },
      classSchedule: {
        isActive: { equals: true },
        ...options?.dayOfWeek ? { dayOfWeek: { equals: options.dayOfWeek } } : {}
      },
      ...requestedLocation ? { OR: [
        { location: { id: { equals: requestedLocation.id } } },
        { AND: [{ location: null }, { classSchedule: { location: { id: { equals: requestedLocation.id } } } }] }
      ] } : {}
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: limit,
    skip,
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
        location { id name address phone isActive }
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
  return instances.map((instance) => {
    const confirmedBookings = (instance.bookings ?? []).filter((booking) => booking.status === "confirmed").length;
    const waitlistCount = (instance.bookings ?? []).filter((booking) => booking.status === "waitlist").length;
    const maxCapacity = instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 0;
    const spotsRemaining = Math.max(maxCapacity - confirmedBookings, 0);
    const site = instance.location ?? instance.classSchedule?.location ?? null;
    const resolvedLocation = site?.isActive ? site : null;
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
  const failureBudget = `discovery-fail:${requestClientSource(context.req)}`;
  if (!await authAttemptAvailable(context.prisma, failureBudget, 100)) throw new Error("Too many failed discovery authentication attempts");
  const rejectCredential = async (message) => {
    await consumeAuthAttempt(context.prisma, failureBudget, 100, 60 * 1e3);
    throw new Error(message);
  };
  if (credential.startsWith("gym_")) {
    const digest2 = (0, import_node_crypto14.createHash)("sha256").update(credential).digest("hex");
    const prisma = guardKeystonePrismaResults(context.prisma);
    const stored = await prisma.integrationCredential.findUnique({ where: { digest: digest2 }, include: { organization: true } });
    if (!stored || stored.revokedAt || !stored.expiresAt || stored.expiresAt <= /* @__PURE__ */ new Date() || stored.organization?.status !== "active") return rejectCredential("Unauthorized discovery request");
    if (stored.partner !== partner.trim() || !Array.isArray(stored.scopes) || !stored.scopes.includes(requiredScope)) throw new Error("Unauthorized discovery scope or partner");
    if (!await consumeAuthAttempt(context.prisma, `discovery-key:${stored.id}`, 120, 60 * 1e3)) throw new Error("Too many discovery requests");
    return { organizationId: stored.organizationId, partner: stored.partner, mode: "managed-key" };
  }
  const configuredKey = process.env.DISCOVERY_API_KEY?.trim();
  const organizationId = process.env.DISCOVERY_ORGANIZATION_ID?.trim();
  if (!configuredKey || configuredKey.length < 32 || !organizationId) {
    throw new import_graphql2.GraphQLError("Discovery API is not configured", {
      extensions: {
        code: "DISCOVERY_NOT_CONFIGURED",
        http: { status: 503 }
      }
    });
  }
  const scopes = new Set((process.env.DISCOVERY_API_SCOPES || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (!scopes.has(requiredScope)) throw new Error(`Discovery credential is missing required scope: ${requiredScope}`);
  const normalizedPartner = partner.trim().slice(0, 120) || "authorized-partner";
  const allowlist = new Set((process.env.DISCOVERY_PARTNER_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (allowlist.size && !allowlist.has(normalizedPartner)) throw new Error("Discovery partner is not authorized");
  const supplied = Buffer.from(credential || "");
  const configured = Buffer.from(configuredKey);
  if (supplied.length !== configured.length || !(0, import_node_crypto14.timingSafeEqual)(supplied, configured)) {
    return rejectCredential("Unauthorized discovery request");
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
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const skip = Math.min(Math.max(Math.trunc(args.skip ?? 0), 0), 5e3);
  const page = await getDiscoveryClassFeed(context, {
    organizationId: access3.organizationId,
    from: args.from,
    to: args.to,
    dayOfWeek: args.dayOfWeek,
    locationId: args.locationId,
    locationName: args.locationName,
    limit: limit + 1,
    skip
  });
  const classes = page.slice(0, limit);
  return { source: "openfront-gym", ...access3, count: classes.length, skip, limit, hasMore: page.length > limit, nextSkip: page.length > limit ? skip + limit : null, classes };
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
var referencePattern = /^GYM-\d{8}-[A-F0-9]{8}$/;
function sourcePathOf(value) {
  const path = value?.trim() || "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || /[\u0000-\u001f\u007f\\]/.test(path)) return "";
  return path;
}
async function emailStaffCopy(message) {
  if (!mailDeliveryEnabled()) return;
  try {
    await mailTransport().sendMail({
      to: process.env.CONTACT_FORM_TO || process.env.SMTP_FROM,
      from: process.env.SMTP_FROM,
      replyTo: message.email,
      subject: `[Gym Contact] ${message.subject}${message.reference ? ` \xB7 ${message.reference}` : ""}`,
      text: [
        `Name: ${message.senderName}`,
        `Email: ${message.email}`,
        `Phone: ${message.phone || "Not provided"}`,
        `Topic: ${message.topic}`,
        message.reference ? `Reference: ${message.reference}` : null,
        "",
        message.body
      ].filter((line) => line !== null).join("\n")
    });
  } catch (error) {
    console.error("Contact message saved; staff email copy failed:", error instanceof Error ? error.message : error);
  }
}
async function submitContactForm(_root, { data }, context) {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = normalizeAuthIdentity(data.email);
  const phone = data.phone?.trim() || "";
  const topic = data.topic?.trim() || "General support";
  const message = data.message.trim();
  const reference = referencePattern.test(data.reference?.trim() || "") ? data.reference.trim() : "";
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 || /[\r\n]/.test(`${firstName}${lastName}${topic}`) || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || phone.length > 40 || topic.length > 120 || !message || message.length > 5e3) {
    throw new Error("Contact form details are invalid or too long");
  }
  const source = requestClientSource(context.req);
  if (!await consumeAuthAttempt(context.prisma, `contact-source:${source}`, 10, 15 * 60 * 1e3) || !await consumeAuthAttempt(context.prisma, `contact:${email}:${source}`, 5, 15 * 60 * 1e3)) {
    throw new Error("Too many contact form submissions");
  }
  const organizationId = await publicOrganizationId(context);
  if (!organizationId) throw new Error("Contact form is not available");
  const senderName = `${firstName} ${lastName}`;
  const subject = `${topic} \u2014 ${senderName}`;
  await context.sudo().query.ContactMessage.createOne({
    data: {
      organization: { connect: { id: organizationId } },
      subject,
      reference,
      name: senderName,
      email,
      phone,
      topic,
      message,
      sourcePath: sourcePathOf(data.sourcePath)
    },
    query: "id"
  });
  await emailStaffCopy({ subject, senderName, email, phone, topic, reference, body: message });
  return true;
}

// features/keystone/mutations/operations.ts
var import_node_crypto15 = require("node:crypto");
init_operational_notices();
init_operational_policy();
init_prisma_result();

// features/keystone/lib/participation-evidence.ts
function isEffectiveEvidence(entry, policyId, now = Date.now()) {
  if (!entry || entry.policyId !== policyId || entry.revokedAt) return false;
  if (entry.acceptedAt && new Date(entry.acceptedAt).getTime() > now) return false;
  return !entry.expiresAt || new Date(entry.expiresAt).getTime() > now;
}
function evidenceState(entry, now = Date.now()) {
  if (entry.revokedAt) return "withdrawn";
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now) return "expired";
  if (entry.acceptedAt && new Date(entry.acceptedAt).getTime() > now) return "pending";
  return "current";
}

// features/keystone/mutations/operations.ts
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
  tx = guardKeystonePrismaResults(tx);
  const member = await tx.member.findFirst({ where: { organizationId, ...id ? { id: String(id) } : {}, ...userId ? { userId } : {} } });
  if (!member) throw new Error("Member not found");
  return member;
}
function history(row, userId, action, note) {
  return [...Array.isArray(row.history) ? row.history : [], { at: (/* @__PURE__ */ new Date()).toISOString(), userId, action, note }];
}
async function operationsWorkspace(_root, { caseAfterId }, context) {
  const { organizationId } = operationsActor(context);
  const tx = guardKeystonePrismaResults(context.prisma);
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
  const asOf = /* @__PURE__ */ new Date();
  const credentialState = (credential) => credential.revokedAt ? "revoked" : !credential.expiresAt || !Number.isFinite(new Date(credential.expiresAt).getTime()) || new Date(credential.expiresAt) <= asOf ? "expired" : "active";
  return { notices, cases: cases.slice(0, 100), nextCaseAfterId: cases.length > 100 ? cases[99].id : null, policies, credentials: credentials.map((credential) => ({ ...credential, state: credentialState(credential) })), credentialsAsOf: asOf.toISOString(), members, locations, paymentEvents, resources, caseRequestKey: (0, import_node_crypto15.randomBytes)(24).toString("hex"), evidenceRequestKey: (0, import_node_crypto15.randomBytes)(24).toString("hex"), limits: { queue: 100, memberSelector: 200 }, waiverConfigured: policies.length > 0 };
}
async function participationWorkspace(_root, _args, context) {
  const { organizationId, userId } = operationsActor(context, false);
  const member = await memberInTenant(context.prisma, organizationId, null, userId);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const [policy, evidence, requests] = await Promise.all([
    prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.participationEvidence.findMany({ where: { organizationId, memberId: member.id }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.operationsCase.findMany({ where: { organizationId, memberId: member.id, kind: "privacy" }, take: 20, orderBy: { createdAt: "desc" }, select: { id: true, summary: true, status: true, createdAt: true, closedAt: true } })
  ]);
  const now = Date.now();
  const publicPolicy = policy && isParticipationTermsPlaceholder(String(policy.documentText || "")) ? { ...policy, documentText: "", enforceWaiver: false, placeholder: true } : policy;
  const effective = policy ? evidence.filter((entry) => isEffectiveEvidence(entry, policy.id, now)) : [];
  return {
    policy: publicPolicy,
    evidence: evidence.map((entry) => ({ ...entry, state: evidenceState(entry, now) })),
    acceptedCurrent: effective.length > 0,
    healthConsentCurrent: effective.some((entry) => entry.healthConsent),
    requests,
    requestKey: (0, import_node_crypto15.randomBytes)(24).toString("hex")
  };
}
async function runOperationsCommand(_root, { command, data }, context) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Command data is required");
  const memberCommand = ["privacy.request", "waiver.accept", "waiver.revoke", "health.consent"].includes(command);
  const { organizationId, userId } = operationsActor(context, !memberCommand);
  return context.transaction(async (tc) => {
    const tx = guardKeystonePrismaResults(tc.prisma);
    if (command.startsWith("waiver.") || command.startsWith("policy.") || command.startsWith("case.") || command.startsWith("privacy.") || command === "health.consent") await lockParticipationPolicy(tx, organizationId);
    if (command === "health.consent") {
      const member = await memberInTenant(tx, organizationId, null, userId);
      const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!policy || policy.id !== data.policyId) throw new Error("Review the current participation policy first");
      if (!policy.healthPurpose) throw new Error("This club does not collect optional health information");
      const now = /* @__PURE__ */ new Date();
      const rows = await tx.participationEvidence.findMany({ where: { organizationId, memberId: member.id, policyId: policy.id, revokedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
      const effective = rows.filter((entry) => isEffectiveEvidence(entry, policy.id, now.getTime()));
      if (!effective.length) throw new Error("Accept the current participation terms before changing optional health consent");
      const requestKey = boundedText(data.requestKey, "Request key", 200);
      const grant = data.grant === true;
      if (grant) {
        if (effective.some((entry) => entry.healthConsent)) return { reused: true };
        const key = operationKey(organizationId, `health-consent:${member.id}:${policy.id}:${requestKey}`);
        return tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
          organizationId,
          memberId: member.id,
          policyId: policy.id,
          key,
          requestHash: operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, healthConsent: true })),
          documentReference: policy.documentReference,
          verifiedBy: userId,
          acceptedAt: now,
          expiresAt: effective[0].expiresAt ?? null,
          healthConsent: true
        } });
      }
      const consenting = effective.filter((entry) => entry.healthConsent);
      if (!consenting.length) return { reused: true };
      for (const row of consenting) await tx.participationEvidence.update({ where: { id: row.id }, data: { revokedAt: now, revocationReason: "Member withdrew optional health consent" } });
      if (!effective.some((entry) => !entry.healthConsent)) {
        const key = operationKey(organizationId, `health-consent-withdrawn:${member.id}:${policy.id}:${requestKey}`);
        await tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
          organizationId,
          memberId: member.id,
          policyId: policy.id,
          key,
          requestHash: operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, healthConsent: false })),
          documentReference: policy.documentReference,
          verifiedBy: userId,
          acceptedAt: consenting[0].acceptedAt ?? now,
          expiresAt: consenting[0].expiresAt ?? null,
          healthConsent: false
        } });
      }
      const caseKey = operationKey(organizationId, `consent-withdrawal:${member.id}:${now.toISOString()}`);
      await tx.operationsCase.upsert({ where: { key: caseKey }, update: {}, create: {
        organizationId,
        memberId: member.id,
        key: caseKey,
        kind: "privacy",
        status: "open",
        openedBy: userId,
        history: [],
        summary: "Member withdrew optional health consent. Review purpose and retention; clear health fields when appropriate."
      } });
      return { withdrawn: consenting.length };
    }
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
      const token = `gym_${(0, import_node_crypto15.randomBytes)(32).toString("base64url")}`;
      const expiresAt = dateValue(data.expiresAt, true);
      if (expiresAt <= /* @__PURE__ */ new Date() || expiresAt.getTime() > Date.now() + 366 * 864e5) throw new Error("Credential expiry must be within one year");
      const row = await tx.integrationCredential.create({ data: {
        organizationId,
        label: boundedText(data.label, "Label", 120),
        partner: boundedText(data.partner, "Partner", 120),
        scopes,
        digest: (0, import_node_crypto15.createHash)("sha256").update(token).digest("hex"),
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  let rows;
  if (kind === "payments") rows = await prisma.membershipPayment.findMany({ where: { organizationId, paymentDate: { gte: start, lt: end } }, take: 5001, orderBy: [{ paymentDate: "asc" }, { id: "asc" }], select: { id: true, amount: true, refundAmount: true, currencyCode: true, status: true, paymentDate: true, stripeInvoiceId: true, stripePaymentIntentId: true } });
  else if (kind === "members") rows = await prisma.member.findMany({ where, take: 5001, orderBy: { id: "asc" }, select: { id: true, name: true, email: true, phone: true, status: true, joinDate: true } });
  else if (kind === "cases") rows = await prisma.operationsCase.findMany({ where, take: 5001, orderBy: { id: "asc" } });
  else throw new Error("Unsupported export");
  if (rows.length > 5e3) throw new Error("Narrow the export window; more than 5000 records match");
  return { schemaVersion: 1, organizationId, kind, from: start, to: end, generatedAt: /* @__PURE__ */ new Date(), basis: kind === "payments" ? "Payment effective date; refundAmount is cumulative, not refund-date cash flow. Reconcile provider fees, payouts and disputes separately." : "Record creation date", rows };
}

// features/keystone/mutations/memberEntitlement.ts
init_membership_credits();
init_prisma_result();
async function refreshMyEntitlement(_root, _args, context) {
  const userId = context.session?.itemId;
  const organizationId = context.session?.data?.organization?.id;
  if (!userId || !organizationId) throw new Error("Authentication required");
  const result = await refreshMemberEntitlement(context, organizationId, userId);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const membership = await prisma.membership.findFirst({ where: { memberId: userId, organizationId }, select: {
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
init_prisma_result();
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
function allowedAppointmentTransitions(status, actor2) {
  const next = TRANSITIONS[status] ?? [];
  if (actor2.canManage || actor2.isOwnCoach) return [...next];
  return actor2.isOwnMember && next.includes("cancelled") ? ["cancelled"] : [];
}
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

// features/keystone/mutations/trainerAppointment.ts
function throwOnKeystonePrismaError3(result) {
  if (result instanceof Error) throw result;
  return result;
}
function trainingActorFromContext(context) {
  const session = context.session;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Authenticated organization session required");
  const role = session.data?.role;
  return { userId: session.itemId, organizationId, canManageAppointments: Boolean(role?.canManageAllRecords || role?.canManageAppointments), canManagePrograms: Boolean(role?.canManageAllRecords || role?.canManagePrograms), canManagePeople: Boolean(role?.canManageAllRecords || role?.canManagePeople), isInstructor: Boolean(role?.isInstructor) };
}
async function createAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
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
    const resourceSetupBufferMs = (resource?.setupBufferMinutes || 0) * 6e4;
    const resourceCleanupBufferMs = (resource?.cleanupBufferMinutes || 0) * 6e4;
    const resourceStartsAt = new Date(window.startTime.getTime() - resourceSetupBufferMs);
    const resourceEndsAt = new Date(window.endTime.getTime() + resourceCleanupBufferMs);
    if (resource) {
      const count = await tx.trainerAppointment.count({ where: { organizationId: actor2.organizationId, resourceId: resource.id, status: { in: ["scheduled", "confirmed", "checked_in"] }, OR: [{ resourceStartsAt: { lt: resourceEndsAt }, resourceEndsAt: { gt: resourceStartsAt } }, { resourceStartsAt: null, ...buildActiveAppointmentOverlapWhere(resourceStartsAt, resourceEndsAt) }] } });
      if (count >= (resource.isExclusive ? 1 : resource.capacity)) throw new Error("Resource is at capacity, including setup/cleanup buffers");
    }
    const classes = await tx.classInstance.findMany({ where: { organizationId: actor2.organizationId, isCancelled: false, date: {
      // HH:MM class schedules are bounded to under 24h; extend both sides by the
      // shared room buffers so an inherited-room class cannot sit outside this scan.
      gte: new Date(resourceStartsAt.getTime() - 864e5 - resourceCleanupBufferMs),
      lt: new Date(resourceEndsAt.getTime() + resourceSetupBufferMs)
    } }, include: { classSchedule: true, resource: true }, take: 1e3 });
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
    throwOnKeystonePrismaError3(await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: member.id, key: `training-booked:${appointment.id}`, kind: "training", message: `${pack.serviceName} is confirmed for ${window.startTime.toISOString()}. One credit was reserved from your training package. Cancel before the start to restore that credit.` }));
    return { appointment: appointmentProjection(appointment), reused: false };
  });
}
async function transitionAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
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
        const site = await tx.location.findFirst({ where: { id: appointment.locationId, organizationId: actor2.organizationId }, select: { isActive: true } });
        if (!site?.isActive) throw new Error("This appointment's location is closed; reschedule it to an open location");
        assertInstructorQualifications(appointment.instructor, now);
        await assertParticipationAllowed(tx, actor2.organizationId, appointment.memberId, now, appointment.locationId);
      }
      if (input.status === "checked_in") data.checkedInAt = now;
      if (input.status === "completed") data.completedAt = now;
    }
    const updated = await tx.trainerAppointment.update({ where: { id: appointment.id }, data });
    throwOnKeystonePrismaError3(await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: appointment.memberId, key: `training-${input.status}:${appointment.id}`, kind: "training", message: `${appointment.serviceName}: ${input.status.replaceAll("_", " ")}. ${input.status === "cancelled" ? "The credit was restored to its original package and expiry." : "Review the appointment in Account \u2192 Training."}` }));
    return { appointment: appointmentProjection(updated), reused: false };
  });
}
function appointmentProjection(row) {
  return { id: row.id, memberId: row.memberId, instructorId: row.instructorId, locationId: row.locationId, trainingPackageId: row.trainingPackageId, serviceName: row.serviceName, startTime: new Date(row.startTime).toISOString(), endTime: new Date(row.endTime).toISOString(), status: row.status, cancellationReason: row.cancellationReason || "", memberNotes: row.memberNotes || "" };
}
async function bookTrainerAppointment(_root, { data }, context) {
  const actor2 = trainingActorFromContext(context);
  const packageId = typeof data?.trainingPackageId === "string" ? data.trainingPackageId : "";
  const pack = packageId ? await guardKeystonePrismaResults(context.prisma).trainingPackage.findFirst({ where: { id: packageId, organizationId: actor2.organizationId }, select: { memberId: true, locationId: true } }) : null;
  if (!pack) throw new Error("Choose a package with available credits");
  return createAtomicTrainerAppointment(context.prisma, { ...data, memberId: pack.memberId, locationId: pack.locationId, actor: actor2 });
}
async function transitionTrainerAppointment(_root, args, context) {
  return transitionAtomicTrainerAppointment(context.prisma, { ...args, actor: trainingActorFromContext(context) });
}
async function rescheduleAtomicTrainerAppointment(prisma, input, now = /* @__PURE__ */ new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
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
    const linkedReplacement = await tx.trainerAppointment.update({ where: { id: result.appointment.id }, data: { replacesAppointmentId: original.id } });
    if (linkedReplacement instanceof Error) throw linkedReplacement;
    return result;
  });
}
async function rescheduleTrainerAppointment(_root, { data }, context) {
  return rescheduleAtomicTrainerAppointment(context.prisma, { ...data, actor: trainingActorFromContext(context) });
}

// features/keystone/mutations/trainingWorkspace.ts
init_operational_notices();
init_prisma_result();
async function getTrainingWorkspace(_root, { skip = 0 }, context) {
  const actor2 = trainingActorFromContext(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 1e4) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma);
  const member = await tx.member.findFirst({ where: { organizationId: actor2.organizationId, userId: actor2.userId }, select: { id: true } });
  const where = { organizationId: actor2.organizationId };
  const memberScope = { ...where, ...actor2.canManageAppointments ? {} : { memberId: member?.id || "__no_member__" } };
  const [packages, appointments, instructors, locations, resources, availability, members, assignments, leads, organization3] = await Promise.all([
    tx.trainingPackage.findMany({ where: memberScope, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 51, skip, select: { id: true, memberId: true, locationId: true, serviceName: true, durationMinutes: true, totalCredits: true, creditsRemaining: true, amount: true, currencyCode: true, expiresAt: true, status: true, terms: true, refundAmount: true } }),
    tx.trainerAppointment.findMany({ where: { ...where, ...actor2.canManageAppointments ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...actor2.isInstructor ? [{ instructor: { userId: actor2.userId } }] : []] } }, orderBy: [{ startTime: "desc" }, { id: "asc" }], take: 51, skip, include: { instructor: { select: { userId: true } } } }),
    tx.instructor.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, userId: true, user: { select: { name: true } } } }),
    tx.location.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true } }),
    tx.gymResource.findMany({ where: { ...where, isActive: true }, take: 100, orderBy: { id: "asc" }, select: { id: true, name: true, locationId: true } }),
    tx.trainerAvailability.findMany({ where, take: 200, orderBy: [{ instructorId: "asc" }, { id: "asc" }], select: { id: true, instructorId: true, locationId: true, type: true, date: true, dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true, isAvailable: true, reason: true } }),
    // Managers choose from the directory; a coach only from members they already train.
    actor2.canManageAppointments || actor2.canManagePrograms || actor2.canManagePeople ? tx.member.findMany({ where, take: 200, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } }) : actor2.isInstructor ? tx.member.findMany({ where: { ...where, status: "active", trainerAppointments: { some: { instructor: { userId: actor2.userId }, status: { in: ["confirmed", "checked_in", "completed"] } } } }, take: 200, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } }) : [],
    tx.coachingAssignment.findMany({ where: { ...where, ...actor2.canManagePrograms ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...actor2.isInstructor ? [{ instructor: { userId: actor2.userId } }] : []] } }, take: 51, skip, orderBy: [{ dueAt: "desc" }, { id: "asc" }], select: { id: true, title: true, instructions: true, dueAt: true, status: true, memberId: true, instructorId: true, memberEvidence: true, review: true, submittedAt: true, reviewedAt: true } }),
    actor2.canManagePeople ? tx.trainingLead.findMany({ where, take: 51, skip, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, name: true, email: true, source: true, status: true, trialAt: true, nextActionAt: true, memberId: true, history: true } }) : [],
    tx.organization.findUnique({ where: { id: actor2.organizationId }, select: { timezone: true } })
  ]);
  const cardPayments = actor2.canManageAppointments ? await counterAttemptsForWorkspace(tx, actor2.organizationId, "training") : [];
  const peopleIds = [...new Set([...appointments.map((row) => row.memberId), ...packages.map((row) => row.memberId)].filter(Boolean))];
  const people = peopleIds.length && (actor2.canManageAppointments || actor2.isInstructor) ? await tx.member.findMany({ where: { ...where, id: { in: peopleIds } }, select: { id: true, name: true } }) : [];
  const personName = new Map(people.map((row) => [row.id, row.name]));
  const ownCoach = new Map(instructors.map((row) => [row.id, row.userId === actor2.userId]));
  const hasMore = appointments.length > 50 || packages.length > 50 || assignments.length > 50 || leads.length > 50;
  return {
    memberId: member?.id,
    canManageAppointments: actor2.canManageAppointments,
    canManagePrograms: actor2.canManagePrograms,
    canManagePeople: actor2.canManagePeople,
    isInstructor: actor2.isInstructor,
    ownInstructorId: instructors.find((row) => row.userId === actor2.userId)?.id ?? null,
    timeZone: organization3?.timezone || "UTC",
    skip,
    hasMore,
    packages: packages.slice(0, 50).map((row) => ({ ...row, memberName: personName.get(row.memberId) ?? null })),
    appointments: appointments.slice(0, 50).map((row) => ({
      ...appointmentProjection(row),
      memberName: personName.get(row.memberId) ?? null,
      allowedTransitions: allowedAppointmentTransitions(row.status, { canManage: actor2.canManageAppointments, isOwnCoach: Boolean(actor2.isInstructor && ownCoach.get(row.instructorId)), isOwnMember: row.memberId === member?.id })
    })),
    instructors: instructors.map((row) => ({ id: row.id, name: row.user?.name || "Instructor" })),
    locations,
    resources,
    availability,
    members: members.map((row) => ({ id: row.id, name: row.name, email: row.email })),
    assignments: assignments.slice(0, 50),
    leads: leads.slice(0, 50),
    cardPayments
  };
}
async function saveTrainerAvailabilityAtomic(prisma, data, actor2) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor2);
  if (!actor2.canManageAppointments) throw new Error("Training management permission required");
  const startTime = trainingText(data.startTime, "Start time", 5), endTime = trainingText(data.endTime, "End time", 5);
  if (minutesOfDay(startTime) >= minutesOfDay(endTime)) throw new Error("Availability must end after it starts on the same local day");
  if (!["recurring", "one_time", "time_off"].includes(data.type)) throw new Error("Invalid availability type");
  if (data.type === "recurring" && (typeof data.dayOfWeek !== "number" || !Number.isInteger(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6)) throw new Error("Choose the weekday for recurring availability");
  const date = data.date ? new Date(data.date) : null;
  if (data.type !== "recurring" && (!date || !Number.isFinite(date.getTime()))) throw new Error("A dated availability needs a date");
  const bound = (value, label) => {
    if (value === void 0) return void 0;
    if (value === null || value === "") return null;
    const parsed = new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date`);
    return parsed;
  };
  const effectiveFrom = bound(data.effectiveFrom, "Effective from");
  const effectiveTo = bound(data.effectiveTo, "Effective until");
  const values = {
    instructorId: data.instructorId,
    locationId: data.locationId,
    type: data.type,
    dayOfWeek: data.type === "recurring" ? data.dayOfWeek : null,
    date,
    startTime,
    endTime,
    isAvailable: data.type !== "time_off" && data.isAvailable !== false,
    reason: trainingText(data.reason || "", "Reason", 1e3, false),
    ...effectiveFrom !== void 0 ? { effectiveFrom } : {},
    ...effectiveTo !== void 0 ? { effectiveTo } : {}
  };
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
      if (values.effectiveFrom === void 0) values.effectiveFrom = row2.effectiveFrom;
      if (values.effectiveTo === void 0) values.effectiveTo = row2.effectiveTo;
    }
    if (values.effectiveFrom && values.effectiveTo && values.effectiveTo <= values.effectiveFrom) throw new Error("Effective until must be after effective from");
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
  prisma = guardKeystonePrismaResults(prisma);
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
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor2);
  const text45 = trainingText(data.text, "Progress or review", 8e3);
  return prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `coaching-assignment:${data.id}`);
    const row = await tx.coachingAssignment.findUnique({ where: { id: data.id }, include: { member: true, instructor: true } });
    assertTrainingTenant(row, actor2, "Coaching assignment");
    const own = row.member?.userId === actor2.userId;
    const coach = actor2.canManagePrograms || actor2.isInstructor && row.instructor?.userId === actor2.userId;
    if (data.status === "submitted") {
      if (!own) throw new Error("Only the assigned member can submit progress");
      if (row.status === "submitted" && row.memberEvidence === text45) return { id: row.id, reused: true };
      if (row.status !== "assigned") throw new Error("Only an assigned task can be submitted");
      const log = await tx.workoutLog.create({ data: { organizationId: actor2.organizationId, memberId: row.memberId, title: row.title, date: /* @__PURE__ */ new Date(), notes: text45 } });
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "submitted", memberEvidence: text45, submittedAt: /* @__PURE__ */ new Date(), workoutLogId: log.id } });
    } else if (data.status === "reviewed") {
      if (!coach) throw new Error("Only the assigned coach or program manager can review");
      if (row.status === "reviewed" && row.review === text45) return { id: row.id, reused: true };
      if (row.status !== "submitted") throw new Error("Progress must be submitted before review");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "reviewed", review: text45, reviewedAt: /* @__PURE__ */ new Date() } });
      await enqueueOperationalNotice(tx, { organizationId: actor2.organizationId, memberId: row.memberId, key: `coaching-reviewed:${row.id}`, kind: "coaching", message: `Your coach reviewed ${row.title}. Open Account \u2192 Training for feedback.` });
    } else if (data.status === "cancelled") {
      if (!coach || row.status !== "assigned") throw new Error("Only unsubmitted coaching work can be cancelled by its coach");
      await tx.coachingAssignment.update({ where: { id: row.id }, data: { status: "cancelled", review: text45 } });
    } else throw new Error("Unknown coaching transition");
    return { id: row.id };
  });
}
async function saveTrainingLeadAtomic(prisma, data, actor2) {
  prisma = guardKeystonePrismaResults(prisma);
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
    const source = trainingText(data.source || row?.source || "operator", "Source", 200);
    const sameInstant = (a, b) => (a ? new Date(a).getTime() : null) === (b ? b.getTime() : null);
    if (history2.length && row?.status === data.status && history2[history2.length - 1]?.note === note && row.name === name && row.source === source && sameInstant(row.trialAt, trialAt || (row.trialAt ? new Date(row.trialAt) : null)) && sameInstant(row.nextActionAt, nextActionAt) && (!data.memberId || row.memberId === data.memberId)) return { id: row.id, reused: true };
    if (history2.length >= 500) throw new Error("Case history limit reached; archive through retention policy");
    const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), actorId: actor2.userId, from: row?.status || null, to: data.status, note };
    const values = { name, status: data.status, source, trialAt: trialAt || row?.trialAt || null, nextActionAt, ...data.status === "converted" ? { memberId: data.memberId } : {}, history: [...history2, entry] };
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
  const actor2 = trainingActorFromContext(ctx);
  if (data?.mode === "startCard") return startTrainingCardSale(ctx, actor2, data);
  if (data?.tender === "card") throw new Error("Card packages are recorded from their card checkout");
  return recordSettledTrainingPackage(ctx.prisma, { ...data, cardPayment: false }, actor2);
}
async function refundTrainingPackage(_r, { data }, ctx) {
  const actor2 = trainingActorFromContext(ctx);
  const prisma = guardKeystonePrismaResults(ctx.prisma);
  const pack = await prisma.trainingPackage.findUnique({ where: { id: String(data?.packageId || "") } });
  if (pack && pack.organizationId === actor2.organizationId && pack.terms?.tender === "card" && pack.status === "active") return startTrainingCardRefund(ctx, actor2, data);
  return recordTrainingPackageRefund(ctx.prisma, data, actor2);
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
var import_node_crypto16 = require("node:crypto");
init_classCapacity();
init_prisma_result();
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
  const prisma = guardKeystonePrismaResults(context.prisma);
  const results = [];
  for (const row of rows) {
    const key = (0, import_node_crypto16.createHash)("sha256").update(JSON.stringify([organizationId, source, row.externalId])).digest("hex");
    const payloadHash = (0, import_node_crypto16.createHash)("sha256").update(JSON.stringify(row)).digest("hex");
    const existing = await prisma.memberImportRecord.findUnique({ where: { key } });
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
      const record = await prisma.$transaction(async (tx) => {
        await lockTransactionKey(tx, `member-import:${key}`);
        const current = await tx.memberImportRecord.findUnique({ where: { key } });
        if (current && current.payloadHash !== payloadHash) throw new Error("Import identity changed concurrently");
        return current || tx.memberImportRecord.create({ data: { organizationId, key, source, externalId: row.externalId, payloadHash, status: "processing" } });
      });
      const member = await inviteMember(null, { data: row }, context);
      await prisma.memberImportRecord.update({ where: { id: record.id }, data: { memberId: member.memberId, status: "completed", completedAt: /* @__PURE__ */ new Date(), lastError: "" } });
      results.push({ externalId: row.externalId, status: "imported", memberId: member.memberId });
    } catch {
      await prisma.memberImportRecord.updateMany({ where: { key, payloadHash, status: { not: "completed" } }, data: { status: "failed", lastError: "Import could not complete; review the identity and retry the same source and external ID" } });
      results.push({ externalId: row.externalId, status: "failed", message: "Import could not complete; review the identity and retry the same source and external ID" });
    }
  }
  return { dryRun: args.dryRun !== false, source, results };
}

// features/keystone/mutations/retailLifecycle.ts
init_prisma_result();
init_classCapacity();
function replay(row, hash) {
  if (row.requestHash !== hash) throw new Error("Request key was already used with different details");
  return { id: row.id, reused: true };
}
async function saveRetailItemAtomic(prisma, data, actor2) {
  assertRetailActor(actor2);
  const name = trainingText(data.name, "Item name", 200), sku = trainingText(data.sku, "SKU", 100), requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason, "Stock adjustment reason", 1e3);
  const unitAmount = trainingInteger(data.unitAmount, "Unit price in USD cents", 0, 1e8), stockDelta = trainingInteger(data.stockDelta, "Stock change", -1e5, 1e5);
  const requestHash = hashTrainerAppointmentRequest({ ...data, name, sku, unitAmount, stockDelta, reason });
  return withKeystonePrismaTransaction(prisma, async (tx) => {
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
  if (!["cash", "external"].includes(tender)) throw new Error("Tender must be cash received or an externally settled payment; use Take card payment for cards");
  const paymentReference = trainingText(data.paymentReference || "", "External settled payment reference", 200, tender !== "cash");
  const settledAmount = trainingInteger(data.settledAmount, "Confirmed received amount in cents", 0, 2e9);
  const requestHash = hashTrainerAppointmentRequest({ locationId: data.locationId, lines, tender, paymentReference, settledAmount });
  return withKeystonePrismaTransaction(prisma, async (tx) => {
    await lockTransactionKey(tx, `retail-request:${actor2.organizationId}:${requestKey}`);
    if (tender !== "cash") await lockTransactionKey(tx, `retail-payment:${actor2.organizationId}:${paymentReference}`);
    await siteLock(tx, actor2, data.locationId);
    const existing = await tx.retailSale.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) return replay(existing, requestHash);
    if (tender !== "cash" && await tx.retailSale.findFirst({ where: { organizationId: actor2.organizationId, paymentReference, tender } })) throw new Error("This payment is already recorded on another sale");
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
  return withKeystonePrismaTransaction(prisma, async (tx) => {
    await lockTransactionKey(tx, `retail-return:${actor2.organizationId}:${requestKey}`);
    if (refundReference) await lockTransactionKey(tx, `retail-refund:${actor2.organizationId}:${refundReference}`);
    await lockTransactionKey(tx, retailSaleLockKey(String(data.saleId || "")));
    const sale = await tx.retailSale.findUnique({ where: { id: data.saleId } });
    sameTenant(sale, actor2, "Sale");
    await siteLock(tx, actor2, sale.locationId, false);
    const existing = await tx.retailReturn.findFirst({ where: { organizationId: actor2.organizationId, requestKey } });
    if (existing) return replay(existing, requestHash);
    if (sale.tender === "card") throw new Error("Card sales refund to the original card; use the card return action");
    if (sale.tender !== "cash" && !refundReference) throw new Error("A settled refund reference is required");
    if (refundReference && await tx.retailReturn.findFirst({ where: { organizationId: actor2.organizationId, refundReference } })) throw new Error("External refund reference is already allocated");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor2.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const unavailable = await unavailableReturnUnits(tx, actor2.organizationId, sale.id);
    let refundAmount = 0;
    const snapshot = [];
    for (const line of lines) {
      const sold = sale.lines.find((row) => row.itemId === line.itemId);
      if (!sold) throw new Error("Returned item was not in this sale");
      if ((unavailable.get(line.itemId) || 0) + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
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
  return withKeystonePrismaTransaction(prisma, async (tx) => {
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
  const actor2 = retailActorFromContext(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 1e4) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma), where = { organizationId: actor2.organizationId };
  const page = { take: 51, skip };
  const [items, sales, returns, closes, locations, stockEntries, cardPayments] = await Promise.all([
    tx.retailItem.findMany({ where, take: 100, orderBy: [{ sku: "asc" }, { id: "asc" }], select: { id: true, locationId: true, sku: true, name: true, unitAmount: true, currencyCode: true, stockOnHand: true, isActive: true } }),
    tx.retailSale.findMany({ where, ...page, orderBy: [{ soldAt: "desc" }, { id: "asc" }], select: { id: true, locationId: true, lines: true, totalAmount: true, tender: true, paymentReference: true, soldAt: true } }),
    tx.retailReturn.findMany({ where, ...page, orderBy: [{ returnedAt: "desc" }, { id: "asc" }], select: { id: true, saleId: true, locationId: true, lines: true, refundAmount: true, tender: true, refundReference: true, reason: true, returnedAt: true } }),
    tx.retailClose.findMany({ where, ...page, orderBy: [{ periodEnd: "desc" }, { id: "asc" }], select: { id: true, locationId: true, periodStart: true, periodEnd: true, openingAmount: true, expectedAmount: true, countedAmount: true, varianceAmount: true, reason: true, evidence: true } }),
    tx.location.findMany({ where, take: 100, select: { id: true, name: true, isActive: true } }),
    tx.retailStockEntry.findMany({ where, ...page, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, itemId: true, quantity: true, balanceAfter: true, reason: true, createdAt: true } }),
    counterAttemptsForWorkspace(tx, actor2.organizationId, "retail")
  ]);
  const hasMore = [sales, returns, closes, stockEntries].some((rows) => rows.length > 50);
  const trim = (rows) => rows.slice(0, 50);
  return { items, sales: trim(sales), returns: trim(returns), closes: trim(closes), locations, stockEntries: trim(stockEntries), cardPayments, skip, hasMore };
}
var retailTypeDefs = `extend type Query { retailWorkspace(skip: Int = 0): JSON! } extend type Mutation { saveRetailItem(data: JSON!): JSON! sellRetail(data: JSON!): JSON! returnRetail(data: JSON!): JSON! closeRetail(data: JSON!): JSON! }`;
async function saveRetailItem(_r, { data }, context) {
  return saveRetailItemAtomic(context.prisma, data, retailActorFromContext(context));
}
async function sellRetail(_r, { data }, context) {
  const actor2 = retailActorFromContext(context);
  if (data?.mode === "startCard") return startRetailCardSale(context, actor2, data);
  if (data?.tender === "card") throw new Error("Card sales are recorded from their card checkout");
  return sellRetailAtomic(context.prisma, data, actor2);
}
async function returnRetail(_r, { data }, context) {
  const actor2 = retailActorFromContext(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const sale = await prisma.retailSale.findUnique({ where: { id: String(data?.saleId || "") } });
  if (sale && sale.organizationId === actor2.organizationId && sale.tender === "card") return startRetailCardRefund(context, actor2, data);
  return returnRetailAtomic(context.prisma, data, actor2);
}
async function closeRetail(_r, { data }, context) {
  return closeRetailAtomic(context.prisma, data, retailActorFromContext(context));
}

// features/keystone/mutations/index.ts
var graphql7 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: [graphql7`
      type Query {
        gymSettingsEditor: JSON!
        operationsWorkspace(caseAfterId: ID): JSON!
        participationWorkspace: JSON!
        exportOperatingData(kind: String!, from: String!, to: String!): JSON!
        redirectToInit: Boolean
        checkClassAvailability(classInstanceId: ID!): ClassAvailabilityResult!
        getBillingStats: BillingStats!
        billingWorkspace(q: String, recoverySkip: Int, failedSkip: Int, planSkip: Int, refundSkip: Int): JSON!
        memberProfile: MemberProfileProjection!
        memberCheckInCode: MemberCheckInCode!
        schedulingWorkspace(start: DateTime!, end: DateTime!, userId: ID): JSON!
        instructorAccount: JSON
        instructorClaimQueue: JSON!
        rosterSessions(q: String, state: String, from: String, to: String, sort: String, skip: Int): JSON!
        rosterDetail(classInstanceId: ID!): JSON
        frontDeskWorkspace(query: String, visitQuery: String, visitLocationId: ID, visitOrder: String, visitSkip: Int): JSON!
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
          skip: Int
        ): JSON!

        publicGymSettings: PublicGymSettings
        storefrontOrganization: ID
        publicGymClassTypes(limit: Int = 50, skip: Int = 0): [PublicGymClassType!]!
        publicGymClassType(id: ID!): PublicGymClassType
        publicGymSchedules(dayOfWeek: String, instructorId: ID, limit: Int = 50): [PublicGymSchedule!]!
        publicGymSchedule(id: ID!): PublicGymSchedule
        publicGymClassInstances(
          from: DateTime
          to: DateTime
          scheduleId: ID
          instructorId: ID
          classTypeId: ID
          locationId: ID
          skip: Int = 0
          limit: Int = 50
        ): [PublicGymClassInstance!]!
        publicGymClassInstance(id: ID!): PublicGymClassInstance
        publicGymInstructors(limit: Int = 50, skip: Int = 0): [PublicGymInstructor!]!
        publicGymInstructor(id: ID!): PublicGymInstructor
        publicGymMembershipTiers(limit: Int = 50, skip: Int = 0): [PublicGymMembershipTier!]!
        publicGymMembershipTier(id: ID!): PublicGymMembershipTier
      }

      type PublicGymSettings {
        id: ID!
        name: String!
        tagline: String
        logoIcon: String
        logoColor: String!
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
        participationTerms: JSON
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

      type PublicGymLocation {
        id: ID!
        name: String!
        address: String
      }

      type PublicGymClassInstance {
        id: ID!
        startsAt: String!
        schedule: PublicGymSchedule
        instructor: PublicGymInstructor
        location: PublicGymLocation
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
        features: [String!]!
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
        upsertGymSettings(data: GymSettingsUpdateInput!, expectedUpdatedAt: String): GymSettings!
        publishGymParticipationTerms(text: String!, expectedPolicyId: ID): JSON
        runDeterministicOnboarding(template: String!, data: JSON): OnboardingRunResult!
        registerMember(data: RegisterMemberInput!): User
        inviteMember(data: InviteMemberInput!): InviteMemberResult!
        setMemberAccountStatus(memberId: ID!, status: String!): Member!
        prepareInstructorAccount(instructorId: ID!, email: String!, delivery: String): AccessLinkResult!
        issueMemberAccessLink(memberId: ID!, delivery: String): AccessLinkResult!
        updateMemberProfile(data: MemberProfileUpdateInput!): MemberProfileProjection!
        changeMemberPassword(currentPassword: String!, newPassword: String!, confirmPassword: String!): Boolean!
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
        updatedAt: String
      }

      input MemberProfileUpdateInput {
        name: String
        email: String
        currentPassword: String
        expectedUpdatedAt: String
        phone: String
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

      type AccessLinkResult {
        userId: ID
        email: String!
        delivered: String!
        url: String
        expiresAt: String!
      }

      type SchedulingGenerationResult {
        success: Boolean!
        createdCount: Int!
        skippedNonexistent: Int!
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
        reference: String
        sourcePath: String
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
        readiness: JSON
        skippedSessions: JSON
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
    `, trainingWorkspaceTypeDefs, retailTypeDefs, counterPaymentTypeDefs],
    resolvers: {
      Query: {
        retailWorkspace,
        gymSettingsEditor,
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
        instructorClaimQueue,
        rosterSessions: getRosterSessions,
        rosterDetail: getRosterDetail,
        frontDeskWorkspace: getFrontDeskWorkspace,
        reportsDashboard: getReportsDashboard,
        kioskSearchMembers,
        discoveryClasses: getDiscoveryClasses,
        publicGymSettings: getPublicGymSettings,
        storefrontOrganization: (_root, _args, context) => publicOrganizationId(context),
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
        reconcileCounterPayment,
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
        publishGymParticipationTerms,
        runDeterministicOnboarding,
        registerMember,
        inviteMember,
        setMemberAccountStatus,
        prepareInstructorAccount,
        issueMemberAccessLink,
        updateMemberProfile,
        changeMemberPassword,
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

// features/keystone/security/graphql-limits.ts
var import_graphql3 = require("graphql");

// lib/list-pagination.ts
var MAX_GRAPHQL_LIST_TAKE = 5001;

// features/keystone/security/graphql-limits.ts
function withGraphqlListMaxTake(models2) {
  return Object.fromEntries(Object.entries(models2).map(([key, value]) => {
    const configuredMaxTake = value.graphql?.maxTake;
    if (configuredMaxTake !== void 0 && (!Number.isSafeInteger(configuredMaxTake) || configuredMaxTake < 1)) {
      throw new RangeError(`${key}.graphql.maxTake must be a positive safe integer`);
    }
    return [key, {
      ...value,
      graphql: {
        ...value.graphql,
        maxTake: Math.min(configuredMaxTake ?? MAX_GRAPHQL_LIST_TAKE, MAX_GRAPHQL_LIST_TAKE)
      }
    }];
  }));
}

// features/keystone/index.ts
var isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
var strictConfig = !isNextBuild && process.env.NODE_ENV === "production" || process.env.GYM_STRICT_CONFIG === "true";
if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
  console.error("PUBLIC_SIGNUPS_ALLOWED=true is not supported for Gym; dashboard signup stays refused. Set it to false.");
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
var DEVELOPMENT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/openfront_gym_dev";
if (strictConfig && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured in strict mode.");
}
var databaseURL = process.env.DATABASE_URL || DEVELOPMENT_DATABASE_URL;
if (!/^postgres(ql)?:\/\//.test(databaseURL)) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL (postgresql://\u2026).");
}
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: requiredSecret("SESSION_SECRET") || "local-only-session-secret-for-tests"
};
function capabilityWarnings() {
  const warnings = [];
  const missing = (name, min = 1) => !process.env[name] || process.env[name].trim().length < min;
  for (const flag of ["STRIPE_ENABLED", "MAIL_ENABLED"]) {
    const value = process.env[flag]?.trim().toLowerCase();
    if (value !== void 0 && value !== "true" && value !== "false") warnings.push(`${flag} must be true or false; treating it as false`);
  }
  if (process.env.STRIPE_ENABLED === "true" && (missing("STRIPE_SECRET_KEY", 32) || missing("STRIPE_WEBHOOK_SECRET", 32))) warnings.push("Stripe is enabled without STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; card payments are unavailable");
  if (process.env.MAIL_ENABLED === "true" && (missing("SMTP_HOST") || missing("SMTP_FROM"))) warnings.push("Mail is enabled without SMTP_HOST and SMTP_FROM; email is unavailable");
  if ((process.env.STRIPE_ENABLED === "true" || process.env.MAIL_ENABLED === "true") && missing("NEXTAUTH_URL")) warnings.push("NEXTAUTH_URL (the public site origin) is required for payment returns and email links");
  if ((process.env.KIOSK_API_TOKEN || process.env.KIOSK_ORGANIZATION_ID) && (missing("KIOSK_API_TOKEN", 32) || missing("KIOSK_ORGANIZATION_ID"))) warnings.push("Kiosk needs both KIOSK_API_TOKEN (32+ characters) and KIOSK_ORGANIZATION_ID; kiosk is unavailable");
  if ((process.env.DISCOVERY_API_KEY || process.env.DISCOVERY_ORGANIZATION_ID || process.env.DISCOVERY_API_SCOPES) && (missing("DISCOVERY_API_KEY", 32) || missing("DISCOVERY_ORGANIZATION_ID") || missing("DISCOVERY_API_SCOPES"))) warnings.push("Partner discovery is partly configured; it stays unavailable");
  if (missing("QR_CODE_SECRET", 32)) warnings.push("QR_CODE_SECRET is not set; member check-in codes are unavailable");
  if (process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true" && (missing("PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID") || missing("STOREFRONT_ORGANIZATION_ID"))) warnings.push("Public member signup needs PUBLIC_MEMBER_SIGNUP_ORGANIZATION_ID and STOREFRONT_ORGANIZATION_ID; signup is unavailable");
  return warnings;
}
if (strictConfig) for (const warning of capabilityWarnings()) console.warn(`[gym config] ${warning}`);
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
    tokensValidForMins: 60,
    async sendToken(args) {
      const user = await args.context.sudo().query.User.findOne({ where: { id: String(args.itemId) }, query: "role { canAccessDashboard }" });
      await sendPasswordResetEmail(args.token, args.identity, user?.role?.canAccessDashboard ? "dashboard" : "storefront");
    }
  },
  sessionData: `
    name
    email
    onboardingStatus
    organization {
      id
      name
      status
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
  (0, import_core45.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: withGraphqlListMaxTake(models),
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
