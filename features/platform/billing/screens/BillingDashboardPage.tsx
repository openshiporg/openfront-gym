/**
 * BillingDashboardPage - Server Component
 * Follows the Openfront Platform screen pattern
 */

import { getBillingStats, getRecentBillingActivity } from '../actions/billing';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { BillingDashboardClient } from './BillingDashboardClient';

export async function BillingDashboardPage() {
  // Fetch specialized billing data
  const [statsRes, activityRes] = await Promise.all([
    getBillingStats(),
    getRecentBillingActivity()
  ]);

  const stats = statsRes.success ? statsRes.data : null;
  const activity = activityRes.success ? activityRes.data : { recentPayments: [], recentSubscriptions: [] };

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Billing Dashboard</h1>
      <p className="text-muted-foreground">Manage subscriptions and payments</p>
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
      />
    </PageContainer>
  );
}

export default BillingDashboardPage;
