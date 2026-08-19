import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { initiateMembershipCheckoutForUser } from "../../integrations/payment/membership-checkout-core";
import { provisionMembershipFromCheckoutSession } from "../../integrations/payment/provision-membership";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";

const PROVIDER_CODE = "pp_stripe";

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
  const { adapter } = await getAdapterForProvider(context, PROVIDER_CODE, organizationId);
  const deadline = Date.now() + 30_000;
  let claim: any;

  while (Date.now() < deadline) {
    const refundToken = crypto.randomUUID();
    claim = await context.prisma.$transaction(async (transaction: any) => {
      await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${paymentId}`}, 0))) AS acquired`;
      const payment = await transaction.gymPayment.findFirst({
        where: { id: paymentId, organizationId },
      });
      if (!payment) throw new Error("Payment not found");
      if (!payment.stripePaymentIntentId) throw new Error("Payment has no provider payment intent");
      const existing = await transaction.gymRefundAttempt.findUnique({ where: { organizationId_requestKey: { organizationId, requestKey } } });
      if (existing && amount != null && amount !== existing.amount) {
        throw new Error("This refund idempotency key was already used with a different amount");
      }
      if (existing?.status === "succeeded") return { done: true, paymentId: payment.id, attemptId: existing.id, refundAmount: existing.amount };

      const alreadyRefunded = Math.max(0, Math.min(payment.amount, payment.refundAmount ?? 0));
      const startingRefundAmount = existing?.startingRefundAmount ?? alreadyRefunded;
      const remaining = payment.amount - startingRefundAmount;
      const refundAmount = existing?.amount ?? amount ?? remaining;
      if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
        throw new Error("Refund amount must be a positive minor-unit amount within the remaining payment total");
      }
      const intendedCumulativeRefund = startingRefundAmount + refundAmount;
      if (existing && alreadyRefunded >= intendedCumulativeRefund) {
        await transaction.gymRefundAttempt.update({
          where: { id: existing.id },
          data: {
            status: "succeeded",
            providerRefundId: existing.providerRefundId || "reconciled-cumulative-provider-evidence",
            completedAt: new Date(),
            lastError: "",
          },
        });
        await transaction.gymPayment.update({
          where: { id: payment.id },
          data: { refundLockUntil: null, refundLockToken: "" },
        });
        return { done: true, paymentId: payment.id, attemptId: existing.id, refundAmount: existing.amount };
      }
      if (payment.status !== "succeeded") throw new Error("Only succeeded payments can be refunded");
      const lockActive = Boolean(payment.refundLockUntil && payment.refundLockUntil > new Date());
      if (lockActive) return { wait: true };

      const attempt = existing
        ? await transaction.gymRefundAttempt.update({
            where: { id: existing.id },
            data: { status: "processing", claimToken: refundToken, lastError: "", requestedAt: new Date() },
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
      };
    });
    if (!claim.wait) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claim || claim.wait) throw new Error("Refund remained busy; retry with the same idempotency key");
  if (claim.done) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });

  try {
    const providerRefund = await adapter.refundPayment(claim.paymentIntentId, claim.refundAmount, requestKey);
    if (providerRefund.status !== "succeeded") {
      throw new Error(`Refund was not confirmed by the payment provider (status: ${providerRefund.status || "unknown"})`);
    }
    const finalized = await context.prisma.$transaction(async (transaction: any) => {
      await transaction.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${claim.paymentId}`}, 0))) AS acquired`;
      const payment = await transaction.gymPayment.findFirst({
        where: { id: claim.paymentId, organizationId },
      });
      const attempt = await transaction.gymRefundAttempt.findUnique({ where: { id: claim.attemptId } });
      if (!payment || !attempt || attempt.status !== "processing" || attempt.claimToken !== claim.claimToken || payment.refundLockToken !== claim.claimToken) return false;
      const totalRefunded = reconcileProviderRefundCumulative(
        payment.amount,
        payment.refundAmount,
        claim.startingRefundAmount,
        claim.refundAmount,
      );
      const attemptUpdate = await transaction.gymRefundAttempt.updateMany({
        where: { id: attempt.id, status: "processing", claimToken: claim.claimToken },
        data: { status: "succeeded", providerRefundId: providerRefund.id, completedAt: new Date(), lastError: "" },
      });
      if (!attemptUpdate.count) return false;
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
      if (paymentUpdate.count === 1 && payment.stripePaymentIntentId) {
        const membershipPayments = await transaction.membershipPayment.findMany({
          where: {
            organizationId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            status: { in: ["completed", "refunded"] },
          },
        });
        for (const membershipPayment of membershipPayments) {
          const membershipRefundAmount = Math.max(membershipPayment.refundAmount ?? 0, totalRefunded);
          const membershipFullyRefunded = membershipRefundAmount >= membershipPayment.amount;
          await transaction.membershipPayment.update({
            where: { id: membershipPayment.id },
            data: {
              status: membershipFullyRefunded ? "refunded" : "completed",
              refundAmount: Math.min(membershipRefundAmount, membershipPayment.amount),
              refundedAt,
              refundReason: normalizedReason,
            },
          });
        }
      }
      return paymentUpdate.count === 1;
    });
    // A stale worker may have completed the provider call after a replacement claim. Its provider key is safe,
    // and the fenced finalization intentionally becomes a no-op.
    if (!finalized) return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
  } catch (error) {
    await context.prisma.$transaction(async (transaction: any) => {
      await transaction.gymRefundAttempt.updateMany({ where: { id: claim.attemptId, status: "processing", claimToken: claim.claimToken }, data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 2000) : "Refund provider failed" } });
      await transaction.gymPayment.updateMany({ where: { id: claim.paymentId, refundLockToken: claim.claimToken }, data: { refundLockUntil: null, refundLockToken: "" } });
    });
    throw error;
  }
  return context.db.GymPayment.findOne({ where: { id: claim.paymentId } });
}
