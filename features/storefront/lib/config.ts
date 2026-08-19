import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";

async function getGraphQLEndpoint(): Promise<string> {
  if (process.env.INTERNAL_GRAPHQL_URL) {
    return `${process.env.INTERNAL_GRAPHQL_URL.replace(/\/$/, "")}/api/graphql`;
  }
  // Storefront data/actions are server-only and must not traverse the public
  // Portless TLS proxy. Keystone runs in the same process.
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
    return client.request(document, variables, requestHeaders);
  }
}

export const gymClient = new GymStorefrontClient();
