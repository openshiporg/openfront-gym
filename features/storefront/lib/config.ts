import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";
import { createInternalGraphqlFetch, endUserSource, internalGraphqlEndpoint } from "@/features/keystone/lib/internal-origin";

/** The customer's own network source, read from THIS request, so abuse budgets are per customer. */
async function customerSource(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return endUserSource(await headers());
  } catch {
    return null;
  }
}

/**
 * Storefront data/actions are server-only: they call Gym's own GraphQL over the deployment-owned
 * internal origin or same-process loopback, never the public proxy or a request-chosen host.
 * Nothing per-visitor is cached: each request builds its client with that visitor's signed source.
 */
class GymStorefrontClient {
  async request<T = any, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit
  ): Promise<T> {
    const client = new GraphQLClient(internalGraphqlEndpoint(), {
      credentials: "include",
      headers: { Connection: "keep-alive" },
      timeout: 10000,
      fetch: createInternalGraphqlFetch(await customerSource()),
    });
    return client.request(document, variables, new Headers(requestHeaders));
  }
}

export const gymClient = new GymStorefrontClient();
