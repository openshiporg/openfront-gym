import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { initiateMembershipCheckoutForUser } from "../../integrations/payment/membership-checkout-core";
import { provisionMembershipFromCheckoutSession } from "../../integrations/payment/provision-membership";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { requirePrismaAffectedCount, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { assertExactProviderRefund, assertSameRefundReservation, providerRefundOperationKey, readRefundReservation, type RefundReservation } from "../lib/refund-reservation";

const PROVIDER_CODE = "pp_stripe";

export async function acquireRefundAdvisoryLock(transaction: any, paymentId: string) {
  const lockResult = await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${paymentId}`}, 0))) AS acquired`;
  if (lockResult instanceof Error) throw lockResult;
}

export function reconcileProviderRefundCumulative(
  paymentAmount: number,
  currentRefundAmount: number | null,
  startingRefundAmount: number,
  attemptAmount: number,
) {
  const intendedCumulativeRefund = startingRefundAmount + attemptAmount;
  const totalRefunded = Math.max(currentRefundAmount ?? 0, intendedCumulativeRefund);
  if (
    ![paymentAmount, currentRefundAmount ?? 0, startingRefundAmount, attemptAmount, totalRefunded].every(Number.isInteger) ||
    startingRefundAmount < 0 ||
    attemptAmount <= 0 ||
    totalRefunded > paymentAmount
  ) {
    throw new Error("Cumulative refund exceeds the payment total");
  }
  return totalRefunded;
}

function requireSession(context: Context) {
  const session = context.session as any;
  if (!session?.itemId) throw new Error("Authentication required");
  return session;
}

export async function initiateMembershipCheckout(
  root: unknown,
  { tierId, billingCycle }: { tierId: string; billingCycle: string },
  context: Context
) {
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
    baseUrl,
  });
}

export async function completeMembershipCheckout(
  _root: unknown,
  { providerSessionId }: { providerSessionId: string },
  context: Context,
) {
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
        { user: { id: { equals: session.itemId } } },
      ],
    },
    take: 1,
    query: "id",
  });
  if (!owned[0]) throw new Error("Checkout session was not found for this account");
  return provisionMembershipFromCheckoutSession(normalizedSessionId, organizationId, context);
}

export async function refundGymPayment(
  root: unknown,
  { paymentId, amount, reason, idempotencyKey }: { paymentId: string; amount?: number | null; reason?: string | null; idempotencyKey: string },
  context: Context
) {
  const session = requireSession(context);
  if (!session.data?.role?.canManageAllRecords) throw new Error("Payment management permission required");

  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error("Organization context required");
  const requestId = idempotencyKey.trim();
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Refund reason must be 500 characters or fewer");
  if (requestId.length < 12 || requestId.length > 200) throw new Error("A unique refund idempotency key is required");
  const requestKey = `gym-refund:${paymentId}:${requestId}`;
  const { provider, adapter } = await getAdapterForProvider(context, PROVIDER_CODE, organizationId);
  const deadline = Date.now() + 30_000;
  let claim: any;

  while (Date.now() < deadline) {
    const refundToken = crypto.randomUUID();
    claim = await withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
      await acquireRefundAdvisoryLock(transaction, paymentId);
      const payment = await transaction.gymPayment.findFirst({
        where: { id: paymentId, organizationId },
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
      const reservation: RefundReservation = {
        version: 1,
        paymentId: payment.id,
        providerId: provider.id,
        paymentIntentId: payment.stripePaymentIntentId,
        requestKey,
        providerRequestKey: expectedProviderKey,
        amount: refundAmount,
        startingRefundAmount,
        currencyCode: "USD",
        reason: normalizedReason,
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
        select: { id: true },
      });
      if (unresolved && unresolved.id !== existing?.id) {
        throw new Error("Another refund has an unresolved provider outcome; retry its original idempotency key before starting another refund");
      }
      if (payment.status !== "succeeded") throw new Error("Only succeeded payments can be refunded");
      const lockActive = Boolean(payment.refundLockUntil && payment.refundLockUntil > new Date());
      if (lockActive) return { wait: true };

      const attempt = existing
        ? await transaction.gymRefundAttempt.update({
            where: { id: existing.id },
            data: { status: "processing", claimToken: refundToken, reservation: frozenReservation, lastError: stored?.detail || "", requestedAt: new Date() },
          })
        : await transaction.gymRefundAttempt.create({
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
              requestedAt: new Date(),
            },
          });
      await transaction.gymPayment.update({ where: { id: payment.id }, data: { refundLockUntil: new Date(Date.now() + 10 * 60 * 1000), refundLockToken: refundToken } });
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
        reservation: frozenReservation,
      };
    });
    if (!claim.wait) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claim || claim.wait) throw new Error("Refund remained busy; retry with the same idempotency key");
  if (claim.done) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });

  let providerRefund: any = null;
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
        reason: claim.reason,
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
    const finalized = await withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
      await acquireRefundAdvisoryLock(transaction, claim.paymentId);
      const payment = await transaction.gymPayment.findFirst({
        where: { id: claim.paymentId, organizationId },
      });
      const attempt = await transaction.gymRefundAttempt.findUnique({ where: { id: claim.attemptId } });
      if (!payment || !attempt) return false;
      if (attempt.status === "succeeded" && attempt.providerRefundId === providerRefund.id) return true;
      if (attempt.status !== "processing" || attempt.claimToken !== claim.claimToken || payment.refundLockToken !== claim.claimToken) return false;
      if (payment.stripePaymentIntentId !== claim.paymentIntentId || String(payment.currencyCode || "").toUpperCase() !== claim.currencyCode || (payment.paymentProviderId && payment.paymentProviderId !== provider.id)) {
        throw new Error("Payment identity changed while refund was in flight; operator reconciliation required");
      }
      const membershipPayments = payment.stripeInvoiceId ? await transaction.membershipPayment.findMany({
        where: { organizationId, stripePaymentIntentId: claim.paymentIntentId, status: { in: ["completed", "refunded", "disputed"] } },
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
        data: { status: "succeeded", providerRefundId: providerRefund.id, completedAt: new Date(), reservation: claim.reservation, lastError: "" },
      });
      if (!attemptUpdate.count) return false;
      requirePrismaAffectedCount(attemptUpdate, 1, "refund attempt finalization fence");
      const refundedAt = new Date();
      const fullyRefunded = totalRefunded >= payment.amount;
      const paymentUpdate = await transaction.gymPayment.updateMany({
        where: { id: payment.id, refundLockToken: claim.claimToken },
        data: {
          status: fullyRefunded ? "refunded" : "succeeded",
          refundAmount: totalRefunded,
          refundedAt,
          refundReason: normalizedReason,
          refundLockUntil: null,
          refundLockToken: "",
        },
      });
      requirePrismaAffectedCount(paymentUpdate, 1, "gym payment refund finalization fence");
      if (memberReceipt) {
        await transaction.membershipPayment.update({
          where: { id: memberReceipt.id },
          data: {
            status: fullyRefunded ? "refunded" : memberReceipt.status === "disputed" ? "disputed" : "completed",
            refundAmount: totalRefunded,
            refundedAt,
            refundReason: normalizedReason,
          },
        });
      }
      return true;
    });
    // A stale worker may have completed the provider call after a replacement claim. Its provider key is safe,
    // and the fenced finalization intentionally becomes a no-op.
    if (!finalized) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 2000) : "Refund provider outcome requires reconciliation";
    const definiteProviderFailure = providerResponseMatchesReservation && ["failed", "canceled"].includes(providerRefund?.status);
    await withKeystonePrismaTransaction(context.prisma, async (transaction: any) => {
      const attemptUpdate = await transaction.gymRefundAttempt.updateMany({
        where: { id: claim.attemptId, status: "processing", claimToken: claim.claimToken },
        data: {
          status: definiteProviderFailure ? "failed" : "processing",
          ...(providerRefund?.id ? { providerRefundId: providerRefund.id } : {}),
          reservation: claim.reservation,
          lastError: detail,
        },
      });
      if (attemptUpdate.count > 1) requirePrismaAffectedCount(attemptUpdate, 1, "refund outcome fence");
      await transaction.gymPayment.updateMany({ where: { id: claim.paymentId, refundLockToken: claim.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    });
    throw error;
  }
  return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
}
