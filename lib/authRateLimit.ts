import { createHash } from "node:crypto";

export function rateLimitStorageKey(key: string) {
  const bounded = key.trim().slice(0, 200);
  if (!bounded) return "";
  if (bounded.endsWith(":global") || bounded === "global") return bounded;
  return `bucket:${createHash("sha256").update(bounded).digest("hex")}`;
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
  return prisma.$transaction(async (transaction: any) => {
    await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`auth-rate:${boundedKey}`}, 0))) AS acquired`;
    const existing = await transaction.authRateLimitBucket.findUnique({ where: { key: boundedKey } });
    if (!existing || existing.resetAt <= now) {
      if (boundedKey.endsWith(":global") || boundedKey === "global") {
        await transaction.authRateLimitBucket.deleteMany({
          where: { resetAt: { lt: now }, key: { not: boundedKey } },
        });
      }
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

export function normalizeAuthIdentity(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}
