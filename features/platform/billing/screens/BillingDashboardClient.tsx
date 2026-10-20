'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CreditCard,
  History,
  Receipt,
  RefreshCcw,
  Repeat,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  BillingStats,
  BillingRecoveryMember,
  FailedPaymentRow,
  ManagedMembershipRow,
  MembershipTierOption,
  RefundablePaymentRow,
} from '../actions/billing';
import { changeMembershipTierOperatorAction, refundPaymentAction } from '../actions/billing';
import { markPaymentRecoveryContacted } from '../actions/cleanup';
import { formatMinorUnits } from '@/features/platform/lib/currency';
import type { RetryDraft } from '@/features/platform/lib/retry-draft';
import { DiscardRetainedRequest, RetainedRequestNotice } from '@/features/platform/components/RetainedRequest';
import {
  CheckField,
  DataTable,
  Disclosure,
  EmptyBlock,
  FieldInput,
  FormField,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PanelHeader,
  PersonCell,
  PlatformBody,
  SectionNav,
  SearchField,
  SplitLayout,
  KeyValueList,
  PanelBody,
  StatusPill,
  Td,
  Th,
  Tr,
  humanize,
  type Tone,
} from '@/features/platform/components/platform-ui';

export type QueuePage = { summary: string; previousHref: string | null; nextHref: string | null };
type QueueName = 'recovery' | 'failed' | 'plans' | 'refunds';

function QueuePager({ page }: { page?: QueuePage }) {
  if (!page) return null;
  return <PaginationBar className="border-t px-4 py-3 sm:px-5" summary={page.summary} previousHref={page.previousHref} nextHref={page.nextHref} />;
}

interface BillingDashboardClientProps {
  stats: BillingStats | null;
  recentPayments: any[];
  recentSubscriptions: any[];
  billingRecoveryMembers: BillingRecoveryMember[];
  managedMemberships: ManagedMembershipRow[];
  availableTiers: MembershipTierOption[];
  refundablePayments: RefundablePaymentRow[];
  failedPayments: FailedPaymentRow[];
  successMessage?: string;
  errorMessage?: string;
  loadError?: string;
  timeZone: string;
  search?: string;
  pages?: Partial<Record<QueueName, QueuePage>>;
  queueTotals?: Record<QueueName, number> | null;
  retry?: RetryDraft;
  pendingIntents?: Array<{ id: string; operation: string; createdAt: string }>;
  returnQuery?: string;
  tierSearch?: { query: string; skip: number; hasMore: boolean; pageSize: number };
}

function formatDate(dateString: string | null | undefined, timeZone: string): string {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString));
}

function statusTone(status: string): Tone {
  if (['active', 'completed', 'succeeded', 'paid'].includes(status)) return 'positive';
  if (['past_due', 'past-due', 'failed', 'unpaid'].includes(status)) return 'danger';
  if (['pending', 'incomplete', 'trialing', 'paused', 'frozen'].includes(status)) return 'warning';
  return 'neutral';
}

function BillingStatus({ status }: { status: string }) {
  return <StatusPill tone={statusTone(status)}>{humanize(status)}</StatusPill>;
}

export function BillingDashboardClient({
  stats,
  recentPayments,
  recentSubscriptions,
  billingRecoveryMembers,
  managedMemberships,
  availableTiers,
  refundablePayments,
  failedPayments,
  successMessage,
  errorMessage,
  loadError,
  timeZone,
  search = '',
  pages = {},
  queueTotals,
  retry,
  pendingIntents = [],
  returnQuery = '',
  tierSearch,
}: BillingDashboardClientProps) {
  // A failed load is not evidence of an empty queue: show the failure and nothing that claims otherwise.
  if (loadError) {
    return (
      <PlatformBody>
        {errorMessage ? <Notice tone="danger" title="That billing action did not complete">{errorMessage}</Notice> : null}
        <Notice tone="danger" title="Billing data is unavailable or access is blocked" action={<Button asChild size="sm" variant="outline"><Link href="/dashboard/platform/billing">Try again</Link></Button>}>
          {loadError} Recovery, failed payments, plan changes and refunds are unknown until it loads.
        </Notice>
      </PlatformBody>
    );
  }
  const total = (name: QueueName, shown: number) => queueTotals?.[name] ?? shown;

  return (
    <PlatformBody>
      {successMessage ? <Notice tone="positive">{successMessage}</Notice> : null}
      {errorMessage && !retry ? <Notice tone="danger" title="That billing action did not complete">{errorMessage}</Notice> : null}
      {retry?.intentId ? (
        // The retained request is shown and retried from its own record, whether or not its
        // membership or payment is still in the queue page being viewed.
        <div className="grid gap-2">
          <form action={retry.operation === 'refund' ? refundPaymentAction : changeMembershipTierOperatorAction} className="grid gap-2">
            <input type="hidden" name="intentId" value={retry.intentId} />
            <RetainedRequestNotice retry={retry} summary={
              <p className="mt-1 text-xs">
                {retry.operation === 'refund'
                  ? `Refund of payment ${retry.values.paymentId}: ${retry.values.amount ? retry.values.amount : 'the full remaining balance at the time it was requested'}${retry.values.reason ? ` · ${retry.values.reason}` : ''}`
                  : `Plan change for membership ${retry.values.membershipId} to plan ${retry.values.newTierId}`}
              </p>
            } />
            <div className="flex justify-end"><Button type="submit" size="sm">{retry.operation === 'refund' ? 'Retry refund' : 'Retry plan change'}</Button></div>
          </form>
          <DiscardRetainedRequest intentId={retry.intentId} returnTo="/dashboard/platform/billing" />
        </div>
      ) : null}
      {pendingIntents.length ? (
        <Notice tone="warning" title="Unconfirmed billing requests">
          These were sent but never confirmed.{' '}
          {pendingIntents.map((row, index) => <span key={row.id}>{index ? ' · ' : ''}<a className="underline" href={`/dashboard/platform/billing?intent=${encodeURIComponent(row.id)}`}>{humanize(row.operation)} from {formatDate(row.createdAt, timeZone)}</a></span>)}
        </Notice>
      ) : null}

      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <SearchField name="q" defaultValue={search} label="Search billing queues" placeholder="Member name or email" className="flex-1" />
        <Button type="submit" variant="outline">Search</Button>
        {search ? <Button asChild variant="ghost"><Link href="/dashboard/platform/billing">Clear</Link></Button> : null}
      </form>


      <SectionNav
        items={[
          { id: 'recovery', label: 'Recovery queue', count: total('recovery', billingRecoveryMembers.length), tone: billingRecoveryMembers.length ? 'danger' : 'neutral' },
          { id: 'failed', label: 'Failed payments', count: total('failed', failedPayments.length), tone: failedPayments.length ? 'warning' : 'neutral' },
          { id: 'plan-changes', label: 'Plan changes', count: total('plans', managedMemberships.length) },
          { id: 'refunds', label: 'Refunds', count: total('refunds', refundablePayments.length) },
          { id: 'activity', label: 'Recent activity' },
        ]}
      />

      <SplitLayout
        main={
          <>
            <Panel id="recovery" tone={billingRecoveryMembers.length > 0 ? 'danger' : undefined}>
              <PanelHeader
                icon={ShieldAlert}
                title="Billing recovery queue"
                count={total('recovery', billingRecoveryMembers.length)}
                description="Past-due memberships to contact before access or churn issues escalate. Logging contact does not charge or change the membership."
              />
              {billingRecoveryMembers.length === 0 ? (
                <EmptyBlock compact icon={CheckCircle2} title={search ? 'No past-due memberships match' : 'No past-due memberships'} description={search ? 'Clear the search to see the whole queue.' : 'No membership is marked past due.'} />
              ) : (
                <DataTable label="Past-due memberships" minWidth="40rem">
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Plan</Th>
                      <Th>Status</Th>
                      <Th align="right">Next billing</Th>
                      <Th align="right"><span className="sr-only">Action</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingRecoveryMembers.map((membership) => (
                      <Tr key={membership.id}>
                        <Td><PersonCell name={membership.member?.name} detail={membership.member?.email || 'No email on file'} /></Td>
                        <Td className="text-muted-foreground">{membership.tier?.name || 'No plan'}</Td>
                        <Td><BillingStatus status={membership.status} /></Td>
                        <Td align="right" className="text-muted-foreground">{formatDate(membership.nextBillingDate, timeZone)}</Td>
                        <Td align="right">
                          <form action={markPaymentRecoveryContacted}>
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <Button type="submit" variant="outline" size="sm">Mark contacted</Button>
                          </form>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
              <QueuePager page={pages.recovery} />
            </Panel>

            <Panel id="failed">
              <PanelHeader
                icon={RefreshCcw}
                title="Failed payments"
                count={total('failed', failedPayments.length)}
                description="Failed recurring charges and invoice problems reported by the provider, newest first."
              />
              {failedPayments.length === 0 ? (
                <EmptyBlock compact icon={CheckCircle2} title={search ? 'No failed payments match' : 'No failed payments recorded'} />
              ) : (
                <DataTable label="Failed payments" minWidth="36rem">
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Description</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">Date</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedPayments.map((payment) => (
                      <Tr key={payment.id}>
                        <Td><PersonCell name={payment.membership?.member?.name} detail={payment.membership?.member?.email || 'No email on file'} /></Td>
                        <Td className="max-w-[16rem] truncate text-muted-foreground">{payment.description || 'Membership payment failed'}</Td>
                        <Td align="right" className="font-medium text-rose-600 dark:text-rose-400">{formatMinorUnits(payment.amount, payment.currencyCode || stats?.currencyCode || 'USD')}</Td>
                        <Td align="right" className="whitespace-nowrap text-muted-foreground">{formatDate(payment.paymentDate, timeZone)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
              <QueuePager page={pages.failed} />
            </Panel>

            <Panel id="plan-changes">
              <PanelHeader
                icon={Repeat}
                title="Operator plan changes"
                count={total('plans', managedMemberships.length)}
                description="Change a provider-backed plan with explicit review. Stripe adds the prorated price difference to the member's next invoice, and this month's class credits reset to the new plan allowance right away."
              />
              <form method="get" className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs sm:px-5">
                {search ? <input type="hidden" name="q" value={search} /> : null}
                <span className="text-muted-foreground">{tierSearch?.query ? `Plan choices match “${tierSearch.query}”.` : 'Plan choices are listed by name.'}</span>
                <FieldInput name="tierQuery" defaultValue={tierSearch?.query} placeholder="Find a plan by name" aria-label="Find a plan" className="h-8 w-56" />
                <Button type="submit" size="sm" variant="outline">Find plan</Button>
                {tierSearch && tierSearch.skip > 0 ? <a className="underline" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(tierSearch.query ? { tierQuery: tierSearch.query } : {}), tierSkip: String(Math.max(0, tierSearch.skip - tierSearch.pageSize)) })}#plan-changes`}>Previous plans</a> : null}
                {tierSearch?.hasMore ? <a className="underline" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(tierSearch.query ? { tierQuery: tierSearch.query } : {}), tierSkip: String(tierSearch.skip + tierSearch.pageSize) })}#plan-changes`}>More plans</a> : null}
              </form>
              {managedMemberships.length === 0 ? (
                <EmptyBlock compact icon={CreditCard} title={search ? 'No memberships match' : 'No active memberships are available'} description={search ? 'Clear the search to see every membership.' : 'Provider-backed memberships appear here once members subscribe.'} />
              ) : (
                <ul className="divide-y">
                  {managedMemberships.map((membership) => {
                    const hasProvider = Boolean(membership.stripeSubscriptionId);
                    return (
                      <li key={membership.id} className="px-4 py-3.5 sm:px-5">
                        {membership.retained ? <p className="text-xs text-muted-foreground">A plan change for this membership is waiting above; retry or discard it there.</p> : <form action={changeMembershipTierOperatorAction} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:items-start">
                          <input type="hidden" name="returnQuery" value={returnQuery} />
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <input type="hidden" name="operation" value="tierChange" />
                          <input type="hidden" name="retryScope" value={membership.id} />
                          <input type="hidden" name="idempotencyKey" value={membership.idempotencyKey || ''} />
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <PersonCell
                              name={membership.member?.name || 'Unknown member'}
                              detail={<>Current plan: <span className="text-foreground">{membership.tier?.name || 'No plan'}</span></>}
                              avatar
                            />
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <BillingStatus status={membership.status} />
                              {!hasProvider ? <span className="text-[11px] text-muted-foreground">No provider subscription</span> : null}
                            </div>
                          </div>
                          {hasProvider ? (
                            <div className="grid gap-2 lg:col-start-2 lg:row-start-1">
                              <label>
                                <span className="sr-only">New plan for {membership.member?.name || 'member'}</span>
                                <NativeSelect name="newTierId" required defaultValue={membership.retainedTierId || ''}>
                                  <option value="" disabled>Choose a different plan…</option>
                                  {availableTiers.filter((tier) => tier.id !== membership.tier?.id).map((tier) => (
                                    <option key={tier.id} value={tier.id}>{tier.name}</option>
                                  ))}
                                </NativeSelect>
                              </label>
                            </div>
                          ) : null}
                          {hasProvider ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:col-span-2">
                              <CheckField name="confirmTierChange" value="yes" required confirm className="flex-1">
                                I reviewed proration and understand the member&apos;s class-credit balance resets to the selected plan allowance.
                              </CheckField>
                              <Button type="submit" variant="outline" size="sm" disabled={!membership.idempotencyKey}>
                                Change plan
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground lg:col-start-2 lg:row-start-1 lg:text-right">
                              Plan changes require a provider subscription.
                            </p>
                          )}
                        </form>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <QueuePager page={pages.plans} />
            </Panel>

            <Panel id="refunds">
              <PanelHeader
                icon={Undo2}
                title="Issue a refund"
                count={total('refunds', refundablePayments.length)}
                description="Refund a succeeded provider payment. Leave the amount blank to refund the full remaining balance; partial amounts use the payment currency."
              />
              {refundablePayments.length === 0 ? (
                <EmptyBlock compact icon={Receipt} title={search ? 'No payments match' : 'No refundable provider payments'} description={search ? 'Clear the search to see every succeeded payment.' : 'Succeeded payments with a remaining balance appear here.'} />
              ) : (
                <ul className="divide-y">
                  {refundablePayments.map((payment) => {
                    const remaining = payment.amount - (payment.refundAmount ?? 0);
                    return (
                      <li key={payment.id} className="space-y-3 px-4 py-3.5 sm:px-5">
                        <div className="flex items-start justify-between gap-3">
                          <PersonCell
                            name={payment.member?.name || 'Unknown member'}
                            detail={<span className="font-mono text-[11px]">{payment.receiptNumber || payment.description || payment.id}</span>}
                          />
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{formatMinorUnits(remaining, payment.currencyCode)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              refundable{payment.refundAmount ? ` · ${formatMinorUnits(payment.refundAmount, payment.currencyCode)} already refunded` : ''}
                            </p>
                          </div>
                        </div>
                        {payment.retained ? <p className="text-xs text-muted-foreground">A refund of this payment is waiting above; retry or discard it there.</p> : <Disclosure summary="Refund this payment…" tone="danger">
                          <form action={refundPaymentAction} className="grid gap-3">
                            <input type="hidden" name="returnQuery" value={returnQuery} />
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <input type="hidden" name="operation" value="refund" />
                            <input type="hidden" name="retryScope" value={payment.id} />
                            <input type="hidden" name="idempotencyKey" value={payment.idempotencyKey || ''} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <FormField label={`Partial amount (${payment.currencyCode})`} optional hint="Blank refunds the full remaining balance.">
                                <FieldInput name="amount" inputMode="decimal" placeholder={formatMinorUnits(remaining, payment.currencyCode)} defaultValue={payment.retainedAmount} />
                              </FormField>
                              <FormField label="Reason" optional>
                                <FieldInput name="reason" maxLength={500} placeholder="Member request" />
                              </FormField>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <CheckField name="confirmRefund" value="yes" required confirm className="flex-1">
                                I confirm this refunds the member’s card through the payment provider.
                              </CheckField>
                              <Button type="submit" variant="destructive" size="sm">Refund payment</Button>
                            </div>
                          </form>
                        </Disclosure>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <QueuePager page={pages.refunds} />
            </Panel>
          </>
        }
        aside={
          <>
            {stats ? (
              <Panel>
                <PanelHeader icon={CreditCard} title="This month" description="Provider payments net of refunds; reconcile with provider statements." />
                <PanelBody>
                  <KeyValueList
                    items={[
                      { label: 'Net payments this month', value: <span className="tabular-nums">{formatMinorUnits(stats.monthlyRevenue, stats.currencyCode)}</span> },
                      { label: 'Active subscriptions', value: <span className="tabular-nums">{stats.activeSubscriptions}</span> },
                      { label: 'Active memberships', value: <span className="tabular-nums">{stats.activeMemberships}</span> },
                      { label: 'Past due', value: <span className="tabular-nums">{stats.pastDueCount}</span> },
                    ]}
                  />
                </PanelBody>
              </Panel>
            ) : null}
            <Panel id="activity">
              <PanelHeader icon={History} title="Recent subscriptions" description="Latest signups and status changes." />
              {recentSubscriptions.length === 0 ? (
                <EmptyBlock compact title="No subscription activity is visible" />
              ) : (
                <ul className="divide-y">
                  {recentSubscriptions.map((sub: any) => (
                    <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{sub.member?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">Started {formatDate(sub.startDate, timeZone)}</p>
                      </div>
                      <BillingStatus status={sub.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader icon={Receipt} title="Recent payments" description="Last transactions processed, net of refunds." />
              {recentPayments.length === 0 ? (
                <EmptyBlock compact title="No payment activity is visible" />
              ) : (
                <ul className="divide-y">
                  {recentPayments.map((payment: any) => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{payment.member?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(payment.paymentDate, timeZone)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums">
                          {formatMinorUnits(payment.amount - (payment.refundAmount || 0), payment.currencyCode || stats?.currencyCode || 'USD')}
                        </p>
                        {payment.refundAmount ? <p className="text-[11px] text-muted-foreground">net after refund</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

          </>
        }
      />
    </PlatformBody>
  );
}
