import type { Context } from ".keystone/types";
import { lockTransactionKey } from "./classCapacity";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { createFinanceException, enqueueOperationalNotice } from "../lib/operational-notices";
import {
  MINIMUM_CARD_AMOUNT,
  assertExactCounterRefund,
  attemptProviderBinding,
  counterProviderBinding,
  counterReconcileBinding,
  createCounterProviderCheckout,
  expireCounterProviderCheckout,
  findOrCreateCounterRefund,
  freezeCounterCheckoutRequest,
  PROVIDER_CHANGED_MESSAGE,
  sameCounterProvider,
  readCounterCheckout,
  retrieveCounterProviderCheckout,
  type CounterCheckoutRequest,
  type CounterKind,
} from "../lib/counter-card-payment";
import { lockCurrentActor } from "../lib/current-actor";
import { assertActiveOrganization } from "../security/tenant-status";
import { requestLines, retailSaleLockKey, sameTenant, siteLock, unavailableReturnUnits, type RetailActor } from "./retailPolicy";
import { createSettledTrainingPackage, settledPackageProblem } from "./trainingPackages";
import { assertTrainingActor, assertTrainingTenant, trainingInteger, trainingText, unusedPackageRefundAmount, type TrainingActor } from "./trainingPolicy";

/**
 * Staffed-counter card payments. Each sale or refund is a CounterPaymentAttempt committed
 * BEFORE the provider is called: a sale freezes its quote and holds its stock, a refund
 * reserves its units or package credits. The provider key derives from the attempt, so a
 * retry, the browser return, a signed webhook or a staff status check all finish the same
 * operation exactly once. A paid checkout that can no longer be fulfilled becomes an
 * exception with a refund action; nothing is repriced after payment.
 *
 * Each attempt records the provider it was admitted with and the exact checkout request (with a
 * fixed absolute expiry) before the first provider call; every later call reuses both. Once that
 * expiry has passed, no checkout from the request can be paid, which is the only basis on which a
 * hold without a confirmed checkout is released. Fulfilling a paid attempt and compensating it are
 * mutually exclusive: compensation moves the attempt to "compensating" before any refund I/O.
 */

const OPEN_SALE_STATES = ["reserved", "open"];
// After the request's expiry, allow for provider clock and processing skew before relying on it.
const EXPIRY_SKEW_MS = 5 * 60_000;

type Attempt = any;

function kindOf(attempt: Attempt): CounterKind {
  if (attempt.purpose === "exception_refund") return attempt.quote?.kind === "training" ? "training" : "retail";
  return attempt.purpose === "training_sale" || attempt.purpose === "training_refund" ? "training" : "retail";
}

function frozenRequest(attempt: Attempt): CounterCheckoutRequest | null {
  const request = attempt?.quote?.checkoutRequest;
  return request && typeof request.expiresAt === "string" ? request as CounterCheckoutRequest : null;
}

/** True once no checkout created from the attempt's fixed request can still be paid. */
function requestDefinitelyExpired(attempt: Attempt, now = Date.now()) {
  const request = frozenRequest(attempt);
  return Boolean(request && now >= new Date(request.expiresAt).getTime() + EXPIRY_SKEW_MS);
}

async function organizationAcceptsNewActivity(context: Context, organizationId: string) {
  try { await assertActiveOrganization(context, organizationId); return true; } catch { return false; }
}

/** Freezes the provider identity and the exact checkout request on a newly reserved attempt. */
async function freezeSaleAttempt(tx: any, created: Attempt, binding: Awaited<ReturnType<typeof counterProviderBinding>>) {
  const kind = kindOf(created);
  const request = freezeCounterCheckoutRequest({ organizationId: created.organizationId, attemptId: created.id, kind, amount: created.amount, description: describe(created), returnPath: workspacePath(kind) });
  return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: {
    providerKey: `counter-checkout:${created.organizationId}:${created.id}`,
    quote: { ...(created.quote || {}), provider: binding, checkoutRequest: request },
    expiresAt: new Date(new Date(request.expiresAt).getTime() + EXPIRY_SKEW_MS),
  } });
}

function workspacePath(kind: CounterKind) {
  return kind === "retail" ? "/dashboard/platform/retail" : "/dashboard/platform/training";
}

function describe(attempt: Attempt) {
  if (attempt.purpose === "training_sale") {
    const terms = attempt.quote?.terms || {};
    return `${terms.serviceName || "Training package"} · ${terms.totalCredits || ""} sessions`;
  }
  return `Retail sale · ${(attempt.quote?.lines || []).length} item${(attempt.quote?.lines || []).length === 1 ? "" : "s"}`;
}

export function counterAttemptView(attempt: Attempt) {
  return {
    attemptId: attempt.id,
    purpose: attempt.purpose,
    status: attempt.status,
    amount: attempt.amount,
    currencyCode: attempt.currencyCode,
    checkoutUrl: attempt.status === "open" ? attempt.result?.checkoutUrl || null : null,
    result: attempt.result || {},
    lastError: attempt.lastError || "",
  };
}

async function noteAttemptError(context: Context, attemptId: string, error: unknown) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const lastError = (error instanceof Error ? error.message : "Provider outcome requires reconciliation").slice(0, 1000);
  await prisma.counterPaymentAttempt.updateMany({ where: { id: attemptId }, data: { lastError } });
}

async function findAttempt(context: Context, organizationId: string, where: Record<string, unknown>) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const attempt = await prisma.counterPaymentAttempt.findFirst({ where: { organizationId, ...where } });
  if (!attempt) throw new Error("Card payment was not found for this workspace");
  return attempt;
}

// ---------------------------------------------------------------- sales

/** Freezes the retail quote and holds its stock, then opens the hosted card checkout. */
export async function startRetailCardSale(context: Context, actor: RetailActor, data: any) {
  const lines = requestLines(data?.lines).map(({ itemId, quantity }) => ({ itemId, quantity }));
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const locationId = trainingText(data?.locationId, "Location", 200);
  const reviewedTotal = data?.reviewedTotal == null || data.reviewedTotal === "" ? null : trainingInteger(data.reviewedTotal, "Reviewed total in cents", 0, 2_000_000_000);
  const requestHash = hashTrainerAppointmentRequest({ purpose: "retail_sale", locationId, lines });
  const binding = await counterProviderBinding(context, actor.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-request:${actor.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This sale was already started with different items; start a new sale");
      return existing;
    }
    // A new card sale is new activity: current role and an active club, fenced until commit.
    const current = await lockCurrentActor(tx, actor.userId, actor.organizationId, []);
    if (!current.role.canManageRetail && !current.role.canManageAllRecords) throw new Error("Retail management permission required");
    await siteLock(tx, actor, locationId);
    const quoteLines: any[] = [];
    let amount = 0;
    for (const line of lines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      sameTenant(item, actor, "Retail item");
      if (item.locationId !== locationId || !item.isActive || item.currencyCode !== "USD") throw new Error("Item is unavailable at this site/currency");
      if (item.stockOnHand < line.quantity) throw new Error(`Insufficient stock for ${item.sku}`);
      const lineAmount = item.unitAmount * line.quantity;
      amount += lineAmount;
      if (!Number.isSafeInteger(amount) || amount > 2_000_000_000) throw new Error("Sale amount exceeds supported bounds");
      quoteLines.push({ itemId: item.id, sku: item.sku, name: item.name, unitAmount: item.unitAmount, quantity: line.quantity, lineAmount, currencyCode: "USD", priceBasis: "operator-entered gross amount; tax accounting external" });
    }
    if (reviewedTotal !== null && reviewedTotal !== amount) throw new Error("Prices changed since this sale was reviewed. Review the new total before taking payment.");
    if (amount < MINIMUM_CARD_AMOUNT) throw new Error("Card payments need a total of at least $0.50");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor.organizationId, locationId, purpose: "retail_sale", requestKey, requestHash, status: "reserved",
      amount, currencyCode: "USD", quote: { lines: quoteLines }, providerId: binding.providerId, recordedById: actor.userId,
    } });
    for (const line of quoteLines) {
      const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
      const balanceAfter = item.stockOnHand - line.quantity;
      await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
      await tx.retailStockEntry.create({ data: { organizationId: actor.organizationId, locationId, itemId: item.id, eventKey: `hold:${created.id}:${item.id}`, quantity: -line.quantity, balanceAfter, reason: `Held for card checkout ${created.id}`, recordedById: actor.userId } });
    }
    return freezeSaleAttempt(tx, created, binding);
  });
  return openCounterCheckout(context, attempt);
}

/** Freezes the training package terms, then opens the hosted card checkout. */
export async function startTrainingCardSale(context: Context, actor: TrainingActor, data: any) {
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const terms = {
    memberId: trainingText(data?.memberId, "Member", 200),
    locationId: trainingText(data?.locationId, "Location", 200),
    serviceName: trainingText(data?.serviceName, "Service name", 200),
    totalCredits: trainingInteger(data?.totalCredits, "Credits", 1, 1000),
    durationMinutes: trainingInteger(data?.durationMinutes, "Duration", 15, 480),
    expiresAt: new Date(data?.expiresAt).toISOString(),
  };
  const amount = trainingInteger(data?.amount, "Package price in cents", MINIMUM_CARD_AMOUNT, 100_000_000);
  if (new Date(terms.expiresAt) <= new Date()) throw new Error("Choose a package expiry in the future");
  const requestHash = hashTrainerAppointmentRequest({ purpose: "training_sale", amount, terms });
  const binding = await counterProviderBinding(context, actor.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-request:${actor.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This package sale was already started with different terms; start a new sale");
      return existing;
    }
    const current = await lockCurrentActor(tx, actor.userId, actor.organizationId, []);
    if (!current.role.canManageAppointments && !current.role.canManageAllRecords) throw new Error("Training management permission required");
    const member = await tx.member.findUnique({ where: { id: terms.memberId } });
    const location = await tx.location.findUnique({ where: { id: terms.locationId } });
    assertTrainingTenant(member, actor, "Member"); assertTrainingTenant(location, actor, "Location");
    if (member.status !== "active" || !location.isActive) throw new Error("Active member and location required");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor.organizationId, locationId: location.id, purpose: "training_sale", requestKey, requestHash, status: "reserved",
      amount, currencyCode: "USD", quote: { terms, memberName: member.name || "" }, providerId: binding.providerId, recordedById: actor.userId,
    } });
    return freezeSaleAttempt(tx, created, binding);
  });
  return openCounterCheckout(context, attempt);
}

/**
 * Returns the attempt's one hosted checkout, creating it under the attempt key with the attempt's
 * fixed request when needed. Nothing is created once that request's window has ended.
 */
async function openCounterCheckout(context: Context, attempt: Attempt) {
  if (!OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
  if (attempt.providerCheckoutId) return completeCounterCheckout(context, attempt.organizationId, { attemptId: attempt.id });
  const request = frozenRequest(attempt);
  if (!request) throw new Error("This card payment has no recorded checkout request. Reconcile it in the provider dashboard before releasing it.");
  if (requestDefinitelyExpired(attempt)) return releaseHeldAttempt(context, attempt.id, "The checkout window ended; no checkout from this sale can be paid");
  if (Date.now() >= new Date(request.expiresAt).getTime()) throw new Error("This checkout window has just ended. Check again in a few minutes to release the hold.");
  let checkout;
  try {
    checkout = await createCounterProviderCheckout(context, attempt.organizationId, { request, providerKey: attempt.providerKey, bound: attemptProviderBinding(attempt) });
  } catch (error) {
    await noteAttemptError(context, attempt.id, error);
    throw new Error("Card checkout could not be opened. The sale stays reserved: open it again or release it from Card payments.");
  }
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  await prisma.counterPaymentAttempt.updateMany({
    where: { id: attempt.id, status: { in: OPEN_SALE_STATES } },
    data: {
      status: "open", providerCheckoutId: checkout.providerSessionId, result: { checkoutUrl: checkout.checkoutUrl }, lastError: "",
      ...(checkout.expiresAt ? { expiresAt: new Date(checkout.expiresAt) } : {}),
    },
  });
  if (checkout.status !== "open") return completeCounterCheckout(context, attempt.organizationId, { attemptId: attempt.id });
  return { ...counterAttemptView({ ...attempt, status: "open", result: { checkoutUrl: checkout.checkoutUrl } }) };
}

/**
 * Reads provider truth for an attempt's checkout and finishes it: paid fulfills from the
 * frozen quote, expired releases the hold, open returns the checkout link again.
 */
export async function completeCounterCheckout(context: Context, organizationId: string, ref: { attemptId?: string; checkoutSessionId?: string }) {
  const attempt = ref.attemptId
    ? await findAttempt(context, organizationId, { id: ref.attemptId })
    : await findAttempt(context, organizationId, { providerCheckoutId: String(ref.checkoutSessionId || "__none__") });
  if (!["retail_sale", "training_sale"].includes(attempt.purpose)) throw new Error("This is not a card sale");
  if (!OPEN_SALE_STATES.includes(attempt.status) && attempt.status !== "released") return counterAttemptView(attempt);
  if (!attempt.providerCheckoutId) return counterAttemptView(attempt);
  const session = await retrieveCounterProviderCheckout(context, organizationId, attempt.providerCheckoutId, attemptProviderBinding(attempt));
  const state = readCounterCheckout(session, { organizationId, kind: kindOf(attempt), attemptId: attempt.id, amount: attempt.amount });
  if (state.state === "paid") return fulfillPaidAttempt(context, attempt.id, state.paymentIntentId);
  if (state.state === "expired") return releaseHeldAttempt(context, attempt.id, "Card checkout expired before payment");
  return counterAttemptView({ ...attempt, result: { ...(attempt.result || {}), checkoutUrl: (session as any).url || attempt.result?.checkoutUrl } });
}

async function fulfillPaidAttempt(context: Context, attemptId: string, paymentIntentId: string, retryException = false) {
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new Error("Card payment was not found");
    // A compensating attempt is being refunded: it can never also be fulfilled.
    if (attempt.status === "fulfilled" || attempt.status === "compensating" || (attempt.status === "exception" && !retryException)) return counterAttemptView(attempt);
    if (![...OPEN_SALE_STATES, "released", "exception"].includes(attempt.status)) return counterAttemptView(attempt);
    const organizationId = attempt.organizationId;
    const recorder = { userId: attempt.recordedById || "", organizationId };
    const now = new Date();
    let problem: string | null = null;
    let result: Record<string, string> = {};
    const lines = Array.isArray(attempt.quote?.lines) ? attempt.quote.lines : [];
    // An exception or released attempt never holds stock; an open or reserved one always does.
    let stockHeld = OPEN_SALE_STATES.includes(attempt.status);
    if (attempt.purpose === "retail_sale") {
      await siteLock(tx, { organizationId }, attempt.locationId, false);
      if (!stockHeld) {
        // The hold was returned to stock; take the accepted units again if they are still there.
        for (const line of lines) {
          const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
          if (!item || item.organizationId !== organizationId || item.stockOnHand < line.quantity) { problem = `Paid after its stock hold was released, and ${line.sku} no longer has ${line.quantity} in stock`; break; }
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
          organizationId, locationId: attempt.locationId, requestKey: `card:${attempt.id}`, requestHash: attempt.requestHash, lines,
          totalAmount: attempt.amount, currencyCode: "USD", tender: "card", paymentReference: paymentIntentId, soldAt: now, recordedById: recorder.userId || null,
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
      const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "exception", providerPaymentId: paymentIntentId, lastError: problem.slice(0, 1000) } });
      await createFinanceException(tx, { organizationId, key: `counter:${attempt.id}`, kind: "counter-payment", reference: paymentIntentId,
        summary: `${problem}. Refund the card payment or retry fulfilment from Card payments (${attempt.id}).` });
      return counterAttemptView(updated);
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "fulfilled", providerPaymentId: paymentIntentId, result, resolvedAt: now, lastError: "" } });
    return counterAttemptView(updated);
  });
}

async function releaseHeldAttempt(context: Context, attemptId: string, reason: string) {
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || !OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
    if (attempt.purpose === "retail_sale") {
      await siteLock(tx, { organizationId: attempt.organizationId }, attempt.locationId, false);
      for (const line of Array.isArray(attempt.quote?.lines) ? attempt.quote.lines : []) {
        const item = await tx.retailItem.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const balanceAfter = item.stockOnHand + line.quantity;
        if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 100_000_000) throw new Error("Released stock exceeds supported balance");
        await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
        await tx.retailStockEntry.create({ data: { organizationId: attempt.organizationId, locationId: attempt.locationId, itemId: item.id, eventKey: `release:${attempt.id}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Released card checkout ${attempt.id}: ${reason}`.slice(0, 1000), recordedById: attempt.recordedById || null } });
      }
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "released", resolvedAt: new Date(), lastError: reason.slice(0, 1000) } });
    return counterAttemptView(updated);
  });
}

/**
 * Staff cancel: the provider checkout is expired first, so a released hold can never be paid.
 * Without a confirmed checkout ID, the hold is released only once the fixed request's window has
 * ended; before that, the same request under the same key is resent to learn its checkout (never
 * a new one), and a suspended club waits for the window to end instead of contacting the provider.
 */
async function cancelCounterCheckout(context: Context, attempt: Attempt) {
  if (!OPEN_SALE_STATES.includes(attempt.status)) return counterAttemptView(attempt);
  const bound = attemptProviderBinding(attempt);
  let sessionId = attempt.providerCheckoutId;
  if (!sessionId) {
    const request = frozenRequest(attempt);
    if (!request) throw new Error("This card payment has no recorded checkout request. Reconcile it in the provider dashboard before releasing it.");
    if (requestDefinitelyExpired(attempt)) return releaseHeldAttempt(context, attempt.id, "Cancelled by staff; the checkout window ended, so no checkout from this sale can be paid");
    if (Date.now() >= new Date(request.expiresAt).getTime() || !(await organizationAcceptsNewActivity(context, attempt.organizationId))) {
      return counterAttemptView({ ...attempt, lastError: `The hold is released after the checkout window ends (${request.expiresAt}). Check again then.` });
    }
    const checkout = await createCounterProviderCheckout(context, attempt.organizationId, { request, providerKey: attempt.providerKey, bound });
    sessionId = checkout.providerSessionId;
    const prisma = guardKeystonePrismaResults(context.prisma as any);
    await prisma.counterPaymentAttempt.updateMany({ where: { id: attempt.id, status: { in: OPEN_SALE_STATES } }, data: { status: "open", providerCheckoutId: sessionId } });
  }
  const session = await expireCounterProviderCheckout(context, attempt.organizationId, sessionId, bound);
  const state = readCounterCheckout(session, { organizationId: attempt.organizationId, kind: kindOf(attempt), attemptId: attempt.id, amount: attempt.amount });
  if (state.state === "paid") return fulfillPaidAttempt(context, attempt.id, state.paymentIntentId);
  if (state.state === "expired") return releaseHeldAttempt(context, attempt.id, "Cancelled by staff before payment");
  throw new Error("The card checkout is still open at the provider; try again in a moment");
}

// ---------------------------------------------------------------- refunds

/** Reserves the returned units at their original price, then refunds the original card once. */
export async function startRetailCardRefund(context: Context, actor: RetailActor, data: any) {
  const saleId = trainingText(data?.saleId, "Sale", 200);
  const lines = requestLines(data?.lines);
  const requestKey = trainingText(data?.requestKey, "Request key", 200);
  const reason = trainingText(data?.reason, "Return reason", 1000);
  const requestHash = hashTrainerAppointmentRequest({ purpose: "retail_refund", saleId, lines, reason });
  const currentBinding = await counterReconcileBinding(context, actor.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-request:${actor.organizationId}:${requestKey}`);
    const existing = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, requestKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("This return was already started with different units; start a new return");
      return existing;
    }
    await lockTransactionKey(tx, retailSaleLockKey(saleId));
    const sale = await tx.retailSale.findUnique({ where: { id: saleId } });
    sameTenant(sale, actor, "Sale");
    if (sale.tender !== "card" || !sale.paymentReference) throw new Error("Only card sales refund to a card");
    const now = new Date();
    if (await tx.retailClose.findFirst({ where: { organizationId: actor.organizationId, locationId: sale.locationId, periodStart: { lte: now }, periodEnd: { gt: now } } })) throw new Error("The refund instant is already closed; retry with a current refund");
    const unavailable = await unavailableReturnUnits(tx, actor.organizationId, sale.id);
    let amount = 0;
    const snapshot: any[] = [];
    for (const line of lines) {
      const sold = (sale.lines || []).find((row: any) => row.itemId === line.itemId);
      if (!sold) throw new Error("Returned item was not in this sale");
      if ((unavailable.get(line.itemId) || 0) + line.quantity > sold.quantity) throw new Error("Return quantity exceeds unreturned sold units");
      const lineAmount = sold.unitAmount * line.quantity;
      amount += lineAmount;
      snapshot.push({ ...line, sku: sold.sku, name: sold.name, unitAmount: sold.unitAmount, lineAmount });
    }
    if (amount < 1) throw new Error("Choose at least one paid unit to refund");
    const provider = await refundBinding(tx, actor.organizationId, { saleRequestKey: sale.requestKey, paymentIntentId: sale.paymentReference }, currentBinding);
    const failed = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, purpose: "retail_refund", status: "refund_failed", quote: { path: ["saleId"], equals: sale.id } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } });
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor.organizationId, locationId: sale.locationId, purpose: "retail_refund", requestKey, requestHash, status: "refund_pending",
      amount, currencyCode: "USD", quote: { saleId: sale.id, paymentIntentId: sale.paymentReference, lines: snapshot, reason, provider, ...(failed ? { retryOf: failed.id } : {}) }, providerId: provider.providerId, recordedById: actor.userId,
    } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${actor.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, attempt);
}

/** Reserves every unused credit (blocking new bookings), then refunds them to the original card. */
export async function startTrainingCardRefund(context: Context, actor: TrainingActor, data: any) {
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const packageId = trainingText(data?.packageId, "Package", 200);
  const currentBinding = await counterReconcileBinding(context, actor.organizationId);
  const attempt = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `training-package:${packageId}`);
    const pending = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, purpose: "training_refund", status: "refund_pending", quote: { path: ["packageId"], equals: packageId } } });
    if (pending) return pending;
    const pack = await tx.trainingPackage.findUnique({ where: { id: packageId } });
    assertTrainingTenant(pack, actor, "Training package");
    if (pack.terms?.tender !== "card" || !pack.purchaseReference) throw new Error("Only card-paid packages refund to a card");
    if (pack.status !== "active") throw new Error("This package is already refunded");
    const active = await tx.trainerAppointment.count({ where: { organizationId: actor.organizationId, trainingPackageId: pack.id, status: { in: ["scheduled", "confirmed", "checked_in"] } } });
    if (active) throw new Error("Cancel or complete reserved appointments before refunding the package");
    const amount = unusedPackageRefundAmount(pack);
    if (amount < 1) throw new Error("This package has no unused paid credits to refund");
    const failures = await tx.counterPaymentAttempt.count({ where: { organizationId: actor.organizationId, purpose: "training_refund", quote: { path: ["packageId"], equals: pack.id } } });
    const reason = `Unused ${pack.serviceName} credits`;
    const provider = await refundBinding(tx, actor.organizationId, { paymentIntentId: pack.purchaseReference }, currentBinding);
    const failed = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: actor.organizationId, purpose: "training_refund", status: "refund_failed", quote: { path: ["packageId"], equals: pack.id } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } });
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: actor.organizationId, locationId: pack.locationId, purpose: "training_refund", requestKey: `training-refund:${pack.id}:${failures}`,
      requestHash: hashTrainerAppointmentRequest({ purpose: "training_refund", packageId: pack.id, amount, credits: pack.creditsRemaining }), status: "refund_pending",
      amount, currencyCode: "USD", quote: { packageId: pack.id, paymentIntentId: pack.purchaseReference, credits: pack.creditsRemaining, reason, provider, ...(failed ? { retryOf: failed.id } : {}) }, providerId: provider.providerId, recordedById: actor.userId,
    } });
    await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: 0 } });
    await tx.trainingCreditEntry.create({ data: { organizationId: actor.organizationId, trainingPackageId: pack.id, eventKey: `refund-reserved:${created.id}`, kind: "refund_reserved", quantity: -pack.creditsRemaining, balanceAfter: 0, actorId: actor.userId, reason } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${actor.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, attempt);
}

/**
 * The provider a refund must go to: the one the original card sale recorded, or, for a sale
 * taken before attempts recorded it, the current reconciling provider. A refund is refused
 * before anything is reserved when the original's provider is no longer the current one.
 */
async function refundBinding(tx: any, organizationId: string, original: { saleRequestKey?: string | null; paymentIntentId: string }, current: Awaited<ReturnType<typeof counterReconcileBinding>>) {
  const attemptId = original.saleRequestKey?.startsWith("card:") ? original.saleRequestKey.slice("card:".length) : null;
  const sale = await tx.counterPaymentAttempt.findFirst({
    where: { organizationId, purpose: { in: ["retail_sale", "training_sale"] }, ...(attemptId ? { id: attemptId } : { providerPaymentId: original.paymentIntentId }) },
  });
  const recorded = attemptProviderBinding(sale);
  if (recorded && !sameCounterProvider(current, recorded)) throw new Error(PROVIDER_CHANGED_MESSAGE);
  return recorded || current;
}

/**
 * Refunds a paid checkout that could not be fulfilled. The original attempt is claimed for
 * compensation (exception → compensating) in the same transaction that reserves the refund, so
 * no retry, status check or webhook can fulfil it while the refund is pending or unknown.
 */
async function refundCounterException(context: Context, attempt: Attempt, actorUserId: string) {
  if (!["exception", "compensating"].includes(attempt.status) || !attempt.providerPaymentId) throw new Error("Only a paid, unfulfilled checkout can be refunded here");
  const current = await counterReconcileBinding(context, attempt.organizationId);
  const recorded = attemptProviderBinding(attempt);
  if (recorded && !sameCounterProvider(current, recorded)) throw new Error(PROVIDER_CHANGED_MESSAGE);
  const binding = recorded || current;
  const refund = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-attempt:${attempt.id}`);
    const requestKey = `exception-refund:${attempt.id}`;
    const pending = await tx.counterPaymentAttempt.findFirst({ where: { organizationId: attempt.organizationId, requestKey, status: "refund_pending" } });
    if (pending) return pending;
    const claimed = await tx.counterPaymentAttempt.updateMany({ where: { id: attempt.id, status: "exception" }, data: { status: "compensating", lastError: "" } });
    if (claimed.count !== 1) throw new Error("This checkout is no longer awaiting staff action");
    const attempts = await tx.counterPaymentAttempt.count({ where: { organizationId: attempt.organizationId, purpose: "exception_refund", quote: { path: ["attemptId"], equals: attempt.id } } });
    // A new refund follows only a provider-confirmed failure (which is what returned the
    // payment to "exception"); it names that failed attempt, which itself is never changed.
    const failed = attempts ? await tx.counterPaymentAttempt.findFirst({ where: { organizationId: attempt.organizationId, purpose: "exception_refund", status: "refund_failed", quote: { path: ["attemptId"], equals: attempt.id } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } }) : null;
    if (attempts && !failed) throw new Error("An earlier refund of this payment isn't confirmed as failed; check it with Stripe first");
    const created = await tx.counterPaymentAttempt.create({ data: {
      organizationId: attempt.organizationId, locationId: attempt.locationId, purpose: "exception_refund", requestKey: attempts ? `${requestKey}:${attempts}` : requestKey,
      requestHash: hashTrainerAppointmentRequest({ purpose: "exception_refund", attemptId: attempt.id }), status: "refund_pending",
      amount: attempt.amount, currencyCode: "USD", providerId: binding.providerId, recordedById: actorUserId,
      quote: { attemptId: attempt.id, kind: kindOf(attempt), paymentIntentId: attempt.providerPaymentId, reason: "Paid counter sale could not be fulfilled", provider: binding, ...(failed ? { retryOf: failed.id } : {}) },
    } });
    return tx.counterPaymentAttempt.update({ where: { id: created.id }, data: { providerKey: `counter-refund:${attempt.organizationId}:${created.id}` } });
  });
  return executeCounterRefund(context, refund);
}

async function executeCounterRefund(context: Context, attempt: Attempt) {
  if (attempt.status !== "refund_pending") return counterAttemptView(attempt);
  let refund;
  try {
    refund = await findOrCreateCounterRefund(context, attempt.organizationId, {
      paymentIntentId: attempt.quote?.paymentIntentId, amount: attempt.amount, providerKey: attempt.providerKey, reason: attempt.quote?.reason || "", bound: attemptProviderBinding(attempt),
    });
  } catch (error) {
    await noteAttemptError(context, attempt.id, error);
    throw new Error("The card refund isn't confirmed yet. The units stay reserved; use Check status in Card payments to finish it without refunding twice.");
  }
  return applyCounterRefundOutcome(context, attempt.id, refund);
}

/** Applies one provider refund observation (action response, status check or webhook) under the attempt fence. */
export async function applyCounterRefundOutcome(context: Context, attemptId: string, refund: any) {
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `counter-attempt:${attemptId}`);
    const attempt = await tx.counterPaymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.status !== "refund_pending") return counterAttemptView(attempt);
    assertExactCounterRefund(refund, { paymentIntentId: attempt.quote?.paymentIntentId, amount: attempt.amount, providerKey: attempt.providerKey });
    const organizationId = attempt.organizationId;
    const now = new Date();
    if (refund.status === "succeeded") {
      let result: Record<string, string> = {};
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
          if (!Number.isSafeInteger(balanceAfter) || balanceAfter > 100_000_000) throw new Error("Returned stock exceeds supported balance");
          await tx.retailItem.update({ where: { id: item.id }, data: { stockOnHand: balanceAfter } });
          await tx.retailStockEntry.create({ data: { organizationId, locationId: sale.locationId, itemId: item.id, eventKey: `return:card-refund:${attempt.id}:${item.id}`, quantity: line.quantity, balanceAfter, reason: `Return: ${attempt.quote.reason}`.slice(0, 1000), recordedById: attempt.recordedById || null } });
        }
        const created = await tx.retailReturn.create({ data: {
          organizationId, locationId: sale.locationId, saleId: sale.id, requestKey: `card-refund:${attempt.id}`, requestHash: attempt.requestHash,
          lines: attempt.quote.lines, refundAmount: attempt.amount, refundReference: refund.id, tender: "card", reason: attempt.quote.reason, returnedAt: now, recordedById: attempt.recordedById || null,
        } });
        result = { returnId: created.id };
      } else if (attempt.purpose === "training_refund") {
        const pack = await tx.trainingPackage.findUnique({ where: { id: attempt.quote.packageId } });
        await tx.trainingPackage.update({ where: { id: pack.id }, data: { status: "refunded", refundAmount: attempt.amount, refundReference: refund.id, refundedAt: now, creditsRemaining: 0 } });
        await enqueueOperationalNotice(tx, { organizationId, memberId: pack.memberId, key: `training-package-refund:${pack.id}`, kind: "training",
          message: `The studio refunded ${pack.currencyCode} ${(attempt.amount / 100).toFixed(2)} to your card for unused ${pack.serviceName} credits. The remaining package credits are retired.` });
        result = { packageId: pack.id };
      } else if (attempt.purpose === "exception_refund") {
        await lockTransactionKey(tx, `counter-attempt:${attempt.quote.attemptId}`);
        const settled = await tx.counterPaymentAttempt.updateMany({ where: { id: attempt.quote.attemptId, status: "compensating" }, data: { status: "refunded", resolvedAt: now, result: { refundAttemptId: attempt.id } } });
        if (settled.count !== 1) {
          // Only a compensating original can be settled by this refund; anything else is contradictory money state.
          await createFinanceException(tx, { organizationId, key: `counter-compensation:${attempt.id}`, kind: "counter-payment", reference: refund.id,
            summary: `Refund ${refund.id} succeeded, but card payment ${attempt.quote.attemptId} was not awaiting that refund. Reconcile the sale and the refund from provider evidence.` });
        }
        result = { attemptId: attempt.quote.attemptId };
      }
      const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "refunded", providerRefundId: refund.id, result, resolvedAt: now, lastError: "" } });
      return counterAttemptView(updated);
    }
    if (refund.status === "failed" || refund.status === "canceled") {
      if (attempt.purpose === "exception_refund") {
        // A definite failure hands the original back to staff: refund again or retry fulfilment.
        await lockTransactionKey(tx, `counter-attempt:${attempt.quote.attemptId}`);
        await tx.counterPaymentAttempt.updateMany({ where: { id: attempt.quote.attemptId, status: "compensating" }, data: { status: "exception", lastError: `The refund was ${refund.status} at the provider` } });
      }
      if (attempt.purpose === "training_refund") {
        const pack = await tx.trainingPackage.findUnique({ where: { id: attempt.quote.packageId } });
        if (pack.status === "active" && pack.creditsRemaining === 0) {
          const restored = Number(attempt.quote.credits || 0);
          await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: restored } });
          await tx.trainingCreditEntry.create({ data: { organizationId, trainingPackageId: pack.id, eventKey: `refund-released:${attempt.id}`, kind: "refund_released", quantity: restored, balanceAfter: restored, actorId: attempt.recordedById || null, reason: `Card refund ${refund.status}` } });
        }
      }
      const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { status: "refund_failed", providerRefundId: refund.id, resolvedAt: now, lastError: `The provider reported the refund as ${refund.status}` } });
      return counterAttemptView(updated);
    }
    const updated = await tx.counterPaymentAttempt.update({ where: { id: attempt.id }, data: { providerRefundId: refund.id, lastError: "The refund is still processing at the provider" } });
    return counterAttemptView(updated);
  });
}

// ---------------------------------------------------------------- staff + webhook entry points

/** Staff authority for an attempt, read from the current Role row rather than the session snapshot. */
async function assertCanAct(context: Context, userId: string, attempt: Attempt) {
  const current = await withKeystonePrismaTransaction(context.prisma, (tx: any) =>
    lockCurrentActor(tx, userId, attempt.organizationId, [], { requireActiveOrganization: false }));
  const role = current.role;
  const allowed = kindOf(attempt) === "retail" ? role.canManageAllRecords || role.canManageRetail : role.canManageAllRecords || role.canManageAppointments;
  if (!allowed) throw new Error(kindOf(attempt) === "retail" ? "Retail management permission required" : "Training management permission required");
}

/** Staff actions on one attempt: status, cancel, refund (paid but unfulfilled) or retry fulfilment. */
export async function reconcileCounterPayment(_root: unknown, { attemptId, checkoutSessionId, action }: { attemptId?: string | null; checkoutSessionId?: string | null; action: string }, context: Context) {
  const session = context.session as any;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error("Authentication required");
  // The checkout return carries only the provider session id; it resolves inside this organization.
  const sessionId = String(checkoutSessionId || "");
  if (!attemptId && !/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)) throw new Error("Card payment was not found for this workspace");
  const attempt = await findAttempt(context, organizationId, attemptId ? { id: String(attemptId) } : { providerCheckoutId: sessionId });
  await assertCanAct(context, String(session.itemId), attempt);
  if (action === "status") {
    if (attempt.status === "refund_pending") return executeCounterRefund(context, attempt);
    if (attempt.status === "compensating") {
      const pending = await findAttempt(context, organizationId, { purpose: "exception_refund", status: "refund_pending", quote: { path: ["attemptId"], equals: attempt.id } });
      return executeCounterRefund(context, pending);
    }
    if (["retail_sale", "training_sale"].includes(attempt.purpose)) {
      if (OPEN_SALE_STATES.includes(attempt.status) && !attempt.providerCheckoutId) {
        // Opening a checkout is new activity; checking or settling an existing one is reconciliation.
        await assertActiveOrganization(context, organizationId);
        return openCounterCheckout(context, attempt);
      }
      return completeCounterCheckout(context, organizationId, { attemptId: attempt.id });
    }
    return counterAttemptView(attempt);
  }
  if (action === "cancel") return cancelCounterCheckout(context, attempt);
  if (action === "refund") {
    if (attempt.status === "compensating") {
      const pending = await findAttempt(context, organizationId, { purpose: "exception_refund", status: "refund_pending", quote: { path: ["attemptId"], equals: attempt.id } });
      return executeCounterRefund(context, pending);
    }
    return refundCounterException(context, attempt, session.itemId);
  }
  if (action === "retry") {
    if (attempt.status !== "exception" || !attempt.providerPaymentId) throw new Error("Only a paid, unfulfilled checkout can be retried");
    return fulfillPaidAttempt(context, attempt.id, attempt.providerPaymentId, true);
  }
  throw new Error("Unknown card payment action");
}

/** Signed checkout.session.completed / .expired for a counter checkout. */
export async function reconcileCounterCheckoutEvent(context: Context, organizationId: string, session: any) {
  const attemptId = session?.metadata?.attemptId;
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const attempt = attemptId ? await prisma.counterPaymentAttempt.findFirst({ where: { id: attemptId, organizationId } }) : null;
  if (!attempt) {
    if (session?.status === "complete" && session?.payment_status === "paid") {
      await withKeystonePrismaTransaction(context.prisma, (tx: any) => createFinanceException(tx, { organizationId, key: `counter-unmatched:${session.id}`, kind: "counter-payment",
        reference: String(session.payment_intent?.id || session.payment_intent || session.id), summary: "A paid counter card checkout has no matching Gym sale. Record or refund it from the provider evidence." }));
    }
    return { matched: false };
  }
  await completeCounterCheckout(context, organizationId, { attemptId: attempt.id });
  return { matched: true };
}

/** Signed refund observations (charge.refunded refunds[] or refund.*) for counter refunds. */
export async function reconcileCounterRefundEvent(context: Context, organizationId: string, refund: any) {
  const operationKey = refund?.metadata?.gymRefundOperationKey;
  if (typeof operationKey !== "string" || !operationKey.startsWith("counter-refund:")) return { matched: false };
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const attempt = await prisma.counterPaymentAttempt.findFirst({ where: { organizationId, providerKey: operationKey } });
  if (!attempt) return { matched: false };
  await applyCounterRefundOutcome(context, attempt.id, refund);
  return { matched: true };
}

/** Whether a provider payment intent belongs to this organization's counter payments. */
export async function ownsCounterPayment(prisma: any, organizationId: string, paymentIntentId: string) {
  const [attempt, sale, pack] = await Promise.all([
    prisma.counterPaymentAttempt.findFirst({ where: { organizationId, OR: [{ providerPaymentId: paymentIntentId }, { quote: { path: ["paymentIntentId"], equals: paymentIntentId } }] }, select: { id: true } }),
    prisma.retailSale.findFirst({ where: { organizationId, paymentReference: paymentIntentId, tender: "card" }, select: { id: true } }),
    prisma.trainingPackage.findFirst({ where: { organizationId, purchaseReference: paymentIntentId }, select: { id: true } }),
  ]);
  return Boolean(attempt || sale || pack);
}

const UNRESOLVED_STATUSES = ["reserved", "open", "exception", "compensating", "refund_pending"];
const CARD_PAGE_SIZE = 50;

/**
 * Card payments for the retail or training workspace: everything still needing staff action
 * (whatever its age), failed refunds not yet retried, and the last week's outcomes. The kind is
 * filtered in the query before the page limit, and older rows stay reachable with `skip`.
 */
export async function counterAttemptsForWorkspace(prisma: any, organizationId: string, kind: CounterKind, skip = 0) {
  const purposes = kind === "retail" ? ["retail_sale", "retail_refund"] : ["training_sale", "training_refund"];
  const where = {
    organizationId,
    OR: [{ purpose: { in: purposes } }, { purpose: "exception_refund", quote: { path: ["kind"], equals: kind } }],
    AND: [{ OR: [
      { status: { in: [...UNRESOLVED_STATUSES, "refund_failed"] } },
      { updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    ] }],
  };
  const offset = Number.isInteger(skip) && skip > 0 ? Math.min(skip, 100_000) : 0;
  const rows = await prisma.counterPaymentAttempt.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: CARD_PAGE_SIZE + 1,
    select: { id: true, purpose: true, status: true, amount: true, currencyCode: true, quote: true, result: true, lastError: true, createdAt: true, updatedAt: true, expiresAt: true, providerCheckoutId: true },
  });
  // A failed refund stays listed until a later attempt names it as its predecessor (or it is a week old).
  const failedIds = rows.filter((row: any) => row.status === "refund_failed").map((row: any) => row.id);
  const retried = failedIds.length ? new Set((await prisma.counterPaymentAttempt.findMany({
    where: { organizationId, OR: failedIds.map((id: string) => ({ quote: { path: ["retryOf"], equals: id } })) }, select: { quote: true },
  })).map((row: any) => row.quote?.retryOf)) : new Set();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const visible = rows.slice(0, CARD_PAGE_SIZE).filter((row: any) => row.status !== "refund_failed" || !retried.has(row.id) || new Date(row.updatedAt).getTime() >= weekAgo);
  return {
    hasMore: rows.length > CARD_PAGE_SIZE,
    skip: offset,
    rows: visible.map((row: any) => ({
      id: row.id, purpose: row.purpose, status: row.status, amount: row.amount, currencyCode: row.currencyCode,
      summary: row.purpose === "training_sale" ? `${row.quote?.terms?.serviceName || "Package"} · ${row.quote?.memberName || ""}`.trim()
        : row.purpose === "training_refund" ? `Refund ${row.quote?.credits ?? ""} unused credits`
        : row.purpose === "exception_refund" ? "Refund of unfulfilled card payment"
        : (row.quote?.lines || []).map((line: any) => `${line.quantity} × ${line.name}`).join(", "),
      checkoutUrl: row.status === "open" ? row.result?.checkoutUrl || null : null,
      retried: row.status === "refund_failed" && retried.has(row.id),
      lastError: row.lastError || "", createdAt: row.createdAt, expiresAt: row.expiresAt,
    })),
  };
}

export const counterPaymentTypeDefs = `extend type Mutation { reconcileCounterPayment(attemptId: ID, checkoutSessionId: String, action: String!): JSON! }`;
