import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";
import { resolveInternalBaseUrl } from "@/features/keystone/lib/internal-origin";
import { CLIENT_SOURCE_HEADER, clientSourceFromHeaders, signedClientSource } from "@/lib/clientSource";

/** The customer's network source, signed, so GraphQL abuse budgets are per customer, not per server. */
async function customerSourceHeader(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    return signedClientSource(clientSourceFromHeaders(await headers()));
  } catch {
    return "";
  }
}

// Storefront data/actions are server-only: they use the deployment-owned internal origin
// (INTERNAL_APP_URL / INTERNAL_GRAPHQL_URL) or same-process loopback, never the public
// proxy or request headers.
async function getGraphQLEndpoint(): Promise<string> {
  if (process.env.INTERNAL_APP_URL || process.env.INTERNAL_GRAPHQL_URL) return `${resolveInternalBaseUrl()}/api/graphql`;
  return `http://127.0.0.1:${process.env.PORT || process.env.PORTLESS_TARGET_PORT || "3000"}/api/graphql`;
}

class GymStorefrontClient {
  private clientPromise: Promise<GraphQLClient> | null = null;

  private async getClient(): Promise<GraphQLClient> {
    if (!this.clientPromise) {
      this.clientPromise = getGraphQLEndpoint().then(
        (endpoint) =>
          new GraphQLClient(endpoint, {
            credentials: "include",
            headers: { Connection: "keep-alive" },
            timeout: 10000,
          })
      );
    }
    return this.clientPromise;
  }

  async request<T = any, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit
  ): Promise<T> {
    const client = await this.getClient();
    const headers = new Headers(requestHeaders);
    const source = await customerSourceHeader();
    if (source) headers.set(CLIENT_SOURCE_HEADER, source);
    return client.request(document, variables, headers);
  }
}

export const gymClient = new GymStorefrontClient();
