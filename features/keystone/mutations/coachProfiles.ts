import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

const PAGE = 25;

/**
 * Accounts that can become coach profiles: this organization's accounts whose current role is an
 * instructor role and that have no coach profile yet, searched and paged in the query. Creating
 * the profile still goes through the Instructor list's own validation.
 */
export async function eligibleCoachAccounts(_root: unknown, { q, skip = 0 }: { q?: string | null; skip?: number | null }, context: any) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Coach management permission required");
  const offset = Number.isSafeInteger(skip) && (skip as number) > 0 ? Math.min(skip as number, 1_000_000) : 0;
  const search = String(q || "").trim().slice(0, 100);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const linked = await prisma.instructor.findMany({ where: { organizationId: actor.organizationId, userId: { not: null } }, select: { userId: true } });
  const rows = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      role: { isInstructor: true, organizationId: actor.organizationId },
      id: { notIn: linked.map((row: any) => row.userId).filter(Boolean) },
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }], skip: offset, take: PAGE + 1,
    select: { id: true, name: true, email: true },
  });
  return { accounts: rows.slice(0, PAGE), hasMore: rows.length > PAGE, skip: offset, pageSize: PAGE, q: search };
}

/** Creates the coach profile for one eligible account through the Instructor list (access and hooks apply). */
export async function createCoachProfile(_root: unknown, { userId }: { userId: string }, context: any) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Coach management permission required");
  const created = await context.db.Instructor.createOne({
    data: { user: { connect: { id: String(userId) } }, organization: { connect: { id: actor.organizationId } }, isActive: true },
  });
  return { id: created.id };
}

export const coachProfileTypeDefs = `
  extend type Query { eligibleCoachAccounts(q: String, skip: Int): JSON! }
  extend type Mutation { createCoachProfile(userId: ID!): JSON! }
`;
