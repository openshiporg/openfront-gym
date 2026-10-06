'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { revalidatePath } from 'next/cache';

export async function loadOperations(member = false, caseAfterId?: string) {
  const field = member ? 'participationWorkspace' : 'operationsWorkspace';
  const result = await keystoneClient<Record<string, any>>(member ? `query { ${field} }` : 'query($after: ID) { operationsWorkspace(caseAfterId: $after) }', member ? {} : { after: caseAfterId });
  if (!result.success) throw new Error(result.error);
  return result.data[field];
}
export async function submitOperations(command: string, data: Record<string, unknown>) {
  const result = await keystoneClient<{ runOperationsCommand: any }>('mutation($command: String!, $data: JSON!) { runOperationsCommand(command: $command, data: $data) }', { command, data });
  if (!result.success) return { success: false, error: result.error };
  revalidatePath('/dashboard/platform/operations');
  revalidatePath('/account/participation');
  return { success: true, data: result.data.runOperationsCommand };
}
export async function downloadOperatingData(kind: string, from: string, to: string) {
  const result = await keystoneClient<{ exportOperatingData: any }>('query($kind: String!, $from: String!, $to: String!) { exportOperatingData(kind: $kind, from: $from, to: $to) }', { kind, from, to });
  if (!result.success) throw new Error(result.error);
  return result.data.exportOperatingData;
}
export async function retryPaymentEvent(eventId: string) {
  const result = await keystoneClient<{ replayPaymentEvent: any }>('mutation($eventId: ID!) { replayPaymentEvent(eventId: $eventId) }', { eventId });
  if (!result.success) return { success: false, error: result.error };
  revalidatePath('/dashboard/platform/operations');
  return { success: true };
}
export async function refreshEntitlements(afterId?: string) {
  const result = await keystoneClient<{ reconcileGymEntitlements: any }>('mutation($afterId: ID) { reconcileGymEntitlements(afterId: $afterId, limit: 50) }', { afterId });
  if (!result.success) throw new Error(result.error);
  revalidatePath('/dashboard/platform/operations');
  return result.data.reconcileGymEntitlements;
}
export async function refreshMyMembership() {
  const result = await keystoneClient<{ refreshMyEntitlement: any }>('mutation { refreshMyEntitlement }');
  if (!result.success) return { error: result.error, membership: null };
  return result.data.refreshMyEntitlement;
}
export async function updateFacilityResource(id: string, data: Record<string, unknown>) {
  const result = await keystoneClient<{ updateGymResourceAllocation: any }>('mutation($id: ID!, $data: JSON!) { updateGymResourceAllocation(id: $id, data: $data) }', { id, data });
  if (!result.success) throw new Error(result.error);
  revalidatePath('/dashboard/platform/operations');
  return result.data.updateGymResourceAllocation;
}
