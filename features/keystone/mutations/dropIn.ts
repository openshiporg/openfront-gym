import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { guardKeystonePrismaResults, requirePrismaAffectedCount, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { lockActiveOrganization } from "../lib/current-actor";
import { createFinanceException } from "../lib/operational-notices";
import { assertParticipationAllowed } from "../lib/operational-policy";
import { publicAppUrl } from "../lib/internal-origin";
import { assertSingleMerchantCheckout } from "../../integrations/payment/membership-checkout-core";
import { installedPaymentProviderWhere } from "../lib/stripe-environment-provider";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { DROP_IN_CLASS_FULL, createCapacityControlledBookingInTransaction, sendBookingConfirmation, lockTransactionKey } from "./classCapacity";

/**
 * Drop-in class sold online (Mindbody "drop-in" pricing option, Square "single class"): a signed-in
 * visitor without a membership pays the club's drop-in price for one class through Stripe Checkout
 * (payment mode), and the paid session books exactly that class. No membership, credit or tier is
 * involved. The booking is written only after the provider reports the session paid, under the same
 * class/member locks as every other booking; if the class filled while the visitor was paying, the
 * charge is refunded in full automatically.
 */
export const DROP_IN_SOURCE = "openfront-gym-drop-in";
const PROVIDER_CODE = "pp_stripe";
const CHECKOUT_MINUTES = 30;

function requireSession(context: Context) {
  const session = context.session as any;
  if (!session?.itemId) throw new Error("Sign in to book a drop-in class");
  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error("Account is not assigned to a club");
  return { userId: String(session.itemId), organizationId: String(organizationId) };
}

async function dropInAdapter(context: Context, organizationId: string, purpose: "charge" | "reconcile") {
  const { provider, adapter } = await getAdapterForProvider(context, PROVIDER_CODE, organizationId, purpose);
  if (purpose === "charge" && provider.adapterKey === "stripe") {
    const merchants = await context.sudo().query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: PROVIDER_CODE } }, { adapterKey: { equals: "stripe" } }, installedPaymentProviderWhere()] },
      take: 2, query: "id providerAccountId organization { id }",
    });
    assertSingleMerchantCheckout(merchants, organizationId);
  }
  if (!adapter.createCounterCheckout || !adapter.retrieveCounterCheckout) throw new Error("Card checkout is not available for this payment provider");
  return { provider, adapter: adapter as typeof adapter & Required<Pick<typeof adapter, "createCounterCheckout" | "retrieveCounterCheckout">> };
}

/** The visitor's own active Member profile, created on first purchase like membership checkout does. */
async function ensureVisitorProfile(tx: any, organizationId: string, user: any) {
  const existing = await tx.member.findFirst({ where: { organizationId, userId: user.id }, select: { id: true, status: true } });
  if (existing) {
    if (existing.status !== "active") throw new Error("Your club profile isn't active. Contact the front desk.");
    return existing.id as string;
  }
  const created = await tx.member.create({ data: {
    organizationId, userId: user.id, name: user.name || user.email, email: user.email, phone: user.phone || "", status: "active", joinDate: new Date(),
  }, select: { id: true } });
  return created.id as string;
}

export async function startDropInCheckout(_root: unknown, { classInstanceId }: { classInstanceId: string }, context: Context) {
  const { userId, organizationId } = requireSession(context);
  const id = String(classInstanceId || "").trim();
  if (!id || id.length > 200) throw new Error("Choose a class");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const [user, settings, instance] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, name: true, email: true, phone: true } }),
    prisma.gymSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { dropInPrice: true, currencyCode: true } }),
    prisma.classInstance.findFirst({ where: { id, organizationId }, include: { classSchedule: { select: { name: true, isActive: true, maxCapacity: true } } } }),
  ]);
  if (!user) throw new Error("Account not found");
  const amount = Number(settings?.dropInPrice ?? 0);
  if (!Number.isInteger(amount) || amount < 50) throw new Error("Drop-in classes aren't sold online. Contact the front desk to arrange a visit.");
  if (String(settings?.currencyCode || "USD").toUpperCase() !== "USD") throw new Error("Drop-in checkout supports USD only");
  if (!instance || instance.isCancelled || !instance.classSchedule?.isActive) throw new Error("This class isn't available to book");
  if (instance.date.getTime() <= Date.now()) throw new Error("This class has already started");
  const current = await prisma.membership.findFirst({ where: { organizationId, memberId: userId, status: { in: ["active", "frozen", "past-due"] } }, select: { status: true } });
  if (current?.status === "active") throw new Error("Your membership covers classes; book it directly");
  if (current) throw new Error("Your membership needs attention before you can book. Review it in your account.");
  const member = await prisma.member.findFirst({ where: { organizationId, userId }, select: { id: true } });
  if (member) {
    const duplicate = await prisma.classBooking.findFirst({ where: { organizationId, classInstanceId: id, memberId: member.id, status: { in: ["confirmed", "waitlist"] } }, select: { id: true } });
    if (duplicate) throw new Error("You're already booked for this class");
  }
  const confirmed = await prisma.classBooking.count({ where: { organizationId, classInstanceId: id, status: "confirmed" } });
  if (confirmed >= (instance.maxCapacity ?? instance.classSchedule?.maxCapacity ?? 20)) throw new Error("This class is full. Drop-ins can book classes with open spaces.");

  // An open checkout for the same class is reused instead of charging twice.
  const open = await prisma.paymentSession.findFirst({
    where: { organizationId, userId, billingCycle: "drop-in", status: "requires_action", expiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: "desc" }],
  });
  if (open?.data?.classInstanceId === id && open.checkoutUrl) return { id: open.id, checkoutUrl: open.checkoutUrl, amount: open.amount };

  const { provider, adapter } = await dropInAdapter(context, organizationId, "charge");
  const key = `drop-in:${organizationId}:${userId}:${id}:${crypto.randomUUID()}`;
  const local = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockActiveOrganization(tx, organizationId);
    // Waiver, age and closure rules are checked before payment, not discovered after it.
    if (member) await assertParticipationAllowed(tx, organizationId, member.id, instance.date, instance.locationId);
    return tx.paymentSession.create({ data: {
      organizationId, userId, paymentProviderId: provider.id, status: "processing", billingCycle: "drop-in", amount, currencyCode: "USD",
      idempotencyKey: key, data: { kind: "drop-in", classInstanceId: id, className: instance.classSchedule?.name || "Class", startsAt: instance.date.toISOString() },
    } });
  });
  const returnPath = `/schedule/drop-in?class=${encodeURIComponent(id)}`;
  try {
    const checkout = await adapter.createCounterCheckout({
      amount,
      currencyCode: "USD",
      description: `Drop-in: ${instance.classSchedule?.name || "Class"}`.slice(0, 200),
      metadata: { source: DROP_IN_SOURCE, organizationId, paymentSessionId: local.id, classInstanceId: id, userId },
      successUrl: `${publicAppUrl(returnPath)}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: publicAppUrl(`/schedule?book=${encodeURIComponent(id)}`),
      expiresAt: new Date(Date.now() + CHECKOUT_MINUTES * 60_000 + 60_000),
      idempotencyKey: key,
      customerEmail: user.email || undefined,
    });
    const saved = await prisma.paymentSession.updateMany({
      where: { id: local.id, status: "processing" },
      data: { status: "requires_action", providerSessionId: checkout.providerSessionId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt ? new Date(checkout.expiresAt) : null },
    });
    requirePrismaAffectedCount(saved, 1, "Drop-in checkout finalization");
    return { id: local.id, checkoutUrl: checkout.checkoutUrl, amount };
  } catch (error) {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: "processing" }, data: { status: "failed", failedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Checkout failed" } });
    throw error;
  }
}

/**
 * Books the paid class exactly once for a paid provider session. Shared by the visitor's return
 * page and the checkout.session.completed webhook; whichever arrives first books, the other reads.
 */
export async function fulfillDropInCheckout(context: Context, organizationId: string, providerSessionId: string) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const local = await prisma.paymentSession.findFirst({ where: { organizationId, providerSessionId, billingCycle: "drop-in" } });
  if (!local) throw new Error("Drop-in checkout not found");
  const { adapter, provider } = await dropInAdapter(context, organizationId, "reconcile");
  const session: any = await adapter.retrieveCounterCheckout(providerSessionId);
  const metadata = session?.metadata || {};
  if (session?.id !== providerSessionId || metadata.source !== DROP_IN_SOURCE || metadata.paymentSessionId !== local.id || metadata.organizationId !== organizationId) {
    throw new Error("Checkout does not belong to this drop-in");
  }
  if (session.amount_total !== local.amount || String(session.currency).toUpperCase() !== "USD") throw new Error("Drop-in amount does not match the checkout");
  if (session.status === "expired") {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: { in: ["requires_action", "processing"] } }, data: { status: "expired", provisioningLockedUntil: null } });
    return { state: "expired" as const, classInstanceId: local.data?.classInstanceId as string };
  }
  if (session.status !== "complete" || session.payment_status !== "paid") return { state: "pending" as const, classInstanceId: local.data?.classInstanceId as string };
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (!paymentIntentId) throw new Error("Paid checkout has no payment reference");
  const classInstanceId = String(local.data?.classInstanceId || "");

  const outcome = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `drop-in:${local.id}`);
    const current = await tx.paymentSession.findFirst({ where: { id: local.id } });
    if (current.status === "completed") return { state: current.data?.bookingId ? "booked" : "refunded", bookingId: current.data?.bookingId ?? null, fresh: false };
    const user = await tx.user.findFirst({ where: { id: local.userId, organizationId }, select: { id: true, name: true, email: true, phone: true } });
    if (!user) throw new Error("Drop-in account is missing");
    const memberId = await ensureVisitorProfile(tx, organizationId, user);
    const existingPayment = await tx.gymPayment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId }, select: { id: true } });
    if (!existingPayment) {
      await tx.gymPayment.create({ data: {
        organizationId, memberId, paymentProviderId: provider.id, paymentSessionId: local.id, amount: local.amount, currencyCode: "USD", status: "succeeded",
        paymentDate: new Date(), stripePaymentIntentId: paymentIntentId, receiptNumber: `DROPIN-${providerSessionId.slice(-12)}`,
        description: `Drop-in class: ${local.data?.className || "Class"}`, metadata: { kind: "drop-in", classInstanceId, providerSessionId },
      } });
    }
    let bookingId: string | null = null;
    let failure = "";
    try {
      await tx.$executeRaw`SAVEPOINT drop_in_booking`;
      const booked = await createCapacityControlledBookingInTransaction(tx, {
        classInstanceId, memberId, actorUserId: user.id, actorOrganizationId: organizationId, actorCanManageAllRecords: false, capacityMode: "reject",
        dropIn: { paymentSessionId: local.id, amount: local.amount, currencyCode: "USD" },
      });
      await tx.$executeRaw`RELEASE SAVEPOINT drop_in_booking`;
      bookingId = booked.bookingId;
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT drop_in_booking`;
      failure = error instanceof Error ? error.message : "The class could not be booked";
    }
    await tx.paymentSession.update({ where: { id: local.id }, data: {
      status: "completed", completedAt: new Date(), provisioningLockedUntil: null, lastError: failure.slice(0, 1000),
      data: { ...(local.data || {}), bookingId, paymentIntentId, bookingFailure: failure || null },
    } });
    return { state: bookingId ? "booked" : "refunded", bookingId, fresh: true, failure };
  });

  if (outcome.state === "booked" && outcome.fresh && outcome.bookingId) await sendBookingConfirmation(prisma, outcome.bookingId);
  if (outcome.state === "refunded" && outcome.fresh) {
    // The class could not take the visitor (it filled, was cancelled, or a policy blocked it): refund in full.
    try {
      await adapter.refundPayment(paymentIntentId, undefined, `drop-in-refund:${local.id}`);
      await prisma.gymPayment.updateMany({ where: { organizationId, stripePaymentIntentId: paymentIntentId }, data: { status: "refunded", refundAmount: local.amount, refundedAt: new Date(), refundReason: (outcome as any).failure || DROP_IN_CLASS_FULL } });
    } catch (error) {
      console.error("Drop-in automatic refund failed", { paymentSessionId: local.id, name: error instanceof Error ? error.name : "UnknownError" });
      // The session is already completed, so nothing retries this: put it in front of staff.
      await withKeystonePrismaTransaction(context.prisma, (tx: any) => createFinanceException(tx, { organizationId, key: `drop-in-refund:${local.id}`, kind: "drop-in-refund",
        reference: paymentIntentId, summary: `A drop-in payment (${paymentIntentId}) could not book its class and the automatic refund failed. Refund it from Payments.` })).catch(() => undefined);
    }
  }
  const final = await prisma.paymentSession.findFirst({ where: { id: local.id }, select: { lastError: true } });
  return { state: outcome.state as "booked" | "refunded", classInstanceId, bookingId: outcome.bookingId, message: final?.lastError || null };
}

/** The visitor's return from Stripe: only their own checkout can be confirmed. */
export async function completeDropInCheckout(_root: unknown, { providerSessionId }: { providerSessionId: string }, context: Context) {
  const { userId, organizationId } = requireSession(context);
  const id = String(providerSessionId || "").trim();
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(id)) throw new Error("Checkout reference is invalid");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const owned = await prisma.paymentSession.findFirst({ where: { organizationId, userId, providerSessionId: id, billingCycle: "drop-in" }, select: { id: true } });
  if (!owned) throw new Error("Checkout was not found for this account");
  return fulfillDropInCheckout(context, organizationId, id);
}

/**
 * Full refund for drop-in bookings that were just cancelled before the class (by the visitor, or the
 * club cancelling the class). Runs after the cancellation commits; idempotent per payment session.
 */
export async function refundCancelledDropIns(context: Context, organizationId: string, bookingIds: string[]) {
  if (!bookingIds.length) return { refunded: 0 };
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const bookings = await prisma.classBooking.findMany({ where: { organizationId, id: { in: bookingIds }, status: "cancelled", lateCancelled: false }, select: { id: true, serviceSnapshot: true } });
  let refunded = 0;
  for (const booking of bookings) {
    const credit = (booking.serviceSnapshot as any)?.credit;
    if (credit?.basis !== "drop_in_paid" || !credit.paymentSessionId) continue;
    const payment = await prisma.gymPayment.findFirst({ where: { organizationId, paymentSessionId: credit.paymentSessionId } });
    if (!payment?.stripePaymentIntentId || payment.status === "refunded") continue;
    try {
      const { adapter } = await dropInAdapter(context, organizationId, "reconcile");
      await adapter.refundPayment(payment.stripePaymentIntentId, undefined, `drop-in-refund:${credit.paymentSessionId}`);
      await prisma.gymPayment.updateMany({ where: { id: payment.id, status: { not: "refunded" } }, data: { status: "refunded", refundAmount: payment.amount, refundedAt: new Date(), refundReason: "Drop-in class cancelled before it started" } });
      refunded += 1;
    } catch (error) {
      console.error("Drop-in refund after cancellation failed", { bookingId: booking.id, name: error instanceof Error ? error.name : "UnknownError" });
      await withKeystonePrismaTransaction(context.prisma, (tx: any) => createFinanceException(tx, { organizationId, key: `drop-in-cancel-refund:${booking.id}`, kind: "drop-in-refund",
        reference: payment.stripePaymentIntentId, summary: `A drop-in booking was cancelled before the class but its refund (${payment.stripePaymentIntentId}) failed. Refund it from Payments.` })).catch(() => undefined);
    }
  }
  return { refunded };
}

export const dropInTypeDefs = `
  type DropInCheckoutResult { id: ID!, checkoutUrl: String!, amount: Int! }
  type DropInCompletionResult { state: String!, classInstanceId: ID, bookingId: ID, message: String }
  extend type Mutation {
    startDropInCheckout(classInstanceId: ID!): DropInCheckoutResult!
    completeDropInCheckout(providerSessionId: String!): DropInCompletionResult!
  }
`;
