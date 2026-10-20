import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { createFinanceException } from "../lib/operational-notices";
import { lockTransactionKey } from "./classCapacity";
import { lockActiveOrganization } from "../lib/current-actor";
import { trainingInteger, trainingText } from "./trainingPolicy";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { assertRetailActor, requestLines, retailActorFromContext as actorFromContext, retailSaleLockKey, sameTenant, siteLock, unavailableReturnUnits, type RetailActor } from "./retailPolicy";
import { counterAttemptsForWorkspace, startRetailCardRefund, startRetailCardSale } from "./counterPayments";
export type { RetailActor } from "./retailPolicy";
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

// ---------------------------------------------------------------- reviewed cash/external sales

const QUOTE_MINUTES = 30;
type QuoteLine = { itemId: string; sku: string; name: string; unitAmount: number; quantity: number; lineAmount: number };
type RetailQuote = { v: 1; organizationId: string; userId: string; locationId: string; lines: QuoteLine[]; totalAmount: number; currencyCode: "USD"; issuedAt: string; expiresAt: string };

function quoteSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) throw new Error("Price review is unavailable on this deployment");
  return secret;
}
const quoteMac = (body: string) => crypto.createHmac("sha256", quoteSecret()).update(`retail-quote:v1:${body}`).digest("base64url");

/** Verifies a reviewed quote is this server's, for this person, organization and site. */
function readQuote(token: unknown, actor: RetailActor, locationId: string): RetailQuote {
  const [body, mac] = typeof token === "string" ? token.split(".") : [];
  if (!body || !mac || body.length > 20_000) throw new Error("Review the sale's prices before recording it");
  const expected = Buffer.from(quoteMac(body)), supplied = Buffer.from(mac);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) throw new Error("Review the sale's prices before recording it");
  const quote = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RetailQuote;
  if (quote.v !== 1 || quote.organizationId !== actor.organizationId || quote.userId !== actor.userId || quote.locationId !== locationId) throw new Error("This price review belongs to another sale; review the prices again");
  return quote;
}

/**
 * Prices a counter cart from the current catalog for review before any cash or external payment
 * is taken: the exact lines, prices, total and expiry, signed for this person, organization and
 * site. Recording the sale uses these accepted prices, not whatever the catalog says later.
 */
export async function quoteRetailSaleAtomic(prisma: any, data: any, actor: RetailActor, now = new Date()) {
  assertRetailActor(actor);
  const locationId = trainingText(data?.locationId, "Location", 200);
  const lines = requestLines(data?.lines).map(({ itemId, quantity }) => ({ itemId, quantity }));
  const tx = guardKeystonePrismaResults(prisma);
  const site = await tx.location.findUnique({ where: { id: locationId } });
  sameTenant(site, actor, "Location");
  if (!site.isActive) throw new Error("This location is closed for sales");
  const quoted: QuoteLine[] = [];
  let totalAmount = 0;
  for (const line of lines) {
    const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
    sameTenant(item, actor, "Retail item");
    if (item.locationId !== locationId || !item.isActive || item.currencyCode !== "USD") throw new Error(`${item.name} isn't for sale at this location`);
    if (item.stockOnHand < line.quantity) throw new Error(`Only ${item.stockOnHand} of ${item.sku} in stock`);
    const lineAmount = item.unitAmount * line.quantity;
    totalAmount += lineAmount;
    if (!Number.isSafeInteger(totalAmount) || totalAmount > 2_000_000_000) throw new Error("Sale amount exceeds supported bounds");
    quoted.push({ itemId: item.id, sku: item.sku, name: item.name, unitAmount: item.unitAmount, quantity: line.quantity, lineAmount });
  }
  const quote: RetailQuote = { v: 1, organizationId: actor.organizationId, userId: actor.userId, locationId, lines: quoted, totalAmount, currencyCode: "USD", issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + QUOTE_MINUTES * 60_000).toISOString() };
  const body = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return { quoteToken: `${body}.${quoteMac(body)}`, lines: quoted, totalAmount, currencyCode: "USD", expiresAt: quote.expiresAt };
}

/**
 * Cash and externally settled sales, recorded against the reviewed quote the operator accepted
 * before taking the money; card sales are recorded only by the counter payment service. When the
 * accepted sale can't be completed now (quote expired, stock or item changed, drawer closed), the
 * money already received is kept as an open finance case to record or refund, never dropped and
 * never repriced.
 */
export async function sellRetailAtomic(prisma: any, data: any, actor: RetailActor, now = new Date()) {
  assertRetailActor(actor);
  const requestKey = trainingText(data.requestKey, "Request key", 200), tender = trainingText(data.tender, "Tender", 20);
  if (!["cash", "external"].includes(tender)) throw new Error("Tender must be cash received or an externally settled payment; use Take card payment for cards");
  const paymentReference = trainingText(data.paymentReference || "", "External settled payment reference", 200, tender !== "cash");
  const settledAmount = trainingInteger(data.settledAmount, "Confirmed received amount in cents", 0, 2_000_000_000);
  const locationId = trainingText(data.locationId, "Location", 200);
  const quote = readQuote(data.quoteToken, actor, locationId);
  if (settledAmount !== quote.totalAmount) throw new Error("The amount received must be the reviewed total");
  const requested = requestLines(data.lines).map(({ itemId, quantity }) => `${itemId}:${quantity}`).sort().join(",");
  if (requested !== quote.lines.map((line) => `${line.itemId}:${line.quantity}`).sort().join(",")) throw new Error("The cart changed after its prices were reviewed; review it again");
  const requestHash = hashTrainerAppointmentRequest({ locationId, lines: quote.lines, tender, paymentReference, settledAmount, quoteIssuedAt: quote.issuedAt });
  const reconciliationKey = `retail-received:${requestKey}`;
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await lockTransactionKey(tx, `retail-request:${actor.organizationId}:${requestKey}`);
    if (tender !== "cash") await lockTransactionKey(tx, `retail-payment:${actor.organizationId}:${paymentReference}`);
    await siteLock(tx, actor, locationId);
    const existing = await tx.retailSale.findFirst({ where: { organizationId: actor.organizationId, requestKey } }); if (existing) return replay(existing, requestHash);
    if (tender !== "cash" && await tx.retailSale.findFirst({ where: { organizationId: actor.organizationId, paymentReference, tender } })) throw new Error("This payment is already recorded on another sale");
    // Why the accepted sale can't be completed as reviewed, if it can't.
    let problem: string | null = new Date(quote.expiresAt) <= now ? "the reviewed prices expired before the sale was recorded" : null;
    if (!problem && await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) problem = "the cash drawer period for this moment is already closed";
    const items = new Map<string, any>();
    for (const line of quote.lines) {
      if (problem) break;
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      if (!item || item.organizationId !== actor.organizationId || item.locationId !== locationId || !item.isActive) problem = `${line.sku} is no longer for sale here`;
      else if (item.stockOnHand < line.quantity) problem = `only ${item.stockOnHand} of ${line.sku} is in stock now`;
      else items.set(item.id, item);
    }
    if (problem) {
      const received = `${(settledAmount / 100).toFixed(2)} USD ${tender === "cash" ? "in cash" : `by external payment ${paymentReference}`}`;
      const exception = await createFinanceException(tx, { organizationId: actor.organizationId, key: reconciliationKey, kind: "retail-payment-received", reference: paymentReference || requestKey,
        summary: `Received ${received} for ${quote.lines.map((line) => `${line.quantity} × ${line.sku}`).join(", ")} at the reviewed prices, but ${problem}. Record the sale once resolved, or refund the customer through the original tender.` });
      return { id: exception.id, reconciliation: true, reason: problem, totalAmount: settledAmount, reused: false };
    }
    await lockActiveOrganization(tx, actor.organizationId);
    const snapshot = quote.lines.map((line) => ({ ...line, currencyCode: "USD", priceBasis: "reviewed quote accepted before payment; operator-entered gross amount; tax accounting external" }));
    for (const line of quote.lines) {
      const item = items.get(line.itemId);
      const balanceAfter = item.stockOnHand - line.quantity;
      await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
      await tx.retailStockEntry.create({ data: { organizationId: actor.organizationId, locationId, itemId: item.id, eventKey: `sale:${requestKey}:${item.id}`, quantity: -line.quantity, balanceAfter, reason: `Retail sale ${requestKey}`, recordedById: actor.userId } });
    }
    const sale = await tx.retailSale.create({ data: { organizationId: actor.organizationId, locationId, requestKey, requestHash, lines: snapshot, totalAmount: quote.totalAmount, currencyCode: "USD", tender, paymentReference, soldAt: now, recordedById: actor.userId } });
    return { id: sale.id, totalAmount: sale.totalAmount, lines: snapshot, reused: false };
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
    await lockTransactionKey(tx, retailSaleLockKey(String(data.saleId || "")));
    const sale = await tx.retailSale.findUnique({ where: { id: data.saleId } }); sameTenant(sale, actor, "Sale");
    await siteLock(tx, actor, sale.locationId, false);
    const existing = await tx.retailReturn.findFirst({ where: { organizationId: actor.organizationId, requestKey } }); if (existing) return replay(existing, requestHash);
    if (sale.tender === "card") throw new Error("Card sales refund to the original card; use the card return action");
    if (sale.tender !== "cash" && !refundReference) throw new Error("A settled refund reference is required");
    if (refundReference && await tx.retailReturn.findFirst({ where: { organizationId: actor.organizationId, refundReference } })) throw new Error("External refund reference is already allocated");
    if (await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const unavailable = await unavailableReturnUnits(tx, actor.organizationId, sale.id);
    let refundAmount = 0; const snapshot = [];
    for (const line of lines) {
      const sold = sale.lines.find((row: any) => row.itemId === line.itemId); if (!sold) throw new Error("Returned item was not in this sale");
      if ((unavailable.get(line.itemId) || 0) + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
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

export async function retailWorkspace(_r: unknown, { skip = 0, cardSkip = 0, itemSkip = 0, itemSite }: { skip?: number; cardSkip?: number; itemSkip?: number; itemSite?: string | null }, context: Context) {
  const actor = actorFromContext(context);
  for (const value of [skip, cardSkip, itemSkip]) if (!Number.isInteger(value) || value < 0 || value > 100_000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any), where = { organizationId: actor.organizationId };
  // One row past the page tells whether another history page exists.
  const page = { take: 51, skip };
  const [itemRows, sales, returns, closes, locationRows, stockEntries, cardPayments] = await Promise.all([
    // The catalog list is filtered by site in the query, then paged, so a later site's items are reachable.
    tx.retailItem.findMany({ where: { ...where, ...(itemSite ? { locationId: String(itemSite) } : {}) }, skip: itemSkip, take: 101, orderBy: [{ sku: "asc" }, { id: "asc" }], select: { id: true, locationId: true, sku: true, name: true, unitAmount: true, currencyCode: true, stockOnHand: true, isActive: true } }),
    tx.retailSale.findMany({ where, ...page, orderBy: [{ soldAt: "desc" }, { id: "asc" }], select: { id: true, locationId: true, lines: true, totalAmount: true, tender: true, paymentReference: true, soldAt: true } }),
    tx.retailReturn.findMany({ where, ...page, orderBy: [{ returnedAt: "desc" }, { id: "asc" }], select: { id: true, saleId: true, locationId: true, lines: true, refundAmount: true, tender: true, refundReference: true, reason: true, returnedAt: true } }),
    tx.retailClose.findMany({ where, ...page, orderBy: [{ periodEnd: "desc" }, { id: "asc" }], select: { id: true, locationId: true, periodStart: true, periodEnd: true, openingAmount: true, expectedAmount: true, countedAmount: true, varianceAmount: true, reason: true, evidence: true } }),
    tx.location.findMany({ where, take: 501, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, isActive: true } }),
    tx.retailStockEntry.findMany({ where, ...page, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, itemId: true, quantity: true, balanceAfter: true, reason: true, createdAt: true, item: { select: { sku: true } } } }),
    counterAttemptsForWorkspace(tx, actor.organizationId, "retail", cardSkip),
  ]);
  const hasMore = [sales, returns, closes, stockEntries].some((rows: any[]) => rows.length > 50);
  const trim = (rows: any[]) => rows.slice(0, 50);
  // All fields in these evidence lists are operator-visible; raw mutation stays denied.
  return {
    items: itemRows.slice(0, 100), itemsHasMore: itemRows.length > 100, itemSkip, itemSite: itemSite || null,
    sales: trim(sales), returns: trim(returns), closes: trim(closes),
    locations: locationRows.slice(0, 500), locationsTruncated: locationRows.length > 500,
    stockEntries: trim(stockEntries),
    cardPayments: cardPayments.rows, cardPaymentsHasMore: cardPayments.hasMore, cardSkip: cardPayments.skip,
    skip, hasMore,
  };
}
export const retailTypeDefs = `extend type Query { retailWorkspace(skip: Int = 0, cardSkip: Int = 0, itemSkip: Int = 0, itemSite: ID): JSON! retailSaleItems(locationId: ID!, q: String, skip: Int = 0): JSON! } extend type Mutation { saveRetailItem(data: JSON!): JSON! quoteRetailSale(data: JSON!): JSON! sellRetail(data: JSON!): JSON! returnRetail(data: JSON!): JSON! closeRetail(data: JSON!): JSON! }`;
export async function quoteRetailSale(_r: unknown, { data }: any, context: Context) { return quoteRetailSaleAtomic(context.prisma, data, actorFromContext(context)); }

/** Active items at one site for the counter cart, searched and paged in the query. */
export async function retailSaleItems(_r: unknown, { locationId, q, skip = 0 }: { locationId: string; q?: string | null; skip?: number }, context: Context) {
  const actor = actorFromContext(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 100_000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const search = String(q || "").trim().slice(0, 100);
  const rows = await tx.retailItem.findMany({
    where: { organizationId: actor.organizationId, locationId: String(locationId), isActive: true, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {}) },
    orderBy: [{ sku: "asc" }, { id: "asc" }], skip, take: 101,
    select: { id: true, locationId: true, sku: true, name: true, unitAmount: true, currencyCode: true, stockOnHand: true, isActive: true },
  });
  return { items: rows.slice(0, 100), hasMore: rows.length > 100, skip };
}
export async function saveRetailItem(_r: unknown, { data }: any, context: Context) { return saveRetailItemAtomic(context.prisma, data, actorFromContext(context)); }
export async function sellRetail(_r: unknown, { data }: any, context: Context) {
  const actor = actorFromContext(context);
  if (data?.mode === "startCard") return startRetailCardSale(context, actor, data);
  if (data?.tender === "card") throw new Error("Card sales are recorded from their card checkout");
  return sellRetailAtomic(context.prisma, data, actor);
}

/** Card sales refund the original card through a reserved refund attempt; others record settled refunds. */
export async function returnRetail(_r: unknown, { data }: any, context: Context) {
  const actor = actorFromContext(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const sale = await prisma.retailSale.findUnique({ where: { id: String(data?.saleId || "") } });
  if (sale && sale.organizationId === actor.organizationId && sale.tender === "card") return startRetailCardRefund(context, actor, data);
  return returnRetailAtomic(context.prisma, data, actor);
}
export async function closeRetail(_r: unknown, { data }: any, context: Context) { return closeRetailAtomic(context.prisma, data, actorFromContext(context)); }
