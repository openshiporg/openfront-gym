/**
 * BillingDashboardPage - Server Component
 * Follows the Openfront Platform screen pattern
 */

import crypto from 'node:crypto';
import { getBillingWorkspaceData } from '../actions/billing';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformHeader } from '@/features/platform/components/platform-ui';
import { BillingDashboardClient, type QueuePage } from './BillingDashboardClient';
import { firstParam, pageParam, type SearchParamValue } from '@/features/platform/lib/search-params';
import { retryIntentFor, retryKeyFor, retryValue } from '@/features/platform/lib/retry-draft';
import { loadPendingIntents, loadRetryIntent } from '@/features/platform/lib/staff-intent';

const QUEUE_PARAMS = { recovery: 'recoverySkip', failed: 'failedSkip', plans: 'planSkip', refunds: 'refundSkip' } as const;

export async function BillingDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const q = firstParam(resolved.q, 100);
  const skips = {
    recovery: pageParam(resolved.recoverySkip, 1_000_000),
    failed: pageParam(resolved.failedSkip, 1_000_000),
    plans: pageParam(resolved.planSkip, 1_000_000),
    refunds: pageParam(resolved.refundSkip, 1_000_000),
  };
  const tierQuery = firstParam(resolved.tierQuery, 100);
  const tierSkip = pageParam(resolved.tierSkip, 1_000_000);
  // A failed or unconfirmed plan change or refund is retained server-side; its form is locked to it.
  const [retry, pendingIntents] = await Promise.all([loadRetryIntent(firstParam(resolved.intent, 100), 'billing'), loadPendingIntents('billing')]);
  const workspace = await getBillingWorkspaceData({
    q: q || undefined, recoverySkip: skips.recovery, failedSkip: skips.failed, planSkip: skips.plans, refundSkip: skips.refunds,
    tierQuery: tierQuery || undefined, tierSkip, pinnedTierId: retry?.operation === 'tierChange' ? retry.values.newTierId : undefined,
  });
  const error = firstParam(resolved.error, 300);
  // The view a form returns to after its result: the same search, pages and plan search.
  const returnQuery = new URLSearchParams(Object.entries({ q, tierQuery, ...Object.fromEntries(Object.entries(QUEUE_PARAMS).map(([name, param]) => [param, skips[name as keyof typeof skips] ? String(skips[name as keyof typeof skips]) : ''])), tierSkip: tierSkip ? String(tierSkip) : '' }).filter(([, value]) => value)).toString();
  const queues = workspace.success ? workspace.data?.queues : null;
  const queuePage = (name: keyof typeof QUEUE_PARAMS, shown: number): QueuePage | undefined => {
    const queue = queues?.[name];
    if (!queue || (queue.skip === 0 && queue.total <= shown)) return undefined;
    const href = (skip: number) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      for (const [other, param] of Object.entries(QUEUE_PARAMS)) {
        const value = other === name ? skip : skips[other as keyof typeof skips];
        if (value) params.set(param, String(value));
      }
      const text = params.toString();
      return `/dashboard/platform/billing${text ? `?${text}` : ''}#${name === 'plans' ? 'plan-changes' : name}`;
    };
    return {
      summary: queue.total ? `${queue.skip + 1}–${queue.skip + shown} of ${queue.total}` : '0 of 0',
      previousHref: queue.skip > 0 ? href(Math.max(0, queue.skip - queues.pageSize)) : null,
      nextHref: queue.total > queue.skip + shown ? href(queue.skip + queues.pageSize) : null,
    };
  };
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
    <PlatformHeader
      title="Billing"
      description="Work the recovery queue first, then review plan changes and refunds before sending them to the payment provider. Recorded payments are never edited."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/platform/reports">
            Revenue reports <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      }
    />
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
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
          idempotencyKey: retryKeyFor(retry, 'tierChange', membership.id, crypto.randomUUID),
          retainedTierId: retryValue(retry, 'tierChange', 'newTierId', membership.id),
          retained: Boolean(retryIntentFor(retry, 'tierChange', membership.id)),
        }))}
        retry={retry}
        pendingIntents={pendingIntents.filter((row) => row.id !== retry?.intentId)}
        returnQuery={returnQuery}
        tierSearch={workspace.success ? workspace.data?.tierSearch : undefined}
        availableTiers={activity.availableTiers || []}
        refundablePayments={(activity.refundablePayments || []).map((payment) => ({
          ...payment,
          idempotencyKey: retryKeyFor(retry, 'refund', payment.id, crypto.randomUUID),
          retainedAmount: retryValue(retry, 'refund', 'amount', payment.id),
          retained: Boolean(retryIntentFor(retry, 'refund', payment.id)),
        }))}
        search={q}
        pages={{
          recovery: queuePage('recovery', (activity.billingRecoveryMembers || []).length),
          failed: queuePage('failed', (activity.failedPayments || []).length),
          plans: queuePage('plans', (activity.managedMemberships || []).length),
          refunds: queuePage('refunds', (activity.refundablePayments || []).length),
        }}
        queueTotals={queues ? { recovery: queues.recovery.total, failed: queues.failed.total, plans: queues.plans.total, refunds: queues.refunds.total } : null}
        failedPayments={activity.failedPayments || []}
        timeZone={activity.timeZone}
        successMessage={
          firstParam(resolved.success) === 'refund-completed'
            ? 'Refund completed.'
            : firstParam(resolved.success) === 'tier-updated'
              ? 'Membership plan changed. Stripe prorates the difference and this month’s class credits match the new plan.'
              : firstParam(resolved.success, 200) || undefined
        }
        errorMessage={error || undefined}
        loadError={workspace.success ? undefined : workspace.error}
      />
    </PageContainer>
  );
}

export default BillingDashboardPage;
