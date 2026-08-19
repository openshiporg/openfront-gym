import { getGraphQLEndpoint } from "@/features/dashboard/lib/getBaseUrl";

export async function executeDiscoveryGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(await getGraphQLEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || "Discovery operation failed");
  }
  return payload.data as T;
}
