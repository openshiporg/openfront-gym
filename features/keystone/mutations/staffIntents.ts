import crypto from "node:crypto";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";

/**
 * Durable record of a submitted form request (see models/StaffIntent). The form is recorded
 * before the operation is sent; a retry after a lost or failed response reuses exactly that
 * record and key. Only the person who submitted it, in the same organization, can read, retry
 * or discard it, and the values are cleared once the request is confirmed or discarded.
 */

const WORKSPACES = new Set(["retail", "training", "billing"]);
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,60}$/;
const SCOPE = /^[A-Za-z0-9_:-]{0,120}$/;
const KEY = /^[A-Za-z0-9-]{12,200}$/;
const MAX_FORM_BYTES = 64_000;
const RETENTION_MS = 7 * 86_400_000;

function actorOf(context: any) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Sign in again to continue");
  return { userId: String(session.itemId), organizationId: String(organizationId) };
}

/** Exact submitted values: string fields only, in a stable order for hashing. */
function normalizeForm(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This request can't be recorded");
  const entries: Array<[string, string[]]> = [];
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_:.-]{1,120}$/.test(name)) continue;
    const values = (Array.isArray(raw) ? raw : [raw]).filter((item): item is string => typeof item === "string");
    if (values.length) entries.push([name, values]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  const form = Object.fromEntries(entries);
  if (Buffer.byteLength(JSON.stringify(form)) > MAX_FORM_BYTES) throw new Error("This form is too large to record; shorten the text and try again");
  return form;
}

const hashForm = (form: Record<string, string[]>) => crypto.createHash("sha256").update(JSON.stringify(form)).digest("hex");

function view(row: any) {
  return {
    id: row.id, workspace: row.workspace, operation: row.operation, scope: row.scope || "", requestKey: row.requestKey,
    form: row.status === "pending" ? row.form || {} : {}, status: row.status, lastError: row.lastError || "", createdAt: row.createdAt,
  };
}

export async function beginStaffIntent(
  _root: unknown,
  { workspace, operation, scope, requestKey, form }: { workspace: string; operation: string; scope?: string | null; requestKey: string; form: unknown },
  context: any,
) {
  const actor = actorOf(context);
  if (!WORKSPACES.has(workspace) || !NAME.test(operation) || !SCOPE.test(scope || "") || !KEY.test(requestKey)) throw new Error("This request can't be recorded");
  const values = normalizeForm(form);
  const requestHash = hashForm(values);
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `staff-intent:${actor.organizationId}:${requestKey}`);
    const existing = await tx.staffIntent.findFirst({ where: { organizationId: actor.organizationId, requestKey } });
    if (existing) {
      if (existing.actorId !== actor.userId || existing.workspace !== workspace || existing.operation !== operation || (existing.scope || "") !== (scope || "")) throw new Error("This request key belongs to another request");
      if (existing.status === "pending" && existing.requestHash !== requestHash) throw new Error("This request was already started with different details");
      return view(existing);
    }
    const created = await tx.staffIntent.create({ data: {
      organizationId: actor.organizationId, actorId: actor.userId, workspace, operation, scope: scope || "", requestKey, requestHash,
      form: values, status: "pending", expiresAt: new Date(Date.now() + RETENTION_MS),
    } });
    return view(created);
  });
}

async function ownIntent(context: any, id: string) {
  const actor = actorOf(context);
  if (typeof id !== "string" || !id || id.length > 100) return null;
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const row = await prisma.staffIntent.findFirst({ where: { id, organizationId: actor.organizationId, actorId: actor.userId } });
  return row && (row.status !== "pending" || !row.expiresAt || new Date(row.expiresAt) > new Date()) ? row : null;
}

export async function getStaffIntent(_root: unknown, { id }: { id: string }, context: any) {
  const row = await ownIntent(context, id);
  return row ? view(row) : null;
}

/** The person's own unconfirmed requests in a workspace, so a request whose response never arrived can be resumed. */
export async function getMyPendingStaffIntents(_root: unknown, { workspace }: { workspace: string }, context: any) {
  const actor = actorOf(context);
  if (!WORKSPACES.has(workspace)) return [];
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const rows = await prisma.staffIntent.findMany({
    where: { organizationId: actor.organizationId, actorId: actor.userId, workspace, status: "pending", expiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20,
    select: { id: true, workspace: true, operation: true, scope: true, requestKey: true, status: true, lastError: true, createdAt: true },
  });
  return rows.map((row: any) => ({ ...row, form: {} }));
}

/**
 * Records the outcome a form saw: "failed" keeps the request pending with its error; "succeeded"
 * and "abandoned" resolve it and clear its values. Discarding is refused while an unresolved card
 * checkout opened by the request is still open, so a card sale is never re-entered as cash.
 */
export async function settleStaffIntent(_root: unknown, { id, outcome, error }: { id: string; outcome: string; error?: string | null }, context: any) {
  const actor = actorOf(context);
  if (!["failed", "succeeded", "abandoned"].includes(outcome)) throw new Error("Unknown outcome");
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    const row = await tx.staffIntent.findFirst({ where: { id, organizationId: actor.organizationId, actorId: actor.userId } });
    if (!row) throw new Error("This request is no longer available");
    await lockTransactionKey(tx, `staff-intent:${actor.organizationId}:${row.requestKey}`);
    if (row.status !== "pending") return view(row);
    if (outcome === "failed") {
      return view(await tx.staffIntent.update({ where: { id: row.id }, data: { lastError: String(error || "").slice(0, 1000) } }));
    }
    if (outcome === "abandoned") {
      const card = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, requestKey: row.requestKey, status: { in: ["reserved", "open", "exception", "compensating", "refund_pending"] } }, select: { id: true } });
      if (card) throw new Error("This request opened a card payment that isn't settled. Finish or cancel it in Card payments first.");
    }
    return view(await tx.staffIntent.update({ where: { id: row.id }, data: { status: outcome, form: {}, resolvedAt: new Date(), lastError: "" } }));
  });
}

/**
 * For operations whose only idempotency is the form's request key: inside the operation's own
 * transaction, returns the recorded result of an already-confirmed request with that key, or
 * null. Call recordIntentResult in the same transaction after the write.
 */
export async function confirmedIntentResult(tx: any, organizationId: string, requestKey: unknown) {
  if (typeof requestKey !== "string" || !KEY.test(requestKey)) return null;
  await lockTransactionKey(tx, `staff-intent:${organizationId}:${requestKey}`);
  const row = await tx.staffIntent.findFirst({ where: { organizationId, requestKey }, select: { status: true, result: true } });
  return row?.status === "succeeded" && row.result && Object.keys(row.result).length ? row.result : null;
}

export async function recordIntentResult(tx: any, organizationId: string, requestKey: unknown, result: Record<string, string>) {
  if (typeof requestKey !== "string" || !KEY.test(requestKey)) return;
  await tx.staffIntent.updateMany({ where: { organizationId, requestKey, status: "pending" }, data: { status: "succeeded", result, form: {}, resolvedAt: new Date() } });
}

export const staffIntentTypeDefs = `
  extend type Query {
    staffIntent(id: ID!): JSON
    myPendingStaffIntents(workspace: String!): [JSON!]!
  }
  extend type Mutation {
    beginStaffIntent(workspace: String!, operation: String!, scope: String, requestKey: String!, form: JSON!): JSON!
    settleStaffIntent(id: ID!, outcome: String!, error: String): JSON!
  }
`;
