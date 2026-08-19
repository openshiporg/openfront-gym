/**
 * BillingDashboardPage - Server Component
 * Follows the Openfront Platform screen pattern
 */

import crypto from 'node:crypto';
import { getBillingWorkspaceData } from '../actions/billing';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { BillingDashboardClient } from './BillingDashboardClient';

export async function BillingDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const workspace = await getBillingWorkspaceData();
  const stats = workspace.success ? (workspace.data?.stats ?? null) : null;
  const activity: {
    recentPayments: any[];
    recentSubscriptions: any[];
    managedMemberships: any[];
    availableTiers: any[];
    billingRecoveryMembers: any[];
    refundablePayments: any[];
    failedPayments: any[];
    timeZone: string;
  } = workspace.success && workspace.data
    ? workspace.data
    : { recentPayments: [], recentSubscriptions: [], managedMemberships: [], availableTiers: [], billingRecoveryMembers: [], refundablePayments: [], failedPayments: [], timeZone: 'UTC' };

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Billing operations</h1>
      <p className="text-muted-foreground">Review provider-backed memberships, recovery work, payment evidence, and refunds.</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Billing' }
  ];

  return (
    <PageContainer title="Billing" header={header} breadcrumbs={breadcrumbs}>
      <BillingDashboardClient 
        stats={stats} 
        recentPayments={activity.recentPayments || []} 
        recentSubscriptions={activity.recentSubscriptions || []}
        billingRecoveryMembers={activity.billingRecoveryMembers || []}
        managedMemberships={(activity.managedMemberships || []).map((membership) => ({
          ...membership,
          idempotencyKey: crypto.randomUUID(),
        }))}
        availableTiers={activity.availableTiers || []}
        refundablePayments={(activity.refundablePayments || []).map((payment) => ({
          ...payment,
          idempotencyKey: crypto.randomUUID(),
        }))}
        failedPayments={activity.failedPayments || []}
        timeZone={activity.timeZone}
        successMessage={
          resolved?.success === 'refund-completed'
            ? 'Refund completed and payment evidence updated.'
            : resolved?.success === 'tier-updated'
              ? 'Membership plan updated with provider proration and refreshed class credits.'
              : undefined
        }
        errorMessage={resolved?.error}
        loadError={workspace.success ? undefined : workspace.error}
      />
    </PageContainer>
  );
}

export default BillingDashboardPage;
