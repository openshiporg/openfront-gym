import "server-only";
import { resolveInternalBaseUrl } from "@/features/keystone/lib/internal-origin";

/** Deployment-owned origin for server-side application self-calls. */
export async function getBaseUrl(): Promise<string> {
  return resolveInternalBaseUrl();
}

export async function getGraphQLEndpoint(): Promise<string> {
  return `${await getBaseUrl()}/api/graphql`;
}
