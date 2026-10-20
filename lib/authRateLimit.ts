import { createHash } from "node:crypto";
import { guardKeystonePrismaResults } from "../features/keystone/lib/prisma-result";

/**
 * Abuse budgets are scoped to a client source and/or the identity involved; there is no
 * application-wide bucket. A budget key is a structured tuple (namespace, identity, source…),
 * so no part can run into another, and the whole tuple is hashed before anything is bounded:
 * a long email never pushes the source out of its own key.
 */
export function budgetKey(namespace: string, ...parts: Array<string | number | null | undefined>) {
  return JSON.stringify([namespace, ...parts.map((part) => (part == null ? "" : String(part)))]);
}

export function rateLimitStorageKey(key: string) {
  if (!key.trim()) return "";
  return `bucket:${createHash("sha256").update(key).digest("hex")}`;
}

/** Whether `key` still has budget, without spending any (used before checking a credential). */
export async function authAttemptAvailable(prisma: any, key: string, limit: number, now = new Date()) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return false;
  const existing = await guardKeystonePrismaResults(prisma).authRateLimitBucket.findUnique({ where: { key: boundedKey } });
  return !existing || existing.resetAt <= now || existing.count < limit;
}

export async function consumeAuthAttempt(
  prisma: any,
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return false;
  const guardedPrisma = guardKeystonePrismaResults(prisma);
  return guardedPrisma.$transaction(async (transaction: any) => {
    await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`auth-rate:${boundedKey}`}, 0))) AS acquired`;
    const existing = await transaction.authRateLimitBucket.findUnique({ where: { key: boundedKey } });
    if (!existing || existing.resetAt <= now) {
      // Opportunistic retention: expired buckets carry no information.
      await transaction.authRateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) }, key: { not: boundedKey } } });
      await transaction.authRateLimitBucket.upsert({
        where: { key: boundedKey },
        create: { key: boundedKey, count: 1, resetAt: new Date(now.getTime() + windowMs) },
        update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      });
      return true;
    }
    if (existing.count >= limit) return false;
    await transaction.authRateLimitBucket.update({ where: { key: boundedKey }, data: { count: { increment: 1 } } });
    return true;
  });
}

/**
 * Admission for budgets that count failures: the attempt is reserved atomically before the
 * credential is checked (so parallel attempts cannot all pass a separate "available" check), and
 * released again when it succeeds. Returns false when the budget is already spent.
 */
export async function reserveAuthAttempt(prisma: any, key: string, limit: number, windowMs: number, now = new Date()) {
  return consumeAuthAttempt(prisma, key, limit, windowMs, now);
}

export async function releaseAuthAttempt(prisma: any, key: string) {
  const boundedKey = rateLimitStorageKey(key);
  if (!boundedKey) return;
  await guardKeystonePrismaResults(prisma).authRateLimitBucket.updateMany({ where: { key: boundedKey, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
}

export function normalizeAuthIdentity(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}
