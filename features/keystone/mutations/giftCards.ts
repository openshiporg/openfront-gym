import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { publicAppUrl } from "../lib/internal-origin";
import { budgetKey, consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { isKnownSource, requestClientSource } from "../../../lib/clientSource";
import { configuredStorefrontOrganization } from "../queries/publicGym";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { lockTransactionKey } from "./classCapacity";
import { retailActorFromContext } from "./retailPolicy";

/**
 * Gift cards (Mindbody / Square default): anyone buys a fixed amount on the storefront through Stripe
 * Checkout (payment mode). The card is issued only after Stripe reports the session paid, and the code
 * is shown on the return page and emailed to the recipient once. At the front desk staff look a code
 * up and redeem it against a sale or class; every debit appends to the card's ledger. An unused card
 * can be refunded in full to the buyer's card, which voids it.
 */
export const GIFT_CARD_SOURCE = "openfront-gym-gift-card";
export const GIFT_CARD_AMOUNTS = [2500, 5000, 7500, 10000, 15000, 20000];
const PROVIDER_CODE = "pp_stripe";
const CHECKOUT_MINUTES = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
type Ledger = Array<{ at: string; type: "issue" | "redeem" | "void"; amount: number; balance: number; ref: string; note?: string }>;

/** 12 hex characters in groups of four, derived from the paid checkout so a replay issues the same code. */
export function giftCodeFor(seed: string) {
  return crypto.createHash("sha256").update(`gym-gift:${seed}`).digest("hex").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
}
export function normalizeGiftCode(code: string) {
  const raw = String(code || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return raw.length === 12 ? raw.match(/.{4}/g)!.join("-") : "";
}
function orderToken(paymentSessionId: string) {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) throw new Error("Gift cards are unavailable on this deployment");
  return crypto.createHmac("sha256", secret).update(`gym-gift-order:${paymentSessionId}`).digest("hex");
}
function tokenOk(paymentSessionId: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) return false;
  const a = Buffer.from(orderToken(paymentSessionId)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function storefrontOrg(context: Context) {
  const org = await configuredStorefrontOrganization(context as any);
  if (!org?.salesOpen) throw new Error("Gift cards are unavailable right now");
  return org.id;
}

async function giftAdapter(context: Context, organizationId: string, purpose: "charge" | "reconcile") {
  const { provider, adapter } = await getAdapterForProvider(context.sudo() as Context, PROVIDER_CODE, organizationId, purpose);
  if (!adapter.createCounterCheckout || !adapter.retrieveCounterCheckout) throw new Error("Card checkout is not available for this payment provider");
  return { provider, adapter: adapter as typeof adapter & Required<Pick<typeof adapter, "createCounterCheckout" | "retrieveCounterCheckout">> };
}

export async function giftCardOptions(_root: unknown, _args: unknown, context: Context) {
  try {
    const organizationId = await storefrontOrg(context);
    await giftAdapter(context, organizationId, "charge");
    return { online: true, amounts: GIFT_CARD_AMOUNTS };
  } catch {
    return { online: false, amounts: [] };
  }
}

type StartArgs = { amount: number; purchaserName: string; purchaserEmail: string; recipientName?: string | null; recipientEmail?: string | null; message?: string | null };

export function validateGiftCardOrder(args: StartArgs) {
  if (!GIFT_CARD_AMOUNTS.includes(args.amount)) throw new Error("Choose one of the gift card amounts");
  const purchaserName = String(args.purchaserName || "").trim(), purchaserEmail = normalizeAuthIdentity(String(args.purchaserEmail || ""));
  const recipientEmail = args.recipientEmail?.trim() ? normalizeAuthIdentity(args.recipientEmail) : purchaserEmail;
  const recipientName = String(args.recipientName || "").trim() || purchaserName;
  const message = String(args.message || "").trim();
  if (!purchaserName || purchaserName.length > 120 || recipientName.length > 120 || /[\r\n]/.test(purchaserName + recipientName)) throw new Error("Enter your name");
  if (!EMAIL.test(purchaserEmail) || !EMAIL.test(recipientEmail) || purchaserEmail.length > 254 || recipientEmail.length > 254) throw new Error("Enter a valid email address");
  if (message.length > 500) throw new Error("Keep the message under 500 characters");
  return { amount: args.amount, purchaserName, purchaserEmail, recipientName, recipientEmail, message };
}

export async function startGiftCardCheckout(_root: unknown, args: StartArgs, context: Context) {
  const order = validateGiftCardOrder(args);
  const source = requestClientSource((context as any).req);
  if ((isKnownSource(source) && !(await consumeAuthAttempt(context.prisma, budgetKey("gift-card-source", source), 10, 15 * 60 * 1000))) ||
      !(await consumeAuthAttempt(context.prisma, budgetKey("gift-card", order.purchaserEmail, source), 5, 15 * 60 * 1000))) {
    throw new Error("Too many gift card orders. Try again in 15 minutes.");
  }
  const organizationId = await storefrontOrg(context);
  const { provider, adapter } = await giftAdapter(context, organizationId, "charge");
  const prisma = guardKeystonePrismaResults((context.sudo() as any).prisma);
  const key = `gift-card:${organizationId}:${crypto.randomUUID()}`;
  const local = await prisma.paymentSession.create({ data: {
    organizationId, paymentProviderId: provider.id, status: "processing", billingCycle: "gift-card", amount: order.amount, currencyCode: "USD",
    idempotencyKey: key, data: { kind: "gift-card", ...order },
  } });
  const back = `/gift-cards/order?ref=${encodeURIComponent(local.id)}&token=${orderToken(local.id)}`;
  try {
    const org = await prisma.organization.findFirst({ where: { id: organizationId }, select: { name: true } });
    const checkout = await adapter.createCounterCheckout({
      amount: order.amount, currencyCode: "USD",
      description: `${org?.name || "Club"} gift card · ${usd(order.amount)}`.slice(0, 200),
      metadata: { source: GIFT_CARD_SOURCE, organizationId, paymentSessionId: local.id },
      successUrl: publicAppUrl(back), cancelUrl: publicAppUrl(`${back}&result=cancelled`),
      expiresAt: new Date(Date.now() + CHECKOUT_MINUTES * 60_000 + 60_000),
      idempotencyKey: key, customerEmail: order.purchaserEmail,
    });
    await prisma.paymentSession.updateMany({
      where: { id: local.id, status: "processing" },
      data: { status: "requires_action", providerSessionId: checkout.providerSessionId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt ? new Date(checkout.expiresAt) : null },
    });
    return { checkoutUrl: checkout.checkoutUrl };
  } catch (error) {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: "processing" }, data: { status: "failed", failedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Checkout failed" } });
    throw new Error("Online gift cards are unavailable right now. Buy one at the front desk.");
  }
}

/** Issues the card exactly once for a paid session. Shared by the return page and the webhook. */
export async function fulfillGiftCardCheckout(context: Context, organizationId: string, providerSessionId: string) {
  const prisma = guardKeystonePrismaResults((context.sudo() as any).prisma);
  const local = await prisma.paymentSession.findFirst({ where: { organizationId, providerSessionId, billingCycle: "gift-card" } });
  if (!local) throw new Error("Gift card order not found");
  if (local.status === "completed") return local;
  const { adapter, provider } = await giftAdapter(context, organizationId, "reconcile");
  const session: any = await adapter.retrieveCounterCheckout(providerSessionId);
  const metadata = session?.metadata || {};
  if (session?.id !== providerSessionId || metadata.source !== GIFT_CARD_SOURCE || metadata.paymentSessionId !== local.id || metadata.organizationId !== organizationId) throw new Error("Checkout does not belong to this gift card order");
  if (session.amount_total !== local.amount || String(session.currency).toUpperCase() !== "USD") throw new Error("Gift card amount does not match the checkout");
  if (session.status === "expired") {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: { in: ["requires_action", "processing"] } }, data: { status: "expired" } });
    return { ...local, status: "expired" };
  }
  if (session.status !== "complete" || session.payment_status !== "paid") return local;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (!paymentIntentId) throw new Error("Paid checkout has no payment reference");
  const order = local.data || {};
  const issued = await withKeystonePrismaTransaction((context.sudo() as any).prisma, async (tx: any) => {
    await lockTransactionKey(tx, `gift-card:${local.id}`);
    const current = await tx.paymentSession.findFirst({ where: { id: local.id } });
    if (current.status === "completed") return { session: current, fresh: false };
    const now = new Date();
    const code = giftCodeFor(paymentIntentId);
    const expiresAt = new Date(now); expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const ledger: Ledger = [{ at: now.toISOString(), type: "issue", amount: local.amount, balance: local.amount, ref: paymentIntentId }];
    const card = await tx.giftCard.create({ data: {
      organizationId, code, status: "active", initialValue: local.amount, balance: local.amount,
      purchaserName: order.purchaserName || "", purchaserEmail: order.purchaserEmail || "", recipientName: order.recipientName || "", recipientEmail: order.recipientEmail || "", message: order.message || "",
      paymentSessionId: local.id, stripePaymentIntentId: paymentIntentId, expiresAt, activatedAt: now, ledger,
    } });
    const updated = await tx.paymentSession.update({ where: { id: local.id }, data: { status: "completed", completedAt: now, data: { ...order, giftCardId: card.id, paymentIntentId, providerPaymentProviderId: provider.id } } });
    return { session: updated, fresh: true };
  });
  if (issued.fresh) await emailGiftCard(prisma, String(issued.session.data?.giftCardId || ""));
  return issued.session;
}

/** The code goes to the recipient once (claimed by emailedAt); failure is logged and retried by staff resend. */
export async function emailGiftCard(prisma: any, giftCardId: string, send?: (mail: any) => Promise<{ sent: boolean }>) {
  try {
    const { mailDeliveryEnabled } = await import("../lib/mail");
    if (!giftCardId || (!send && !mailDeliveryEnabled())) return false;
    const claimed = await prisma.giftCard.updateMany({ where: { id: giftCardId, emailedAt: null, recipientEmail: { not: "" } }, data: { emailedAt: new Date() } });
    if (!claimed.count) return false;
    const card = await prisma.giftCard.findFirst({ where: { id: giftCardId }, include: { organization: { select: { name: true } } } });
    const sender = send || (await import("../lib/confirmation-mail")).sendConfirmationMail;
    const club = card.organization?.name || "the club";
    const from = card.purchaserName && card.purchaserEmail !== card.recipientEmail ? card.purchaserName : "";
    const result = await sender({
      to: card.recipientEmail,
      subject: from ? `${from} sent you a ${usd(card.initialValue)} gift card for ${club}` : `Your ${usd(card.initialValue)} gift card for ${club}`,
      heading: `${usd(card.initialValue)} to spend at ${club}`,
      lines: [
        ...(from ? [`Hi ${card.recipientName || "there"}, ${from} sent you a gift card.`] : []),
        ...(card.message ? [`"${card.message}"`] : []),
        `Code: ${card.code}`,
        `Show this code at the front desk for classes, passes or anything in the shop.${card.expiresAt ? ` Valid until ${card.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` : ""}`,
      ],
      link: { url: publicAppUrl("/schedule"), label: "See the schedule" },
    });
    if (!result.sent) await prisma.giftCard.updateMany({ where: { id: giftCardId }, data: { emailedAt: null } });
    return result.sent;
  } catch (error) {
    console.error("Gift card email failed:", error instanceof Error ? error.message : "unknown");
    await prisma.giftCard.updateMany({ where: { id: giftCardId }, data: { emailedAt: null } }).catch(() => undefined);
    return false;
  }
}

/** The buyer's return page: the signed ref proves the order is theirs. */
export async function confirmGiftCardOrder(_root: unknown, { ref, token }: { ref: string; token: string }, context: Context) {
  if (!ref || ref.length > 200 || !tokenOk(ref, token)) throw new Error("We couldn't find that gift card order");
  const prisma = guardKeystonePrismaResults((context.sudo() as any).prisma);
  let local = await prisma.paymentSession.findFirst({ where: { id: ref, billingCycle: "gift-card" } });
  if (!local) throw new Error("We couldn't find that gift card order");
  if (local.status === "requires_action" && local.providerSessionId) {
    try { local = await fulfillGiftCardCheckout(context, local.organizationId, local.providerSessionId); } catch { /* shown as still confirming */ }
  }
  const card = local.data?.giftCardId ? await prisma.giftCard.findFirst({ where: { id: String(local.data.giftCardId) } }) : null;
  return {
    status: card ? card.status : local.status === "expired" || local.status === "failed" ? "cancelled" : "pending",
    amount: local.amount, recipientName: local.data?.recipientName || null, recipientEmail: local.data?.recipientEmail || null,
    code: card && card.status !== "voided" ? card.code : null, expiresAt: card?.expiresAt?.toISOString() || null,
  };
}

// ------------------------------------------------------------------- front desk

function staffActor(context: Context) {
  return retailActorFromContext(context);
}

/** Front desk lookup: balance and history for a code in this club. */
export async function lookupGiftCard(_root: unknown, { code }: { code: string }, context: Context) {
  const actor = staffActor(context);
  const normalized = normalizeGiftCode(code);
  if (!normalized) throw new Error("Enter the 12-character gift card code");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const card = await prisma.giftCard.findFirst({ where: { organizationId: actor.organizationId, code: normalized } });
  if (!card) throw new Error("No gift card with that code");
  return { id: card.id, code: card.code, status: card.status, balance: card.balance, initialValue: card.initialValue, recipientName: card.recipientName, expiresAt: card.expiresAt?.toISOString() || null, ledger: card.ledger };
}

/** Debits a card for a front-desk sale; idempotent per request key. Throws if the card can't cover it. */
export async function redeemGiftCardAtomic(prisma: any, input: { organizationId: string; code: string; amount: number; requestKey: string; note: string }, now = new Date()) {
  const code = normalizeGiftCode(input.code);
  if (!code) throw new Error("Enter the 12-character gift card code");
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000) throw new Error("Enter the amount to take from the card");
  const requestKey = String(input.requestKey || "").trim();
  if (requestKey.length < 8 || requestKey.length > 200) throw new Error("Request key is required");
  const note = String(input.note || "").trim().slice(0, 200);
  if (!note) throw new Error("Say what the card paid for");
  return withKeystonePrismaTransaction(prisma, async (tx: any) => {
    await lockTransactionKey(tx, `gift-card-code:${input.organizationId}:${code}`);
    const card = await tx.giftCard.findFirst({ where: { organizationId: input.organizationId, code } });
    if (!card) throw new Error("No gift card with that code");
    const ledger: Ledger = Array.isArray(card.ledger) ? card.ledger : [];
    const replay = ledger.find((row) => row.ref === requestKey);
    if (replay) return { id: card.id, balance: card.balance, amount: replay.amount, reused: true };
    if (card.status !== "active") throw new Error(card.status === "redeemed" ? "This gift card has been used up" : "This gift card isn't active");
    if (card.expiresAt && card.expiresAt < now) throw new Error("This gift card has expired");
    if (card.balance < input.amount) throw new Error(`This gift card has ${usd(card.balance)} left. Take the rest another way.`);
    const balance = card.balance - input.amount;
    await tx.giftCard.update({ where: { id: card.id }, data: { balance, status: balance === 0 ? "redeemed" : "active", ledger: [...ledger, { at: now.toISOString(), type: "redeem", amount: input.amount, balance, ref: requestKey, note }] } });
    return { id: card.id, balance, amount: input.amount, reused: false };
  });
}

export async function redeemGiftCard(_root: unknown, { code, amount, requestKey, note }: { code: string; amount: number; requestKey: string; note: string }, context: Context) {
  const actor = staffActor(context);
  return redeemGiftCardAtomic(context.prisma, { organizationId: actor.organizationId, code, amount, requestKey, note });
}

/** Full refund of an unused card to the buyer's card; the card is voided first so it can't be spent meanwhile. */
export async function refundGiftCard(_root: unknown, { giftCardId }: { giftCardId: string }, context: Context) {
  const actor = staffActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const card = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    const row = await tx.giftCard.findFirst({ where: { id: giftCardId, organizationId: actor.organizationId } });
    if (!row) throw new Error("Gift card not found");
    await lockTransactionKey(tx, `gift-card-code:${actor.organizationId}:${row.code}`);
    const fresh = await tx.giftCard.findFirst({ where: { id: row.id } });
    if (fresh.status === "voided") return fresh;
    if (fresh.status !== "active" || fresh.balance !== fresh.initialValue) throw new Error("Only an unused gift card can be refunded");
    if (!fresh.stripePaymentIntentId) throw new Error("This gift card has no card payment to refund");
    const ledger: Ledger = Array.isArray(fresh.ledger) ? fresh.ledger : [];
    return tx.giftCard.update({ where: { id: fresh.id }, data: { status: "voided", balance: 0, ledger: [...ledger, { at: new Date().toISOString(), type: "void", amount: fresh.balance, balance: 0, ref: `refund:${fresh.id}`, note: "Refunded to the buyer's card" }] } });
  });
  if (card.refundedAt) return { id: card.id, status: card.status };
  const { adapter } = await giftAdapter(context, actor.organizationId, "reconcile");
  await adapter.refundPayment(card.stripePaymentIntentId, undefined, `gift-card-refund:${card.id}`);
  await prisma.giftCard.updateMany({ where: { id: card.id }, data: { refundedAt: new Date() } });
  return { id: card.id, status: "voided" };
}

export async function giftCardsWorkspace(_root: unknown, { skip = 0 }: { skip?: number }, context: Context) {
  const actor = staffActor(context);
  if (!Number.isInteger(skip) || skip < 0 || skip > 100_000) throw new Error("Invalid page");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const rows = await prisma.giftCard.findMany({
    where: { organizationId: actor.organizationId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take: 26,
    select: { id: true, code: true, status: true, initialValue: true, balance: true, purchaserName: true, recipientName: true, recipientEmail: true, expiresAt: true, createdAt: true, refundedAt: true },
  });
  return { cards: rows.slice(0, 25), hasMore: rows.length > 25, skip };
}

export const giftCardTypeDefs = `
  type GiftCardOptions { online: Boolean!, amounts: [Int!]! }
  type GiftCardCheckout { checkoutUrl: String! }
  type GiftCardOrder { status: String!, amount: Int!, recipientName: String, recipientEmail: String, code: String, expiresAt: String }
  extend type Query {
    giftCardOptions: GiftCardOptions!
    lookupGiftCard(code: String!): JSON!
    giftCardsWorkspace(skip: Int = 0): JSON!
  }
  extend type Mutation {
    startGiftCardCheckout(amount: Int!, purchaserName: String!, purchaserEmail: String!, recipientName: String, recipientEmail: String, message: String): GiftCardCheckout!
    confirmGiftCardOrder(ref: ID!, token: String!): GiftCardOrder!
    redeemGiftCard(code: String!, amount: Int!, requestKey: String!, note: String!): JSON!
    refundGiftCard(giftCardId: ID!): JSON!
  }
`;
