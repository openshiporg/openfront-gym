import { createHmac, timingSafeEqual } from "node:crypto";
import { signInternalClientIdentity } from "../features/keystone/security/internalIdentity";

/**
 * The network source a request came from, for abuse budgets only (never for authorization).
 * The deployment proxy appends the connecting address last in X-Forwarded-For, so the last
 * entry is the one a client cannot choose. Gym's own server (storefront, dashboard, platform
 * actions) calls GraphQL over loopback on the customer's behalf and forwards the customer's
 * source as a short-lived HMAC identity, which is believed only from a loopback socket.
 */
export { signInternalClientIdentity };

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined> | undefined | null;

function header(headers: HeaderBag, name: string): string {
  if (!headers) return "";
  if (typeof (headers as any).get === "function") return String((headers as any).get(name) || "");
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeSource(value: string) {
  const trimmed = value.trim().slice(0, 64);
  return /^[0-9A-Fa-f:.]{2,64}$/.test(trimmed) ? trimmed : "";
}

/**
 * Forwarded addresses are believed only when the deployment declares that its proxy appends the
 * connecting address (CLIENT_SOURCE_TRUST_PROXY=true); otherwise a client could choose them.
 */
function proxyTrusted() {
  return process.env.CLIENT_SOURCE_TRUST_PROXY === "true";
}

export function clientSourceFromHeaders(headers: HeaderBag, remoteAddress = "") {
  if (proxyTrusted()) {
    const forwarded = header(headers, "x-forwarded-for").split(",").map((entry) => entry.trim()).filter(Boolean);
    const source = normalizeSource(forwarded.at(-1) || "") || normalizeSource(header(headers, "x-real-ip"));
    if (source) return source;
  }
  return normalizeSource(remoteAddress) || UNKNOWN_SOURCE;
}

export const UNKNOWN_SOURCE = "unknown";

/** An unknown source is shared by every such request, so it must never key a source-only budget. */
export function isKnownSource(source: string) {
  return Boolean(source) && source !== UNKNOWN_SOURCE;
}

const INTERNAL_IDENTITY_MAX_AGE_MS = 90_000;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** Hospital 861591a verifier: loopback socket only, well-formed headers, |age| <= 90s, HMAC, secret >= 32. */
export function verifiedInternalIdentity(
  headers: HeaderBag,
  socketAddress: string | null | undefined,
  secret: string = String(process.env.SESSION_SECRET || ""),
  now = Date.now(),
) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ""));
  if (!loopback || secret.length < 32) return null;
  const identity = header(headers, "x-openfront-client-identity");
  const timestamp = header(headers, "x-openfront-client-timestamp");
  const signature = header(headers, "x-openfront-client-signature");
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age = Math.abs(now - Number(timestamp) * 1_000);
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${identity}`).digest("hex");
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null;
}

/**
 * The trusted client source of a GraphQL request (Keystone context.req): the verified internal
 * identity first, else the existing trusted-proxy logic, else the socket.
 */
export function requestClientSource(req: any, secret?: string, now?: number) {
  const headers = req?.headers;
  const socketAddress = req?.socket?.remoteAddress || "";
  const internal = verifiedInternalIdentity(headers, socketAddress, secret, now);
  if (internal) return internal;
  return clientSourceFromHeaders(headers, socketAddress);
}
