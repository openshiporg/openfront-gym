import { cookies, headers } from "next/headers";
import { internalGraphqlEndpoint, internalGraphqlFetch } from "@/features/keystone/lib/internal-origin";
import type { KeystoneResponse } from "@/features/dashboard/lib/keystoneClient";
import { CLIENT_SOURCE_HEADER, clientSourceFromHeaders, signedClientSource } from "@/lib/clientSource";

/**
 * Gym's credential-bearing GraphQL transport for its own server actions and loaders. The
 * session travels only to the deployment-owned internal origin (never one chosen by a
 * request's Host or forwarded headers), redirects are refused, and neither request variables
 * nor raw transport errors are logged or returned. Same result shape as the shared client.
 */
export async function gymGraphql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<KeystoneResponse<T>> {
  try {
    const token = (await cookies()).get("keystonejs-session")?.value;
    const source = signedClientSource(clientSourceFromHeaders(await headers()));
    const response = await internalGraphqlFetch(internalGraphqlEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(source ? { [CLIENT_SOURCE_HEADER]: source } : {}),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { data?: T; errors?: Array<{ message?: string }> } | null;
    if (body?.errors?.length) {
      return { success: false, error: body.errors.map((entry) => entry?.message || "Request failed").join("\n"), errors: body.errors };
    }
    if (!response.ok || !body?.data) return { success: false, error: `Request failed (${response.status})` };
    return { success: true, data: body.data };
  } catch (error) {
    console.error("Gym GraphQL request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return { success: false, error: "The request could not be completed" };
  }
}
