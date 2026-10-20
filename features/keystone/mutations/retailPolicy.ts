import type { Context } from ".keystone/types";
import { getTenantId } from "../access/tenantPolicy";
import { lockTransactionKey } from "./classCapacity";
import { trainingInteger, trainingText } from "./trainingPolicy";

export type RetailActor = { userId: string; organizationId: string; canManageRetail: boolean };

export function assertRetailActor(actor: RetailActor) {
  if (!actor.userId || !actor.organizationId || !actor.canManageRetail) throw new Error("Retail management permission required");
}

export function retailActorFromContext(context: Context): RetailActor {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  const actor = { userId: session?.itemId || "", organizationId: organizationId || "", canManageRetail: Boolean(session?.data?.role?.canManageAllRecords || session?.data?.role?.canManageRetail) };
  assertRetailActor(actor);
  return actor;
}

export function sameTenant(row: any, actor: { organizationId: string }, label: string) {
  if (!row || row.organizationId !== actor.organizationId) throw new Error(`${label} not found in this organization`);
}

export async function siteLock(tx: any, actor: { organizationId: string }, locationId: string, requireActive = true) {
  await lockTransactionKey(tx, `retail:${actor.organizationId}:${locationId}`);
  const site = await tx.location.findUnique({ where: { id: locationId } });
  sameTenant(site, actor, "Location");
  if (requireActive && !site.isActive) throw new Error("Location is inactive");
  return site;
}

/** Every return path serializes on the sale so returned units are never counted twice. */
export function retailSaleLockKey(saleId: string) {
  return `retail-sale:${saleId}`;
}

export function requestLines(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("A sale/return needs 1-100 lines");
  const ids = new Set<string>();
  return value.map((row: any) => {
    const itemId = trainingText(row.itemId, "Item", 200);
    if (ids.has(itemId)) throw new Error("Combine duplicate item lines");
    ids.add(itemId);
    return { itemId, quantity: trainingInteger(row.quantity, "Quantity", 1, 10_000), restock: row.restock === true };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/** Units already returned or reserved by an unresolved card refund, per item. */
export async function unavailableReturnUnits(tx: any, organizationId: string, saleId: string, excludeAttemptId?: string) {
  const [returns, pending] = await Promise.all([
    tx.retailReturn.findMany({ where: { organizationId, saleId }, take: 1000, select: { lines: true } }),
    tx.counterPaymentAttempt.findMany({
      where: { organizationId, purpose: "retail_refund", status: "refund_pending", quote: { path: ["saleId"], equals: saleId } },
      take: 1000, select: { id: true, quote: true },
    }),
  ]);
  if (returns.length >= 1000 || pending.length >= 1000) throw new Error("Return history requires reconciliation");
  const units = new Map<string, number>();
  const add = (lines: any) => {
    for (const line of Array.isArray(lines) ? lines : []) units.set(line.itemId, (units.get(line.itemId) || 0) + Number(line.quantity || 0));
  };
  for (const row of returns) add(row.lines);
  for (const row of pending) if (row.id !== excludeAttemptId) add(row.quote?.lines);
  return units;
}
