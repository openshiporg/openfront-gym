import { signInternalClientIdentity } from "../security/internalIdentity";
import { clientSourceFromHeaders as trustedProxySource, isKnownSource } from "../../../lib/clientSource";

type InternalOriginOptions = {
  configuredInternalUrl?: string;
  environment?: string;
  port?: string;
};

/** Parse a deployment-owned application URL into a trusted HTTP(S) origin. */
export function normalizeInternalOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Internal application URL must be an absolute HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Internal application URL must be an HTTP(S) origin without credentials or a path");
  }

  return url.origin;
}

/** Request Host and forwarded headers are deliberately not inputs to this resolver. */
export function resolveInternalBaseUrl(options: InternalOriginOptions = {}): string {
  const configured = options.configuredInternalUrl ||
    process.env.INTERNAL_APP_URL ||
    process.env.INTERNAL_GRAPHQL_URL;
  if (configured?.trim()) return normalizeInternalOrigin(configured);

  // Server-side calls go to this process over loopback, so they stop sharing the platform's
  // egress IP bucket. A missing or invalid PORT keeps the public origin exactly as before.
  const loopback = tryLoopbackOrigin(options.port ?? (process.env.PORT || process.env.PORTLESS_TARGET_PORT));
  if (loopback) return loopback;

  const publicOrigin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (publicOrigin?.trim()) return normalizeInternalOrigin(publicOrigin);

  const environment = options.environment ?? process.env.NODE_ENV;
  if (environment === "production") {
    throw new Error("A deployment-owned internal application URL is required for server-side Keystone requests in production");
  }

  return loopbackOrigin(options.port ?? process.env.PORT);
}

/**
 * Same-process loopback. Next sets PORT for the server it starts, so the port always comes
 * from the running process; a missing or invalid port is an error, never a guessed default.
 */
export function loopbackOrigin(port: string | undefined = process.env.PORT || process.env.PORTLESS_TARGET_PORT): string {
  const origin = tryLoopbackOrigin(port);
  if (!origin) {
    throw new Error("Set INTERNAL_APP_URL, or run under a server that sets PORT, for server-side Keystone requests");
  }
  return origin;
}

/** The single loopback resolver: 127.0.0.1 on the process port, or null when the port is unknown. */
export function tryLoopbackOrigin(port: string | undefined = process.env.PORT || process.env.PORTLESS_TARGET_PORT): string | null {
  const value = String(port ?? "").trim();
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) return null;
  return `http://127.0.0.1:${value}`;
}

function isLoopbackOrigin(origin: string) {
  try {
    return new URL(origin).hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

type HeaderReader = { get(name: string): string | null };

/**
 * The END user's real client address from the incoming request (x-real-ip on Railway), so every
 * visitor keeps their own bucket. Never a constant shared by all visitors.
 */
export function clientSourceFromHeaders(headers: HeaderReader | null | undefined): string | null {
  if (!headers) return null;
  const realIp = (headers.get("x-real-ip") || "").split(",")[0]?.trim();
  if (realIp) return realIp;
  const forwarded = (headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return forwarded || null;
}

/**
 * The source Gym's server signs for an end user. On Railway the edge sets x-real-ip, so the
 * hospital order applies; elsewhere forwarded headers are believed only under Gym's existing
 * trusted-proxy rule (CLIENT_SOURCE_TRUST_PROXY), never because a client sent them.
 */
export function endUserSource(headers: HeaderReader | null | undefined): string | null {
  if (!headers) return null;
  if (process.env.RAILWAY_ENVIRONMENT) return clientSourceFromHeaders(headers);
  const trusted = trustedProxySource(headers);
  return isKnownSource(trusted) ? trusted : null;
}

/** Signed identity headers, or {} (unsigned, today's behaviour) when no source/secret. Never throws. */
export function internalIdentityHeaders(
  source: string | null | undefined,
  secret: string = String(process.env.SESSION_SECRET || ""),
  now = Date.now(),
): Record<string, string> {
  try {
    if (!source) return {};
    const signed = signInternalClientIdentity(source, secret, now);
    if (!signed) return {};
    return {
      "x-openfront-client-identity": signed.identity,
      "x-openfront-client-timestamp": signed.timestamp,
      "x-openfront-client-signature": signed.signature,
    };
  } catch {
    return {};
  }
}

/**
 * The browser-facing origin customers and staff are sent back to (provider success, cancel and
 * portal return URLs). It is NEXTAUTH_URL (or NEXT_PUBLIC_BACKEND_URL), never the internal
 * service origin and never a request header.
 */
export function resolvePublicBaseUrl(): string {
  const configured = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured?.trim()) throw new Error("Application base URL is not configured");
  return normalizeInternalOrigin(configured);
}

/** An absolute URL on the public origin for a local path such as `/account/membership`. */
export function publicAppUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Return path must be a local path");
  const origin = resolvePublicBaseUrl();
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Return path must stay on the Gym origin");
  return url.toString();
}

/** Gym's own GraphQL endpoint for server-side calls that carry credentials; never derived from request headers. */
export function internalGraphqlEndpoint(): string {
  return `${resolveInternalBaseUrl()}/api/graphql`;
}

/** Cookie-bearing internal GraphQL calls never follow redirects to another origin. */
const INTERNAL_GRAPHQL_TIMEOUT_MS = 10_000;

/**
 * A fetch for one request's internal GraphQL calls: the end user's source is signed afresh on
 * every call (never cached across visitors), and only when the target is this process's loopback.
 */
export function createInternalGraphqlFetch(source: string | null | undefined): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => internalGraphqlFetch(input, init, source)) as typeof fetch;
}

export async function internalGraphqlFetch(input: RequestInfo | URL, init?: RequestInit, source?: string | null): Promise<Response> {
  const origin = resolveInternalBaseUrl();
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl, `${origin}/api/graphql`);
  if (url.origin !== origin || url.username || url.password || url.pathname !== "/api/graphql" || url.search || url.hash) {
    throw new Error("Internal GraphQL requests must target the configured Gym endpoint");
  }

  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortWithCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortWithCaller();
  else callerSignal?.addEventListener("abort", abortWithCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("Internal GraphQL request timed out")),
    INTERNAL_GRAPHQL_TIMEOUT_MS,
  );
  try {
    const headers = new Headers(init?.headers);
    if (isLoopbackOrigin(origin)) {
      for (const [name, value] of Object.entries(internalIdentityHeaders(source))) headers.set(name, value);
    }
    const response = await fetch(url, { ...init, headers, signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Internal GraphQL requests must not redirect");
    }
    return response;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortWithCaller);
  }
}
