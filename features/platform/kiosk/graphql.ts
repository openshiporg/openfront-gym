import { getGraphQLEndpoint } from "@/features/dashboard/lib/getBaseUrl";
import { getKioskOrganizationId } from "./auth";

async function execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(await getGraphQLEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || "Kiosk operation failed");
  }
  return payload.data as T;
}

export async function executeKioskGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const credential = process.env.KIOSK_API_TOKEN?.trim();
  const organizationId = getKioskOrganizationId();
  if (!credential || !organizationId) throw new Error("Kiosk is not configured");
  return execute<T>(query, { ...variables, credential, organizationId });
}

export async function authorizeKioskCredentialGraphQL(credential: string) {
  const organizationId = getKioskOrganizationId();
  if (!organizationId) throw new Error("Kiosk is not configured");
  return execute<{ authorizeKioskSession: boolean }>(`
    mutation AuthorizeKioskSession($credential: String!, $organizationId: ID!) {
      authorizeKioskSession(credential: $credential, organizationId: $organizationId)
    }
  `, { credential, organizationId });
}
