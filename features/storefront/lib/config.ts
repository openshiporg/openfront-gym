import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";

async function getGraphQLEndpoint(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/graphql`;
  }
  // In the gym vertical Keystone runs on the same process as Next.js
  return "http://localhost:3000/api/graphql";
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
