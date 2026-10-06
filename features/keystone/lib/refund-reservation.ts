import crypto from "node:crypto";

const REFUND_RESERVATION_PREFIX = "gym-refund-reservation:v1:";

export type RefundReservation = {
  version: 1;
  paymentId: string;
  providerId: string;
  paymentIntentId: string;
  requestKey: string;
  providerRequestKey: string;
  amount: number;
  startingRefundAmount: number;
  currencyCode: "USD";
  reason: string;
};

export function parseRefundReservation(value: unknown): RefundReservation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reservation = value as Record<string, unknown>;
  if (
    reservation.version !== 1 ||
    typeof reservation.paymentId !== "string" || !reservation.paymentId ||
    typeof reservation.providerId !== "string" || !reservation.providerId ||
    typeof reservation.paymentIntentId !== "string" || !reservation.paymentIntentId ||
    typeof reservation.requestKey !== "string" || !reservation.requestKey ||
    typeof reservation.providerRequestKey !== "string" || !reservation.providerRequestKey ||
    !Number.isSafeInteger(reservation.amount) || (reservation.amount as number) <= 0 ||
    !Number.isSafeInteger(reservation.startingRefundAmount) || (reservation.startingRefundAmount as number) < 0 ||
    reservation.currencyCode !== "USD" ||
    typeof reservation.reason !== "string"
  ) return null;
  return reservation as RefundReservation;
}

export function encodeRefundReservation(reservation: RefundReservation, detail = "") {
  const payload = Buffer.from(JSON.stringify({ reservation, detail }), "utf8").toString("base64url");
  return `${REFUND_RESERVATION_PREFIX}${payload}`;
}

/** Reads the typed column first and the legacy lastError envelope only during migration compatibility. */
export function readRefundReservation(attempt: any): { reservation: RefundReservation; detail: string; source: "column" | "legacy" } | null {
  const reservation = parseRefundReservation(attempt?.reservation);
  if (reservation) {
    return { reservation, detail: typeof attempt.lastError === "string" ? attempt.lastError : "", source: "column" };
  }
  const legacy = decodeRefundReservation(attempt?.lastError);
  return legacy ? { ...legacy, source: "legacy" } : null;
}

export function decodeRefundReservation(value: unknown): { reservation: RefundReservation; detail: string } | null {
  if (typeof value !== "string" || !value.startsWith(REFUND_RESERVATION_PREFIX)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value.slice(REFUND_RESERVATION_PREFIX.length), "base64url").toString("utf8"));
    const reservation = parseRefundReservation(decoded?.reservation);
    if (!reservation) return null;
    return { reservation, detail: typeof decoded.detail === "string" ? decoded.detail : "" };
  } catch {
    return null;
  }
}

export function assertSameRefundReservation(reservation: RefundReservation, expected: RefundReservation) {
  for (const key of Object.keys(expected) as Array<keyof RefundReservation>) {
    if (reservation[key] !== expected[key]) throw new Error("This refund idempotency key was already reserved with different payment, provider, amount, currency, or reason evidence");
  }
}

export function providerRefundOperationKey(organizationId: string, paymentId: string, requestId: string) {
  const identity = crypto.createHash("sha256").update(JSON.stringify([organizationId, paymentId, requestId])).digest("hex");
  return `gym-refund:${identity}`;
}

function providerRefundPaymentIntent(refund: any) {
  return typeof refund?.payment_intent === "string" ? refund.payment_intent : refund?.payment_intent?.id;
}

export function assertExactProviderRefund(refund: any, reservation: RefundReservation) {
  if (!refund || typeof refund.id !== "string" || !refund.id ||
      providerRefundPaymentIntent(refund) !== reservation.paymentIntentId ||
      refund.amount !== reservation.amount || String(refund.currency || "").toUpperCase() !== reservation.currencyCode ||
      refund.metadata?.gymRefundOperationKey !== reservation.providerRequestKey ||
      String(refund.metadata?.gymRefundCurrency || "").toUpperCase() !== reservation.currencyCode ||
      String(refund.metadata?.gymRefundReason ?? "") !== reservation.reason) {
    throw new Error("Provider refund does not match the frozen payment, amount, currency, reason, and operation identity; operator reconciliation required");
  }
}
