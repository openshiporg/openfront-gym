'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function markPaymentRecoveryContacted(formData: FormData): Promise<void> {
  const membershipId = formData.get('membershipId')?.toString();
  if (!membershipId) throw new Error('Missing membership id.');

  const response = await keystoneClient(`
    mutation MarkPaymentRecoveryContacted($membershipId: ID!) {
      markPaymentRecoveryContacted(membershipId: $membershipId) { id }
    }
  `, { membershipId });
  if (!response.success) throw new Error(response.error);

  revalidatePath('/dashboard/platform/billing');
  revalidatePath('/dashboard/platform/reports');
}
