import { randomUUID } from "node:crypto";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "./cookies";

export type ParticipationStatus = { policyId: string; version: string; accepted: boolean; termsHref: string };

/** The signed-in member's standing against the current enforced participation policy; null when nothing applies. */
export async function getParticipationStatus(): Promise<ParticipationStatus | null> {
  const headers = await getAuthHeaders();
  if (!Object.keys(headers).length) return null;
  try {
    const { participationWorkspace } = await gymClient.request<{ participationWorkspace: any }>(gql`query StorefrontParticipation { participationWorkspace }`, {}, headers);
    const policy = participationWorkspace?.policy;
    if (!policy?.enforceWaiver) return null;
    // The server decides from the complete evidence set, not from the history page.
    const accepted = participationWorkspace.acceptedCurrent === true;
    return { policyId: policy.id, version: policy.version, accepted, termsHref: policy.documentText ? "/waiver" : "/account/participation" };
  } catch {
    return null;
  }
}

/** Records the member's own acceptance of `policyId` through the existing waiver.accept command. */
export async function recordParticipationAcceptance(policyId: string, headers: Record<string, string>) {
  await gymClient.request(gql`
    mutation StorefrontAcceptParticipation($data: JSON!) {
      runOperationsCommand(command: "waiver.accept", data: $data)
    }
  `, { data: { policyId, accepted: true, healthConsent: false, requestKey: randomUUID() } }, headers);
}
