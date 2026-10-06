import { createHash, randomUUID } from "node:crypto";
import type { Context } from ".keystone/types";
import { reviewFutureMembershipBookings } from "../lib/membership-credits";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { lockTransactionKey } from "./classCapacity";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

export type MembershipBillingOperation = "cancel" | "freeze" | "unfreeze" | "tier-change";

type AttemptScope = {
  organizationId: string;
  membershipId: string;
  operation: MembershipBillingOperation;
  idempotencyKey: string;
  requestHash: string;
};

type MembershipBillingExpectation = Partial<{
  status: string;
  autoRenew: boolean;
  stripeSubscriptionId: string | null;
  tierId: string | null;
}>;

type ClaimedAttempt = AttemptScope & {
  attemptId: string;
  claimToken: string;
  generation: number;
  providerIdempotencyKey: string;
  replay: boolean;
};

const LEASE_MS = 10 * 60 * 1000;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function membershipBillingRequestHash(
  operation: MembershipBillingOperation,
  evidence: Record<string, unknown>,
) {
  return createHash("sha256").update(canonicalJson({ operation, evidence })).digest("hex");
}

function normalizeScope(scope: AttemptScope): AttemptScope {
  const idempotencyKey = scope.idempotencyKey.trim();
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("A unique billing idempotency key is required");
  }
  if (!/^[a-f0-9]{64}$/.test(scope.requestHash)) throw new Error("Billing request evidence is invalid");
  return { ...scope, idempotencyKey };
}

function providerIdempotencyKey(scope: AttemptScope) {
  const digest = createHash("sha256")
    .update(`${scope.organizationId}:${scope.membershipId}:${scope.operation}:${scope.idempotencyKey}`)
    .digest("hex");
  return `gym-membership-${scope.operation}:${digest}`;
}

function uniqueAttemptWhere(scope: AttemptScope) {
  return {
    organizationId_membershipId_operation_idempotencyKey: {
      organizationId: scope.organizationId,
      membershipId: scope.membershipId,
      operation: scope.operation,
      idempotencyKey: scope.idempotencyKey,
    },
  };
}

function assertMatchingEvidence(attempt: any, requestHash: string) {
  if (attempt && attempt.requestHash !== requestHash) {
    throw new Error("This billing idempotency key was already used with different request evidence");
  }
}

export async function isCompletedMembershipBillingAttempt(context: Context, rawScope: AttemptScope) {
  const scope = normalizeScope(rawScope);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const attempt = await prisma.membershipBillingAttempt.findUnique({
    where: uniqueAttemptWhere(scope),
    select: { requestHash: true, status: true },
  });
  assertMatchingEvidence(attempt, scope.requestHash);
  return attempt?.status === "completed";
}

export async function claimMembershipBillingAttempt(
  context: Context,
  rawScope: AttemptScope,
  expectedMembership: MembershipBillingExpectation = {},
): Promise<ClaimedAttempt> {
  const scope = normalizeScope(rawScope);
  const claimToken = randomUUID();
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (transaction: any) => {
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
        billingGeneration: true,
      },
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
        select: { id: true },
      });
      if (member instanceof Error) throw member;
      if (!member?.id) throw new Error("Membership member not found");
      // Serialize publishing the pending freeze fence with class/check-in writes.
      await lockTransactionKey(transaction, `member:${member.id}`);
    }

    const existing = await transaction.membershipBillingAttempt.findUnique({
      where: uniqueAttemptWhere(scope),
    });
    assertMatchingEvidence(existing, scope.requestHash);
    if (existing?.status === "completed") {
      return {
        ...scope,
        attemptId: existing.id,
        claimToken: existing.claimToken,
        generation: existing.generation,
        providerIdempotencyKey: providerIdempotencyKey(scope),
        replay: true,
      };
    }
    const unresolvedRemote = await transaction.membershipBillingAttempt.findFirst({
      where: { organizationId: scope.organizationId, membershipId: scope.membershipId, operation: { in: ["freeze", "tier-change"] }, status: "processing" },
      select: { id: true, operation: true },
    });
    if (unresolvedRemote instanceof Error) throw unresolvedRemote;
    if (unresolvedRemote && unresolvedRemote.id !== existing?.id) {
      if (unresolvedRemote.operation === "freeze") {
        throw new Error("Retry the pending freeze with its original idempotency key before another billing change");
      }
      throw new Error("Retry the pending membership tier change with its original idempotency key before another billing change");
    }

    const now = new Date();
    const active = await transaction.membershipBillingAttempt.findFirst({
      where: {
        organizationId: scope.organizationId,
        membershipId: scope.membershipId,
        status: "processing",
        leaseUntil: { gt: now },
      },
      select: { id: true },
    });
    if (active) throw new Error("Another billing operation is processing; retry shortly");

    // A newer membership-wide claim must invalidate every expired worker,
    // including attempts with a different operation or caller key. Otherwise
    // an old row retains a valid token and can finalize over newer provider
    // truth after its lease has expired.
    await transaction.membershipBillingAttempt.updateMany({
      where: {
        organizationId: scope.organizationId,
        membershipId: scope.membershipId,
        status: "processing",
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: "failed",
        leaseUntil: null,
        lastError: "Superseded by a newer membership billing generation",
      },
    });

    const generation = membership.billingGeneration + 1;
    const generationUpdate = await transaction.membership.updateMany({
      where: {
        id: scope.membershipId,
        organizationId: scope.organizationId,
        billingGeneration: membership.billingGeneration,
      },
      data: { billingGeneration: generation },
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
      completedAt: null,
    };
    const attempt = existing
      ? await transaction.membershipBillingAttempt.update({ where: { id: existing.id }, data })
      : await transaction.membershipBillingAttempt.create({
          data: {
            organizationId: scope.organizationId,
            membershipId: scope.membershipId,
            operation: scope.operation,
            idempotencyKey: scope.idempotencyKey,
            ...data,
          },
        });
    return {
      ...scope,
      attemptId: attempt.id,
      claimToken,
      generation,
      providerIdempotencyKey: providerIdempotencyKey(scope),
      replay: false,
    };
  });
}

export async function finishMembershipBillingAttempt(
  context: Context,
  claim: ClaimedAttempt,
  membershipData: Record<string, unknown>,
  finalizeRelated?: (transaction: any, membership: any) => Promise<void>,
) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const finalized = await prisma.$transaction(async (transaction: any) => {
    await lockTransactionKey(transaction, `membership-billing:${claim.organizationId}:${claim.membershipId}`);
    const attempt = await transaction.membershipBillingAttempt.findUnique({ where: { id: claim.attemptId } });
    if (
      !attempt ||
      attempt.organizationId !== claim.organizationId ||
      attempt.membershipId !== claim.membershipId ||
      attempt.operation !== claim.operation ||
      attempt.idempotencyKey !== claim.idempotencyKey ||
      attempt.requestHash !== claim.requestHash ||
      attempt.status !== "processing" ||
      attempt.claimToken !== claim.claimToken ||
      attempt.generation !== claim.generation
    ) return false;

    const membership = await transaction.membership.findFirst({ where: { id: claim.membershipId, organizationId: claim.organizationId } });
    const member = membership && await transaction.member.findFirst({ where: { organizationId: claim.organizationId, userId: membership.memberId } });
    if (!member) throw new Error("Membership member disappeared while finalizing billing");
    await lockTransactionKey(transaction, `member:${member.id}`);
    const membershipUpdate = await transaction.membership.updateMany({
      where: {
        id: claim.membershipId,
        organizationId: claim.organizationId,
        billingGeneration: claim.generation,
      },
      data: membershipData,
    });
    if (membershipUpdate.count !== 1) throw new Error("Membership disappeared while finalizing billing operation");
    const updated = await transaction.membership.findFirst({ where: { id: claim.membershipId, organizationId: claim.organizationId } });
    if (!updated) throw new Error("Membership disappeared while finalizing billing operation");
    if (finalizeRelated) await finalizeRelated(transaction, updated);
    await reviewFutureMembershipBookings(transaction, updated);
    await enqueueOperationalNotice(transaction, { organizationId: claim.organizationId, memberId: member.id,
      key: `billing:${claim.attemptId}`, kind: "membership", message: `Membership ${claim.operation} completed. Review your membership and affected bookings.` });
    const attemptUpdate = await transaction.membershipBillingAttempt.updateMany({
      where: {
        id: claim.attemptId,
        status: "processing",
        claimToken: claim.claimToken,
        generation: claim.generation,
      },
      data: { status: "completed", leaseUntil: null, lastError: "", completedAt: new Date() },
    });
    if (attemptUpdate.count !== 1) throw new Error("Billing operation claim was lost while finalizing");
    return true;
  });
  if (!finalized) throw new Error("Billing operation claim was replaced; retry with the same idempotency key");
}

export async function failMembershipBillingAttempt(
  context: Context,
  claim: ClaimedAttempt,
  error: unknown,
  providerOutcome: "definite" | "unknown" = "definite",
) {
  const lastError = error instanceof Error ? error.message.slice(0, 2000) : "Billing operation failed";
  const data = ["freeze", "tier-change"].includes(claim.operation) && providerOutcome === "unknown"
    ? { lastError }
    : { status: "failed", leaseUntil: null, lastError };
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  await prisma.membershipBillingAttempt.updateMany({
    where: {
      id: claim.attemptId,
      organizationId: claim.organizationId,
      membershipId: claim.membershipId,
      status: "processing",
      claimToken: claim.claimToken,
    },
    data,
  });
}
