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
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (configured?.trim()) return normalizeInternalOrigin(configured);

  const environment = options.environment ?? process.env.NODE_ENV;
  if (environment === "production") {
    throw new Error("A deployment-owned internal application URL is required for server-side Keystone requests in production");
  }

  const configuredPort = options.port ?? process.env.PORT ?? "3000";
  const port = /^\d+$/.test(configuredPort) && Number(configuredPort) > 0 && Number(configuredPort) <= 65535
    ? configuredPort
    : "3000";
  return `http://127.0.0.1:${port}`;
}

/** Cookie-bearing internal GraphQL calls never follow redirects to another origin. */
const INTERNAL_GRAPHQL_TIMEOUT_MS = 10_000;

export async function internalGraphqlFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
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
