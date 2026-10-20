'use server';
import { gymGraphql as keystoneClient } from '@/features/platform/lib/gym-graphql';
import { revalidatePath } from 'next/cache';
import { staffActionError } from '@/features/platform/lib/action-error';

export type OperationsView = { noticeSkip?: number; eventSkip?: number; resourceSkip?: number; credentialScope?: string; credentialSkip?: number; memberQuery?: string };

export async function loadOperations(member = false, caseAfterId?: string, evidenceAfterId?: string, view: OperationsView = {}) {
  const field = member ? 'participationWorkspace' : 'operationsWorkspace';
  const result = await keystoneClient<Record<string, any>>(
    member
      ? 'query($after: ID) { participationWorkspace(evidenceAfterId: $after) }'
      : 'query($after: ID, $noticeSkip: Int, $eventSkip: Int, $resourceSkip: Int, $credentialScope: String, $credentialSkip: Int, $memberQuery: String) { operationsWorkspace(caseAfterId: $after, noticeSkip: $noticeSkip, eventSkip: $eventSkip, resourceSkip: $resourceSkip, credentialScope: $credentialScope, credentialSkip: $credentialSkip, memberQuery: $memberQuery) }',
    member ? { after: evidenceAfterId || null } : { after: caseAfterId || null, ...view },
  );
  if (!result.success) throw new Error(result.error);
  return result.data[field];
}
export async function submitOperations(command: string, data: Record<string, unknown>) {
  const result = await keystoneClient<{ runOperationsCommand: any }>('mutation($command: String!, $data: JSON!) { runOperationsCommand(command: $command, data: $data) }', { command, data });
  if (!result.success) return { success: false, error: staffActionError(result, 'Could not save. Check the form and try again.') };
  revalidatePath('/dashboard/platform/operations');
  revalidatePath('/account/participation');
  return { success: true, data: result.data.runOperationsCommand };
}
export async function downloadOperatingData(kind: string, from: string, to: string) {
  const result = await keystoneClient<{ exportOperatingData: any }>('query($kind: String!, $from: String!, $to: String!) { exportOperatingData(kind: $kind, from: $from, to: $to) }', { kind, from, to });
  if (!result.success) return { success: false as const, error: staffActionError(result, 'Export failed. Check the date range and try again.') };
  return { success: true as const, data: result.data.exportOperatingData };
}
export async function retryPaymentEvent(eventId: string) {
  const result = await keystoneClient<{ replayPaymentEvent: any }>('mutation($eventId: ID!) { replayPaymentEvent(eventId: $eventId) }', { eventId });
  if (!result.success) return { success: false, error: staffActionError(result, 'Replay failed; inspect the event before retrying.') };
  revalidatePath('/dashboard/platform/operations');
  return { success: true };
}
export async function refreshEntitlements(afterId?: string) {
  const result = await keystoneClient<{ reconcileGymEntitlements: any }>('mutation($afterId: ID) { reconcileGymEntitlements(afterId: $afterId, limit: 50) }', { afterId });
  if (!result.success) return { success: false as const, error: staffActionError(result, 'Review failed. Try again.') };
  revalidatePath('/dashboard/platform/operations');
  return { success: true as const, data: result.data.reconcileGymEntitlements };
}
export async function refreshMyMembership() {
  const result = await keystoneClient<{ refreshMyEntitlement: any }>('mutation { refreshMyEntitlement }');
  if (!result.success) return { error: result.error, membership: null };
  return result.data.refreshMyEntitlement;
}
export async function updateFacilityResource(id: string, data: Record<string, unknown>) {
  const result = await keystoneClient<{ updateGymResourceAllocation: any }>('mutation($id: ID!, $data: JSON!) { updateGymResourceAllocation(id: $id, data: $data) }', { id, data });
  if (!result.success) return { success: false as const, error: staffActionError(result, 'Resource was not updated. Check the values and try again.') };
  revalidatePath('/dashboard/platform/operations');
  return { success: true as const, data: result.data.updateGymResourceAllocation };
}
