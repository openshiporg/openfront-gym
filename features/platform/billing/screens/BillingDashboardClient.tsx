'use client';

import React from 'react';
import Link from 'next/link';
import {
  CreditCard,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  Users,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
}

function formatDate(dateString: string | null | undefined, timeZone: string): string {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString));
}

function getStatusBadge(status: string) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    active: { variant: 'default', icon: CheckCircle },
    completed: { variant: 'default', icon: CheckCircle },
    cancelled: { variant: 'secondary', icon: XCircle },
    past_due: { variant: 'destructive', icon: AlertTriangle },
    'past-due': { variant: 'destructive', icon: AlertTriangle },
    failed: { variant: 'destructive', icon: AlertTriangle },
    pending: { variant: 'outline', icon: Clock },
  };

  const { variant, icon: Icon } = variants[status] || { variant: 'outline', icon: Clock };
  return (
    <Badge variant={variant} className="gap-1 capitalize">
      <Icon className="h-3 w-3" />
      {status.replace(/[-_]/g, ' ')}
    </Badge>
  );
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
}: BillingDashboardClientProps) {
  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-clip p-4 md:p-6">
      {loadError ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Billing data is unavailable or access is blocked. {loadError}</div>
      ) : null}
      {successMessage ? (
        <div className="rounded-md border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{successMessage}</div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? formatMinorUnits(stats.monthlyRevenue, stats.currencyCode) : '...'}</div>
            <p className="text-xs text-muted-foreground">Current month revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeSubscriptions ?? '...'}</div>
            <p className="text-xs text-muted-foreground">Total active recurring</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Memberships</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeMemberships ?? '...'}</div>
            <p className="text-xs text-muted-foreground">Total active members</p>
          </CardContent>
        </Card>
        <Card className={stats?.pastDueCount && stats.pastDueCount > 0 ? 'border-destructive' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Past Due</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats?.pastDueCount && stats.pastDueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats?.pastDueCount && stats.pastDueCount > 0 ? 'text-destructive' : ''}`}>
              {stats?.pastDueCount ?? '...'}
            </div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className={billingRecoveryMembers.length > 0 ? 'border-destructive/40' : ''}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`h-4 w-4 ${billingRecoveryMembers.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <CardTitle>Billing Recovery Queue</CardTitle>
                </div>
                <CardDescription>Past-due memberships that staff should review before access or churn issues escalate.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/platform/reports">
                  Open Reports
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {billingRecoveryMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                  No past-due memberships right now.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Next Billing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingRecoveryMembers.map((membership) => (
                        <TableRow key={membership.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{membership.member?.name || 'Unknown'}</div>
                              <div className="text-xs text-muted-foreground">{membership.member?.email || 'No email'}</div>
                            </div>
                          </TableCell>
                          <TableCell>{membership.tier?.name || 'No tier'}</TableCell>
                          <TableCell>{getStatusBadge(membership.status)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatDate(membership.nextBillingDate, timeZone)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 space-y-3">
                    {billingRecoveryMembers.map((membership) => (
                      <form key={`${membership.id}-contact`} action={markPaymentRecoveryContacted} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                        <div>
                          <div className="font-medium">{membership.member?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">Log that the team contacted this member about payment recovery.</div>
                        </div>
                        <input type="hidden" name="membershipId" value={membership.id} />
                        <Button type="submit" variant="outline" size="sm">Mark contacted</Button>
                      </form>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operator plan changes</CardTitle>
              <CardDescription>
                Change a provider-backed member plan with explicit review. Stripe prorates immediately and Gym resets class credits to the new plan allowance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {managedMemberships.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">No active memberships are available.</div>
              ) : managedMemberships.map((membership) => (
                <form key={membership.id} action={changeMembershipTierOperatorAction} className="space-y-3 rounded-lg border p-4">
                  <input type="hidden" name="membershipId" value={membership.id} />
                  <input type="hidden" name="idempotencyKey" value={membership.idempotencyKey || ''} />
                  <div>
                    <p className="font-medium">{membership.member?.name || 'Unknown member'}</p>
                    <p className="text-xs text-muted-foreground">Current plan: {membership.tier?.name || 'No plan'} · {membership.status}</p>
                  </div>
                  <select name="newTierId" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="" disabled>Select a different plan</option>
                    {availableTiers.filter((tier) => tier.id !== membership.tier?.id).map((tier) => (
                      <option key={tier.id} value={tier.id}>{tier.name}</option>
                    ))}
                  </select>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="confirmTierChange" value="yes" required className="mt-0.5" />
                    <span>I reviewed proration and understand the member&apos;s class-credit balance will reset to the selected plan allowance.</span>
                  </label>
                  <Button type="submit" variant="outline" size="sm" disabled={!membership.stripeSubscriptionId || !membership.idempotencyKey}>
                    {membership.stripeSubscriptionId ? 'Change plan' : 'Provider subscription required'}
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue a refund</CardTitle>
              <CardDescription>
                Refund a succeeded provider payment. Leave amount blank for the full remaining balance; partial amounts use the payment currency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {refundablePayments.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                  No refundable provider payments are available.
                </div>
              ) : refundablePayments.map((payment) => {
                const remaining = payment.amount - (payment.refundAmount ?? 0);
                return (
                  <form key={payment.id} action={refundPaymentAction} className="space-y-3 rounded-lg border p-4">
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="idempotencyKey" value={payment.idempotencyKey || ''} />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{payment.member?.name || 'Unknown member'}</p>
                        <p className="text-xs text-muted-foreground">{payment.receiptNumber || payment.description || payment.id}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold">{formatMinorUnits(remaining, payment.currencyCode)}</p>
                        <p className="text-xs text-muted-foreground">remaining</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium">
                        Partial amount (optional)
                        <input name="amount" inputMode="decimal" placeholder="Full remaining balance" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" />
                      </label>
                      <label className="text-sm font-medium">
                        Reason
                        <input name="reason" maxLength={500} placeholder="Member request" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" />
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="confirmRefund" value="yes" required className="mt-0.5" />
                      <span>I confirm this sends a real provider refund and updates immutable payment evidence.</span>
                    </label>
                    <Button type="submit" variant="destructive" size="sm">Refund payment</Button>
                  </form>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Recent Failed Payments</CardTitle>
                </div>
                <CardDescription>Latest failed recurring charges and invoice problems.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {failedPayments.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                  No failed payments logged recently.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payment.membership?.member?.name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground">{payment.membership?.member?.email || 'No email'}</div>
                          </div>
                        </TableCell>
                        <TableCell>{formatMinorUnits(payment.amount, payment.currencyCode || stats?.currencyCode || 'USD')}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.description || 'Membership payment failed'}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatDate(payment.paymentDate, timeZone)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Subscriptions</CardTitle>
              <CardDescription>Latest subscription signups and changes</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Start Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSubscriptions.length === 0 ? <TableRow><TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">No subscription activity is visible.</TableCell></TableRow> : recentSubscriptions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.member?.name || 'Unknown'}</TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(sub.startDate, timeZone)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
              <CardDescription>Last transactions processed</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.length === 0 ? <TableRow><TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">No payment activity is visible.</TableCell></TableRow> : recentPayments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.member?.name || 'Unknown'}</TableCell>
                      <TableCell>
                        {formatMinorUnits(payment.amount - (payment.refundAmount || 0), payment.currencyCode || stats?.currencyCode || 'USD')}
                        {payment.refundAmount ? <span className="ml-2 text-xs text-muted-foreground">net after refund</span> : null}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(payment.paymentDate, timeZone)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
