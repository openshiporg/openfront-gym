export function assertExactSameOrigin(
  request: Request,
  configuredApplicationUrl?: string
): URL {
  const requestUrl = new URL(request.url);
  const applicationOrigin = configuredApplicationUrl
    ? new URL(configuredApplicationUrl).origin
    : requestUrl.origin;
  const origin = request.headers.get("origin");

  if (!origin || origin !== applicationOrigin) {
    throw new Error("Completion requests must come from the exact same origin.");
  }

  return new URL(requestUrl.pathname + requestUrl.search, applicationOrigin);
}

export function createInstanceScopedFetch(
  endpoint: URL,
  cookie: string,
  fetchImpl: typeof fetch = fetch
): typeof fetch {
  const allowedOrigin = endpoint.origin;

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(
      input instanceof Request ? input.url : input.toString(),
      endpoint
    );
    if (target.origin !== allowedOrigin) {
      throw new Error("Refusing to send completion credentials outside the completion instance origin.");
    }

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (cookie) headers.set("cookie", cookie);

    return fetchImpl(input, { ...init, headers });
  };
}

export async function isAuthenticatedDashboardRequest(
  requestUrl: URL,
  scopedFetch: typeof fetch
): Promise<boolean> {
  const response = await scopedFetch(new URL("/api/graphql", requestUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query CompletionActor {
        authenticatedItem {
          ... on User {
            id
            role { canAccessDashboard }
          }
        }
      }`,
    }),
  });
  if (!response.ok) return false;

  const result = (await response.json()) as {
    data?: { authenticatedItem?: { id?: string; role?: { canAccessDashboard?: boolean } | null } | null };
  };
  return Boolean(
    result.data?.authenticatedItem?.id &&
      result.data.authenticatedItem.role?.canAccessDashboard
  );
}
