import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The network source a request came from, for abuse budgets only (never for authorization).
 * The deployment proxy appends the connecting address last in X-Forwarded-For, so the last
 * entry is the one a client cannot choose. The storefront server, which calls GraphQL on the
 * customer's behalf, forwards the customer's source in a header signed with SESSION_SECRET.
 */
export const CLIENT_SOURCE_HEADER = "x-gym-client-source";

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

function signature(source: string) {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32) return "";
  return createHmac("sha256", secret).update(`client-source:${source}`).digest("base64url").slice(0, 32);
}

/** Header value the storefront server attaches to its GraphQL calls. */
export function signedClientSource(source: string) {
  const normalized = normalizeSource(source) || "unknown";
  const signed = signature(normalized);
  return signed ? `${normalized}.${signed}` : "";
}

/** The trusted client source of a GraphQL request (Keystone context.req). */
export function requestClientSource(req: any) {
  const headers = req?.headers;
  const claimed = header(headers, CLIENT_SOURCE_HEADER);
  const separator = claimed.lastIndexOf(".");
  if (separator > 0) {
    const source = claimed.slice(0, separator);
    const expected = signature(source);
    const supplied = claimed.slice(separator + 1);
    if (expected && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return source;
  }
  return clientSourceFromHeaders(headers, req?.socket?.remoteAddress || "");
}
