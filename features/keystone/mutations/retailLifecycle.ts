import type { Context } from ".keystone/types";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { getTenantId } from "../access/tenantPolicy";
import { lockTransactionKey } from "./classCapacity";
import { trainingInteger, trainingText } from "./trainingPolicy";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
export type RetailActor = { userId: string; organizationId: string; canManageRetail: boolean };
function assertRetailActor(actor: RetailActor) { if (!actor.userId || !actor.organizationId || !actor.canManageRetail) throw new Error("Retail management permission required"); }
function actorFromContext(context: Context): RetailActor {
  const session = context.session as any; const organizationId = getTenantId(session);
  const actor = { userId: session?.itemId || "", organizationId: organizationId || "", canManageRetail: Boolean(session?.data?.role?.canManageAllRecords || session?.data?.role?.canManageRetail) }; assertRetailActor(actor); return actor;
}
function sameTenant(row: any, actor: RetailActor, label: string) { if (!row || row.organizationId !== actor.organizationId) throw new Error(`${label} not found in this organization`); }
async function siteLock(tx: any, actor: RetailActor, locationId: string, requireActive = true) {
  await lockTransactionKey(tx, `retail:${actor.organizationId}:${locationId}`);
  const site = await tx.location.findUnique({ where: { id: locationId } }); sameTenant(site, actor, "Location"); if (requireActive && !site.isActive) throw new Error("Location is inactive");
}
function requestLines(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("A sale/return needs 1-100 lines");
  const ids = new Set<string>();
  return value.map((row: any) => {
    const itemId = trainingText(row.itemId, "Item", 200); if (ids.has(itemId)) throw new Error("Combine duplicate item lines"); ids.add(itemId);
    return { itemId, quantity: trainingInteger(row.quantity, "Quantity", 1, 10_000), restock: row.restock === true };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId));
}
function replay(row: any, hash: string) { if (row.requestHash !== hash) throw new Error("Request key was already used with different details"); return { id: row.id, reused: true }; }

export async function saveRetailItemAtomic(prisma: any, data: any, actor: RetailActor) {
  assertRetailActor(actor); const name = trainingText(data.name, "Item name", 200), sku = trainingText(data.sku, "SKU", 100), requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason, "Stock adjustment reason", 1000);
  const unitAmount = trainingInteger(data.unitAmount, "Unit price in USD cents", 0, 100_000_000), stockDelta = trainingInteger(data.stockDelta, "Stock change", -100_000, 100_000);
  const requestHash = hashTrainerAppointmentRequest({ ...data, name, sku, unitAmount, stockDelta, reason });
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await siteLock(tx, actor, data.locationId);
    const eventKey = `adjust:${requestKey}`;
    const prior = await tx.retailStockEntry.findFirst({ where: { organizationId: actor.organizationId, eventKey } });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new Error("Adjustment key has different details");
      return { id: prior.itemId, reused: true };
    }
    const existing = await tx.retailItem.findFirst({ where: { organizationId: actor.organizationId, locationId: data.locationId, sku } });
    const stockOnHand = (existing?.stockOnHand || 0) + stockDelta;
    if (stockOnHand < 0 || stockOnHand > 100_000_000) throw new Error("Stock adjustment exceeds supported balance");
    const values = { name, unitAmount, stockOnHand, isActive: data.isActive !== false };
    const item = existing ? await tx.retailItem.update({ where: { id: existing.id }, data: values }) : await tx.retailItem.create({ data: { organizationId: actor.organizationId, locationId: data.locationId, sku, currencyCode: "USD", ...values } });
    await tx.retailStockEntry.create({ data: { organizationId: actor.organizationId, locationId: data.locationId, itemId: item.id, eventKey, quantity: stockDelta, balanceAfter: stockOnHand, reason, requestHash, recordedById: actor.userId } });
    return { id: item.id, reused: false };
  });
}

export async function sellRetailAtomic(prisma: any, data: any, actor: RetailActor, now = new Date()) {
  assertRetailActor(actor); const lines = requestLines(data.lines).map(({ itemId, quantity }) => ({ itemId, quantity }));
  const requestKey = trainingText(data.requestKey, "Request key", 200), tender = trainingText(data.tender, "Tender", 20);
  if (!["cash", "external"].includes(tender)) throw new Error("Tender must be cash received or externally settled payment");
  const paymentReference = trainingText(data.paymentReference || "", "External settled payment reference", 200, tender === "external");
  const settledAmount = trainingInteger(data.settledAmount, "Confirmed received amount in cents", 0, 2_000_000_000);
  const requestHash = hashTrainerAppointmentRequest({ locationId: data.locationId, lines, tender, paymentReference, settledAmount });
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await lockTransactionKey(tx, `retail-request:${actor.organizationId}:${requestKey}`);
    if (tender === "external") await lockTransactionKey(tx, `retail-payment:${actor.organizationId}:${paymentReference}`);
    await siteLock(tx, actor, data.locationId);
    const existing = await tx.retailSale.findFirst({ where: { organizationId: actor.organizationId, requestKey } }); if (existing) return replay(existing, requestHash);
    if (tender === "external" && await tx.retailSale.findFirst({ where: { organizationId: actor.organizationId, paymentReference, tender } })) throw new Error("External payment reference is already recorded");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId: data.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The receipt instant is already closed; retry with a current receipt");
    const snapshot = [];
    let totalAmount = 0;
    for (const line of lines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } }); sameTenant(item, actor, "Retail item");
      if (item.locationId !== data.locationId || !item.isActive || item.currencyCode !== "USD") throw new Error("Item is unavailable at this site/currency");
      if (item.stockOnHand < line.quantity) throw new Error(`Insufficient stock for ${item.sku}`);
      const lineAmount = item.unitAmount * line.quantity;
      totalAmount += lineAmount;
      if (!Number.isSafeInteger(totalAmount) || totalAmount > 2_000_000_000) throw new Error("Sale amount exceeds supported bounds");
      snapshot.push({ itemId: item.id, sku: item.sku, name: item.name, unitAmount: item.unitAmount, quantity: line.quantity, lineAmount, currencyCode: "USD", priceBasis: "operator-entered gross amount; tax accounting external" });
      const balanceAfter = item.stockOnHand - line.quantity;
      await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
      await tx.retailStockEntry.create({ data: { organizationId: actor.organizationId, locationId: data.locationId, itemId: item.id, eventKey: `sale:${requestKey}:${item.id}`, quantity: -line.quantity, balanceAfter, reason: `Retail sale ${requestKey}`, recordedById: actor.userId } });
    }
    if (totalAmount !== settledAmount) throw new Error("Received amount does not match current server prices; review before recording");
    const sale = await tx.retailSale.create({ data: { organizationId: actor.organizationId, locationId: data.locationId, requestKey, requestHash, lines: snapshot, totalAmount, currencyCode: "USD", tender, paymentReference, soldAt: now, recordedById: actor.userId } });
    return { id: sale.id, totalAmount, lines: snapshot, reused: false };
  });
}

export async function returnRetailAtomic(prisma: any, data: any, actor: RetailActor, now = new Date()) {
  assertRetailActor(actor); const lines = requestLines(data.lines), requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason, "Return reason", 1000);
  const refundReference = trainingText(data.refundReference || "", "Refund reference", 200, false);
  const settledRefundAmount = trainingInteger(data.settledRefundAmount, "Confirmed refunded amount in cents", 0, 2_000_000_000);
  const requestHash = hashTrainerAppointmentRequest({ saleId: data.saleId, lines, reason, refundReference, settledRefundAmount });
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await lockTransactionKey(tx, `retail-return:${actor.organizationId}:${requestKey}`);
    if (refundReference) await lockTransactionKey(tx, `retail-refund:${actor.organizationId}:${refundReference}`);
    const sale = await tx.retailSale.findUnique({ where: { id: data.saleId } }); sameTenant(sale, actor, "Sale");
    await siteLock(tx, actor, sale.locationId, false);
    const existing = await tx.retailReturn.findFirst({ where: { organizationId: actor.organizationId, requestKey } }); if (existing) return replay(existing, requestHash);
    if (sale.tender === "external" && !refundReference) throw new Error("An externally settled refund reference is required");
    if (refundReference && await tx.retailReturn.findFirst({ where: { organizationId: actor.organizationId, refundReference } })) throw new Error("External refund reference is already allocated");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const previous = await tx.retailReturn.findMany({ where: { organizationId: actor.organizationId, saleId: sale.id }, take: 1000 });
    if (previous.length >= 1000) throw new Error("Return history requires reconciliation");
    let refundAmount = 0; const snapshot = [];
    for (const line of lines) {
      const sold = sale.lines.find((row: any) => row.itemId === line.itemId); if (!sold) throw new Error("Returned item was not in this sale");
      const returned = previous.reduce((sum: number, row: any) => sum + row.lines.filter((item: any) => item.itemId === line.itemId).reduce((n: number, item: any) => n + item.quantity, 0), 0);
      if (returned + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
      const lineAmount = sold.unitAmount * line.quantity; refundAmount += lineAmount;
      snapshot.push({ ...line, sku: sold.sku, name: sold.name, unitAmount: sold.unitAmount, lineAmount });
      if (line.restock) {
        const item = await tx.retailItem.findUnique({ where: { id: line.itemId } }); sameTenant(item, actor, "Retail item");
        if (item.locationId !== sale.locationId) throw new Error("Returned stock belongs to another site");
        const balanceAfter = item.stockOnHand + line.quantity;
        if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 100_000_000) throw new Error("Returned stock exceeds supported balance");
        await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
        await tx.retailStockEntry.create({ data: { organizationId: actor.organizationId, locationId: sale.locationId, itemId: item.id, eventKey: `return:${requestKey}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Return: ${reason}`, recordedById: actor.userId } });
      }
    }
    if (settledRefundAmount !== refundAmount) throw new Error("Recorded refund must match the original-price returned units");
    const result = await tx.retailReturn.create({ data: { organizationId: actor.organizationId, locationId: sale.locationId, saleId: sale.id, requestKey, requestHash, lines: snapshot, refundAmount, refundReference, tender: sale.tender, reason, returnedAt: now, recordedById: actor.userId } });
    return { id: result.id, refundAmount, lines: snapshot, reused: false };
  });
}

export async function closeRetailAtomic(prisma: any, data: any, actor: RetailActor, now = new Date()) {
  assertRetailActor(actor); const requestKey = trainingText(data.requestKey, "Request key", 200), reason = trainingText(data.reason || "", "Variance reason", 1000, false);
  const openingAmount = trainingInteger(data.openingAmount, "Opening cash in cents", 0, 100_000_000), countedAmount = trainingInteger(data.countedAmount, "Counted cash in cents", 0, 100_000_000);
  const periodStart = new Date(data.periodStart), periodEnd = new Date(data.periodEnd);
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd || periodEnd > now || periodEnd.getTime() - periodStart.getTime() > 31 * 86_400_000) throw new Error("Close needs a completed period up to 31 days");
  const requestHash = hashTrainerAppointmentRequest({ locationId: data.locationId, periodStart, periodEnd, openingAmount, countedAmount, reason });
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await siteLock(tx, actor, data.locationId, false);
    const existing = await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, requestKey } }); if (existing) return replay(existing, requestHash);
    const overlap = await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId: data.locationId, periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart } } });
    if (overlap) throw new Error("Cash close overlaps a previously reconciled period");
    const where = { organizationId: actor.organizationId, locationId: data.locationId, tender: "cash" };
    const sales = await tx.retailSale.findMany({ where: { ...where, soldAt: { gte: periodStart, lt: periodEnd } }, take: 10000 });
    const returns = await tx.retailReturn.findMany({ where: { ...where, returnedAt: { gte: periodStart, lt: periodEnd } }, take: 10000 });
    if (sales.length >= 10000 || returns.length >= 10000) throw new Error("Close period exceeds bounded reconciliation; use smaller periods");
    const salesAmount = sales.reduce((sum: number, row: any) => sum + row.totalAmount, 0), refundAmount = returns.reduce((sum: number, row: any) => sum + row.refundAmount, 0);
    const expectedAmount = openingAmount + salesAmount - refundAmount, varianceAmount = countedAmount - expectedAmount;
    if (varianceAmount && !reason) throw new Error("A cash variance needs a reason and operator follow-up");
    if (!Number.isSafeInteger(expectedAmount) || Math.abs(expectedAmount) > 2_000_000_000 || Math.abs(varianceAmount) > 2_000_000_000) throw new Error("Close exceeds supported money bounds");
    const row = await tx.retailClose.create({ data: { organizationId: actor.organizationId, locationId: data.locationId, requestKey, requestHash, periodStart, periodEnd, openingAmount, expectedAmount, countedAmount, varianceAmount, reason, evidence: { saleIds: sales.map((row: any) => row.id), returnIds: returns.map((row: any) => row.id), salesAmount, refundAmount, basis: "recorded cash receipts/refunds; external tenders excluded" }, recordedById: actor.userId } });
    return { id: row.id, expectedAmount, countedAmount, varianceAmount };
  });
}

export async function retailWorkspace(_r: unknown, { skip = 0 }: { skip?: number }, context: Context) {
  const actor = actorFromContext(context); if (!Number.isInteger(skip) || skip < 0 || skip > 10000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any), where = { organizationId: actor.organizationId };
  const [items, sales, returns, closes, locations, stockEntries] = await Promise.all([
    tx.retailItem.findMany({ where, take: 100, orderBy: [{ sku: "asc" }, { id: "asc" }], select: { id: true, locationId: true, sku: true, name: true, unitAmount: true, currencyCode: true, stockOnHand: true, isActive: true } }),
    tx.retailSale.findMany({ where, take: 50, skip, orderBy: [{ soldAt: "desc" }, { id: "asc" }], select: { id: true, locationId: true, lines: true, totalAmount: true, tender: true, paymentReference: true, soldAt: true } }),
    tx.retailReturn.findMany({ where, take: 50, skip, orderBy: [{ returnedAt: "desc" }, { id: "asc" }], select: { id: true, saleId: true, locationId: true, lines: true, refundAmount: true, tender: true, refundReference: true, reason: true, returnedAt: true } }),
    tx.retailClose.findMany({ where, take: 50, skip, orderBy: [{ periodEnd: "desc" }, { id: "asc" }], select: { id: true, locationId: true, periodStart: true, periodEnd: true, openingAmount: true, expectedAmount: true, countedAmount: true, varianceAmount: true, reason: true, evidence: true } }),
    tx.location.findMany({ where, take: 100, select: { id: true, name: true, isActive: true } }),
    tx.retailStockEntry.findMany({ where, take: 50, skip, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, itemId: true, quantity: true, balanceAfter: true, reason: true, createdAt: true } }),
  ]);
  // All fields in these evidence lists are operator-visible; raw mutation stays denied.
  return { items, sales, returns, closes, locations, stockEntries, skip };
}
export const retailTypeDefs = `extend type Query { retailWorkspace(skip: Int = 0): JSON! } extend type Mutation { saveRetailItem(data: JSON!): JSON! sellRetail(data: JSON!): JSON! returnRetail(data: JSON!): JSON! closeRetail(data: JSON!): JSON! }`;
export async function saveRetailItem(_r: unknown, { data }: any, context: Context) { return saveRetailItemAtomic(context.prisma, data, actorFromContext(context)); }
export async function sellRetail(_r: unknown, { data }: any, context: Context) { return sellRetailAtomic(context.prisma, data, actorFromContext(context)); }
export async function returnRetail(_r: unknown, { data }: any, context: Context) { return returnRetailAtomic(context.prisma, data, actorFromContext(context)); }
export async function closeRetail(_r: unknown, { data }: any, context: Context) { return closeRetailAtomic(context.prisma, data, actorFromContext(context)); }
