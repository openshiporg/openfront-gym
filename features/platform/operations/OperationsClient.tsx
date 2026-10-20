'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building,
  CheckCircle2,
  Copy,
  Download,
  FileSignature,
  KeyRound,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  Webhook,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CheckField,
  CountBadge,
  Disclosure,
  EmptyBlock,
  FieldInput,
  FormField,
  NativeSelect,
  Notice,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PlatformBody,
  SectionNav,
  StatusPill,
  humanize,
  type Tone,
} from '@/features/platform/components/platform-ui';
import { submitOperations, downloadOperatingData, retryPaymentEvent, refreshEntitlements, loadOperations, updateFacilityResource } from './actions';

type Feedback = { tone: Tone; text: string } | null;

const CASE_KINDS: Array<{ value: string; label: string }> = [
  { value: 'incident', label: 'Incident' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'closure', label: 'Facility closure' },
  { value: 'finance', label: 'Financial reconciliation' },
  { value: 'integration', label: 'Integration exception' },
  { value: 'privacy', label: 'Privacy review' },
];

function caseStatusTone(status?: string): Tone {
  if (status === 'resolved') return 'positive';
  if (status === 'review') return 'info';
  if (status === 'open') return 'warning';
  return 'neutral';
}

function eventStatusTone(status?: string): Tone {
  if (status === 'processed' || status === 'succeeded') return 'positive';
  if (status === 'failed' || status === 'error') return 'danger';
  return 'warning';
}

function stamp(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function FormRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-3 ${className ?? ''}`}>{children}</div>;
}

export function OperationsClient({ data }: { data: any }) {
  const [message, setMessage] = useState<Feedback>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [afterId, setAfterId] = useState<string | undefined>();
  const [casePage, setCasePage] = useState<any>(null);
  // The one form whose last submission failed, with why; its fields keep what was typed.
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);
  const router = useRouter();
  async function run(command: string, values: Record<string, unknown>): Promise<string | null> {
    setBusy(true); setMessage(null); setToken(null); setCopied(false);
    try {
      const result = await submitOperations(command, values);
      if (result.success) {
        if (result.data?.token) {
          setToken(result.data.token);
          setMessage({ tone: 'warning', text: 'Copy this credential now; it will not be shown again.' });
        } else {
          setMessage({ tone: 'positive', text: 'Saved.' });
        }
        setCasePage(null); router.refresh();
        return null;
      }
      const text = result.error || 'Could not save';
      setMessage({ tone: 'danger', text });
      return text;
    } catch {
      const text = 'The request did not finish. Check the queue before retrying; your entry is kept.';
      setMessage({ tone: 'danger', text });
      return text;
    }
    finally { setBusy(false); }
  }
  /**
   * Submits a form without React's automatic reset: fields are cleared only after the server
   * confirms the operation, so a failed note or reason is never lost, and the error is shown on
   * the form it belongs to.
   */
  function form(command: string, fixed: Record<string, unknown> = {}) {
    const formId = `${command}:${String(fixed.id ?? fixed.policyId ?? '')}`;
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      const fd = new FormData(target);
      const values: Record<string, unknown> = Object.fromEntries(fd);
      ['accepted', 'healthConsent', 'success'].forEach(key => { if (fd.has(key)) values[key] = fd.get(key) === 'on' || fd.get(key) === 'true'; });
      if (command === 'credential.create') values.scopes = ['classes:read', ...(fd.get('bookingScope') ? ['bookings:create'] : [])];
      setFailed(null);
      const problem = await run(command, { ...values, ...fixed });
      if (problem) setFailed({ id: formId, text: problem }); else target.reset();
    };
  }
  const failure = (command: string, id = '') => failed?.id === `${command}:${id}` ? <p className="text-xs font-medium text-rose-700 dark:text-rose-400" role="alert">{failed.text}</p> : null;
  const pageHref = (name: string, skip: number) => {
    const params = new URLSearchParams();
    if (data.credentialScope === 'history') params.set('credentials', 'history');
    if (data.memberQuery) params.set('memberQuery', data.memberQuery);
    for (const [key, value] of Object.entries({ noticeSkip: data.pages?.notices?.skip, eventSkip: data.pages?.events?.skip, resourceSkip: data.pages?.resources?.skip, credentialSkip: data.pages?.credentials?.skip })) if (value) params.set(key, String(value));
    if (skip) params.set(name, String(skip)); else params.delete(name);
    return `/dashboard/platform/operations${params.size ? `?${params}` : ''}`;
  };
  const Pager = ({ name, page, anchor }: { name: string; page?: { skip: number; hasMore: boolean }; anchor: string }) => page && (page.skip > 0 || page.hasMore) ? (
    <PanelFooter>
      <div className="flex w-full justify-between text-xs">
        {page.skip > 0 ? <Link className="underline" href={`${pageHref(name, Math.max(0, page.skip - (data.pages?.size || 100)))}#${anchor}`}>Previous</Link> : <span />}
        {page.hasMore ? <Link className="underline" href={`${pageHref(name, page.skip + (data.pages?.size || 100))}#${anchor}`}>Next</Link> : <span />}
      </div>
    </PanelFooter>
  ) : null;
  const policy = data.policies[0];
  const memberOptions = <><option value="">Choose member</option>{data.members.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.email}</option>)}</>;
  // Member choices are a searched page of the directory, never a silent prefix.
  const memberSearch = data.membersHasMore || data.memberQuery ? (
    <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{data.membersHasMore ? 'Member choices show the first 200 matches.' : `Member choices match “${data.memberQuery}”.`}</span>
      <FieldInput name="memberQuery" defaultValue={data.memberQuery} placeholder="Find a member by name or email" aria-label="Find a member" className="h-8 w-56" />
      <Button type="submit" size="sm" variant="outline">Find</Button>
    </form>
  ) : null;
  const cases = casePage?.cases || data.cases;
  const nextCaseAfterId = casePage?.nextCaseAfterId || (!casePage && data.nextCaseAfterId);
  const activeCredentials = data.credentials.filter((c: any) => c.state === 'active').length;

  const reviewEntitlements = async () => {
    setBusy(true);
    try {
      const reviewed = await refreshEntitlements(afterId);
      if (!reviewed.success) throw new Error(reviewed.error);
      const result = reviewed.data;
      setAfterId(result.nextAfterId || undefined);
      const followUps = result.results.filter((r: any) => r.reason).length;
      setMessage({
        tone: followUps ? 'warning' : 'positive',
        text: `Reviewed ${result.processed} memberships. ${result.nextAfterId ? 'More remain; continue with the next page.' : 'Review complete.'} ${followUps} require follow-up.`,
      });
      router.refresh();
    } catch (e) { setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Review failed' }); }
    finally { setBusy(false); }
  };

  return <PlatformBody>
    {message ? (
      <div className="sticky top-2 z-30" aria-live="polite">
        <Notice
          tone={message.tone}
          className="shadow-md"
          action={<Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => { setMessage(null); setToken(null); }} aria-label="Dismiss"><X className="size-4" /></Button>}
        >
          <p className="break-words">{message.text}</p>
          {token ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground">{token}</code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); } }}
              >
                {copied ? <CheckCircle2 aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy credential'}
              </Button>
            </div>
          ) : null}
        </Notice>
      </div>
    ) : null}

    <SectionNav
      items={[
        { id: 'entitlements', label: 'Entitlements' },
        { id: 'notices', label: 'Member notices', count: data.notices.length, tone: data.notices.length ? 'warning' : 'neutral' },
        { id: 'cases', label: 'Cases', count: data.cases.length, tone: data.cases.length ? 'warning' : 'neutral' },
        { id: 'waivers', label: 'Policy & waivers' },
        { id: 'resources', label: 'Facility resources', count: data.resources.length },
        { id: 'credentials', label: 'Integrations', count: activeCredentials },
        { id: 'exports', label: 'Exports' },
        { id: 'payment-events', label: 'Payment events', count: data.paymentEvents.length, tone: data.paymentEvents.length ? 'danger' : 'neutral' },
      ]}
    />

    <Panel id="entitlements">
      <PanelHeader
        icon={RefreshCw}
        title="Entitlement review"
        description="Refresh current service-month allowances, expire elapsed access, and flag future reservations for staff review. Processes at most 50 memberships per page; it does not charge a payment method."
        actions={
          <Button type="button" disabled={busy} onClick={reviewEntitlements}>
            <RefreshCw aria-hidden /> {afterId ? 'Review next page' : 'Review current entitlements'}
          </Button>
        }
      />
    </Panel>

    <Panel id="notices">
      <PanelHeader
        icon={Megaphone}
        title="Member notices"
        count={data.notices.length}
        description="Committed service changes that need a human contact. Record each attempt; unresolved items stay visible. This queue does not send messages automatically."
      />
      {!data.notices.length ? (
        <EmptyBlock compact icon={CheckCircle2} title="No pending member notices" />
      ) : (
        <ul className="divide-y">
          {data.notices.map((n: any) => <li key={n.id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{n.member?.name}</p>
                  <StatusPill tone="info" dot={false}>{humanize(n.kind)}</StatusPill>
                  <StatusPill tone={n.status === 'resolved' ? 'positive' : 'warning'}>{humanize(n.status)}</StatusPill>
                </div>
                <p className="mt-1 text-pretty text-sm">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[n.member?.email, n.member?.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{n.attempts} attempt{n.attempts === 1 ? '' : 's'}</span>
            </div>
            <form onSubmit={form('notice.followUp', { id: n.id })} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5 md:flex-row md:items-center">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Contact outcome</span>
                <FieldInput name="note" required maxLength={1000} placeholder="Contact method and outcome" className="bg-background" />
              </label>
              <CheckField name="success" className="shrink-0">Member reached</CheckField>
              <Button disabled={busy} size="sm" variant="outline">Record attempt</Button>
            </form>
            {failure('notice.followUp', n.id)}
          </li>)}
        </ul>
      )}
      <Pager name="noticeSkip" page={data.pages?.notices} anchor="notices" />
    </Panel>

    <Panel id="cases">
      <PanelHeader
        icon={ShieldAlert}
        title="Safety, privacy and financial cases"
        count={cases.length}
        description="Closure cases block participation until resolved. Keep sensitive witness details in this manager-only queue. Financial cases should reference the provider statement and explain any unresolved difference."
      />
      <div className="border-b bg-muted/20 px-4 py-4 sm:px-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Open a case</p>
        <form onSubmit={form('case.open')} className="grid gap-3">
          <input type="hidden" name="requestKey" value={data.caseRequestKey || `case-${data.policies[0]?.id || 'initial'}-${data.cases.length}`} />
          <FormRow className="sm:grid-cols-3">
            <FormField label="Case type">
              <NativeSelect name="kind">{CASE_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</NativeSelect>
            </FormField>
            <FormField label="Location">
              <NativeSelect name="locationId"><option value="">All locations</option>{data.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</NativeSelect>{data.locationsTruncated ? <span className="text-[11px] text-muted-foreground">Showing the first 500 locations by name.</span> : null}
            </FormField>
            <FormField label="Member" optional>
              <NativeSelect name="memberId">{memberOptions}</NativeSelect>
            </FormField>
          </FormRow>
          <FormRow className="sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <FormField label="Reference" optional>
              <FieldInput name="reference" maxLength={200} placeholder="Statement / inspection reference" />
            </FormField>
            <FormField label="Summary">
              <FieldInput name="summary" required maxLength={2000} placeholder="What happened and next action" />
            </FormField>
          </FormRow>
          <div className="flex justify-end"><Button disabled={busy}>Open case</Button></div>
        </form>
            {failure('case.open', '')}
      </div>
      {!cases.length ? (
        <EmptyBlock compact icon={CheckCircle2} title="No active cases" />
      ) : (
        <ul className="divide-y">
          {cases.map((c: any) => <li key={c.id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={c.kind === 'closure' ? 'danger' : c.kind === 'privacy' ? 'info' : 'neutral'} dot={false}>{CASE_KINDS.find((kind) => kind.value === c.kind)?.label || humanize(c.kind)}</StatusPill>
              <StatusPill tone={caseStatusTone(c.status)}>{humanize(c.status)}</StatusPill>
              {c.reference ? <span className="font-mono text-[11px] text-muted-foreground">{c.reference}</span> : null}
            </div>
            <p className="text-pretty text-sm">{c.summary}</p>
            {(c.history || []).length ? (
              <Disclosure summary={`Review history (${c.history.length})`}>
                <ol className="space-y-2 border-l pl-4">
                  {c.history.map((h: any, i: number) => <li key={i} className="relative text-xs">
                    <span className="absolute -left-[1.3rem] top-1 size-2 rounded-full border-2 border-background bg-muted-foreground/60" aria-hidden />
                    <p className="font-medium">{humanize(h.action)} <span className="font-normal text-muted-foreground">· {stamp(h.at)}</span></p>
                    {h.note ? <p className="mt-0.5 text-muted-foreground">{h.note}</p> : null}
                  </li>)}
                </ol>
              </Disclosure>
            ) : null}
            <form onSubmit={form('case.transition', { id: c.id })} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5 md:flex-row md:items-center">
              <label className="md:w-56">
                <span className="sr-only">New case state</span>
                <NativeSelect name="status" className="bg-background"><option value="review">In review</option><option value="resolved">Resolved / reopen facility</option><option value="open">Reopen case / close facility</option></NativeSelect>
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Review evidence</span>
                <FieldInput name="note" required maxLength={2000} placeholder="Action, owner and evidence" className="bg-background" />
              </label>
              <Button disabled={busy} size="sm" variant="outline">Update case</Button>
            </form>
            {failure('case.transition', c.id)}
            {c.kind === 'privacy' && c.memberId && c.status !== 'resolved' && <form onSubmit={form('privacy.clearHealth', { id: c.id })} className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 md:flex-row md:items-center dark:border-rose-900/60 dark:bg-rose-950/20">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Health clearing reason</span>
                <FieldInput name="note" required placeholder="Retention review and member instruction" className="bg-background" />
              </label>
              <Button disabled={busy} size="sm" variant="destructive">Clear health and emergency fields</Button>
            </form>}
            {c.kind === 'privacy' ? failure('privacy.clearHealth', c.id) : null}
          </li>)}
        </ul>
      )}
      {(nextCaseAfterId || casePage) ? (
        <PanelFooter>
          <span className="text-xs text-muted-foreground">{casePage ? 'Showing a later page of active cases' : 'More active cases are available'}</span>
          <div className="flex gap-2">
            {casePage && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setCasePage(null)}>First active cases</Button>}
            {nextCaseAfterId && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { setCasePage(await loadOperations(false, casePage?.nextCaseAfterId || data.nextCaseAfterId)); } catch { setMessage({ tone: 'danger', text: 'Could not load the next case page' }); } finally { setBusy(false); } }}>Next active cases</Button>}
          </div>
        </PanelFooter>
      ) : null}
    </Panel>

    <Panel id="waivers">
      <PanelHeader
        icon={FileSignature}
        title="Participation policy and external waivers"
        actions={policy ? <StatusPill tone="positive">Version {policy.version}</StatusPill> : <StatusPill tone="warning">No policy</StatusPill>}
      />
      <PanelBody className="space-y-5">
        <Notice tone={policy ? 'info' : 'warning'}>
          {policy ? `Current version: ${policy.version}. Adult-only participation and current waiver verification are enforced according to this policy.` : 'No participation policy is configured. Waiver verification is currently an external staff responsibility; publish a policy to enforce it in booking and admission.'}
        </Notice>
        {policy && <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm font-semibold">Record external waiver verification</p>
          {memberSearch ? <div className="mb-3">{memberSearch}</div> : null}
          <form onSubmit={form('waiver.verify', { policyId: policy.id, requestKey: `verify-${policy.id}-${data.evidenceRequestKey}`, accepted: true })} className="grid gap-3">
            <FormRow className="sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_10rem]">
              <FormField label="Verified member"><NativeSelect name="memberId" required>{memberOptions}</NativeSelect></FormField>
              <FormField label="Signed document reference"><FieldInput name="documentReference" required placeholder="Signed external document reference" /></FormField>
              <FormField label="Expiry" optional><FieldInput type="date" name="expiresAt" /></FormField>
            </FormRow>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CheckField name="healthConsent">Health-data consent verified</CheckField>
              <Button disabled={busy}>Record verification</Button>
            </div>
            {failure('waiver.verify', policy.id)}
          </form>
        </div>}
        <Disclosure summary={policy ? 'Publish a new policy version…' : 'Publish an adult participation policy…'}>
          <form onSubmit={form('policy.publish')} className="grid gap-3">
            <FormRow className="sm:grid-cols-2">
              <FormField label="Policy version"><FieldInput name="version" required maxLength={100} placeholder="2026-10" /></FormField>
              <FormField label="Approved waiver URL"><FieldInput type="url" name="documentReference" required placeholder="https://… approved waiver" /></FormField>
              <FormField label="Purpose of health-data collection"><FieldInput name="healthPurpose" required placeholder="Injury risk screening" /></FormField>
              <FormField label="Health retention review (days)"><FieldInput type="number" name="retentionDays" required min={1} max={3650} defaultValue={365} /></FormField>
            </FormRow>
            <div className="flex justify-end"><Button disabled={busy}>Publish new adult participation policy</Button></div>
          </form>
            {failure('policy.publish', '')}
        </Disclosure>
      </PanelBody>
    </Panel>

    <Panel id="resources">
      <PanelHeader
        icon={Building}
        title="Facility resources"
        count={data.resources.length}
        description="Cancel or reassign future services before retiring a resource or changing allocation settings. Each change records its reason."
      />
      {!data.resources.length ? (
        <EmptyBlock compact icon={Building} title="No facility resources" />
      ) : (
        <ul className="divide-y">
          {data.resources.map((r: any) => <li key={r.id} className="px-4 py-4 sm:px-5">
            <form className="grid gap-3" onSubmit={async event => { event.preventDefault(); const fd = new FormData(event.currentTarget); setBusy(true); setFailed(null); try { const updated = await updateFacilityResource(r.id, { capacity: Number(fd.get('capacity')), setupBufferMinutes: Number(fd.get('setup')), cleanupBufferMinutes: Number(fd.get('cleanup')), isActive: fd.get('active') === 'on', isExclusive: fd.get('exclusive') === 'on', reason: fd.get('reason') }); if (!updated.success) throw new Error(updated.error); setMessage({ tone: 'positive', text: 'Resource updated.' }); router.refresh(); } catch (e) { const text = e instanceof Error ? e.message : 'Resource update failed'; setMessage({ tone: 'danger', text }); setFailed({ id: `resource:${r.id}`, text }); } finally { setBusy(false); } }}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{r.name}</p>
                <StatusPill tone={r.isActive ? 'positive' : 'neutral'}>{r.isActive ? 'Active' : 'Retired'}</StatusPill>
                {r.isExclusive ? <StatusPill dot={false}>Exclusive</StatusPill> : null}
              </div>
              <FormRow className="grid-cols-3 sm:max-w-md">
                <FormField label="Capacity"><FieldInput name="capacity" type="number" min={1} max={500} defaultValue={r.capacity} required className="tabular-nums" /></FormField>
                <FormField label="Setup min"><FieldInput name="setup" type="number" min={0} max={240} defaultValue={r.setupBufferMinutes} required className="tabular-nums" /></FormField>
                <FormField label="Cleanup min"><FieldInput name="cleanup" type="number" min={0} max={240} defaultValue={r.cleanupBufferMinutes} required className="tabular-nums" /></FormField>
              </FormRow>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex gap-4">
                  <CheckField name="active" defaultChecked={r.isActive}>Active</CheckField>
                  <CheckField name="exclusive" defaultChecked={r.isExclusive}>Exclusive</CheckField>
                </div>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Resource change reason</span>
                  <FieldInput name="reason" required maxLength={1000} placeholder="Reason for this change" />
                </label>
                <Button disabled={busy} size="sm" variant="outline">Update resource</Button>
              </div>
            </form>
            {failure('resource', r.id)}
          </li>)}
        </ul>
      )}
      <Pager name="resourceSkip" page={data.pages?.resources} anchor="resources" />
    </Panel>

    <Panel id="credentials">
      <PanelHeader
        icon={KeyRound}
        title="Integration credentials"
        count={data.credentialScope === 'history' ? undefined : activeCredentials}
        description="Scoped, expiring credentials for partner integrations. The secret is shown once at creation."
        actions={
          <div className="flex gap-1 text-xs">
            <Link href="/dashboard/platform/operations#credentials" aria-current={data.credentialScope !== 'history' ? 'page' : undefined} className={data.credentialScope !== 'history' ? 'rounded-md border bg-muted px-2 py-1 font-medium' : 'rounded-md px-2 py-1 text-muted-foreground'}>Active</Link>
            <Link href="/dashboard/platform/operations?credentials=history#credentials" aria-current={data.credentialScope === 'history' ? 'page' : undefined} className={data.credentialScope === 'history' ? 'rounded-md border bg-muted px-2 py-1 font-medium' : 'rounded-md px-2 py-1 text-muted-foreground'}>Expired and revoked</Link>
          </div>
        }
      />
      <div className="border-b bg-muted/20 px-4 py-4 sm:px-5">
        <form onSubmit={form('credential.create')} className="grid gap-3">
          <FormRow className="sm:grid-cols-3">
            <FormField label="Integration name"><FieldInput name="label" required placeholder="Class aggregator" /></FormField>
            <FormField label="Partner identifier"><FieldInput name="partner" required placeholder="partner-id" /></FormField>
            <FormField label="Expires"><FieldInput type="date" name="expiresAt" required /></FormField>
          </FormRow>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CheckField name="bookingScope">Allow booking creation <span className="text-muted-foreground">(adds bookings:create to classes:read)</span></CheckField>
            <Button disabled={busy}>Create scoped credential</Button>
          </div>
        </form>
            {failure('credential.create', '')}
      </div>
      {!data.credentials.length ? (
        <EmptyBlock compact icon={KeyRound} title={data.credentialScope === 'history' ? 'No expired or revoked credentials' : 'No active credentials'} />
      ) : (
        <ul className="divide-y">
          {data.credentials.map((c: any) => <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{c.label}</p>
                <span className="text-xs text-muted-foreground">{c.partner}</span>
                <StatusPill tone={c.state === 'active' ? 'positive' : c.state === 'expired' ? 'warning' : 'neutral'}>{c.state === 'revoked' ? 'Revoked' : c.state === 'expired' ? `Expired ${stamp(c.expiresAt)}` : `Expires ${stamp(c.expiresAt)}`}</StatusPill>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(c.scopes || []).map((scope: string) => <code key={scope} className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{scope}</code>)}
              </div>
            </div>
            {c.state === 'active' && <Button type="button" size="sm" variant="outline" className="text-rose-700 dark:text-rose-400" disabled={busy} onClick={() => run('credential.revoke', { id: c.id })}>Revoke</Button>}
          </li>)}
        </ul>
      )}
      <Pager name="credentialSkip" page={data.pages?.credentials} anchor="credentials" />
    </Panel>

    <Panel id="exports">
      <PanelHeader
        icon={Download}
        title="Operating exports"
        description="Up to 5,000 records across a maximum 93-day window. Payment exports use effective payment date and cumulative refunds; compare against provider statements and retain the result in a financial case."
      />
      <PanelBody>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end" onSubmit={async event => { event.preventDefault(); const fd = new FormData(event.currentTarget); setBusy(true); try { const exported = await downloadOperatingData(String(fd.get('kind')), String(fd.get('from')), String(fd.get('to'))); if (!exported.success) throw new Error(exported.error); const result = exported.data; const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `gym-${fd.get('kind')}.json`; a.click(); URL.revokeObjectURL(url); } catch (e) { setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Export failed' }); } finally { setBusy(false); } }}>
          <FormField label="Export type">
            <NativeSelect name="kind"><option value="payments">Payments</option><option value="members">Member contacts</option><option value="cases">Operations cases</option></NativeSelect>
          </FormField>
          <FormField label="From (inclusive)"><FieldInput type="date" name="from" required /></FormField>
          <FormField label="To (exclusive)"><FieldInput type="date" name="to" required /></FormField>
          <Button disabled={busy} variant="outline"><Download aria-hidden /> Download JSON</Button>
        </form>
      </PanelBody>
    </Panel>

    <Panel id="payment-events" tone={data.paymentEvents.length ? 'danger' : undefined}>
      <PanelHeader
        icon={Webhook}
        title="Payment event recovery"
        count={data.paymentEvents.length}
        description="Replay uses the stored verified event and may reconcile with the payment provider. Inspect unresolved prerequisites first. Never mark a failed event processed to clear this queue."
      />
      {!data.paymentEvents.length ? (
        <EmptyBlock compact icon={CheckCircle2} title="No payment events need recovery" />
      ) : (
        <ul className="divide-y">
          {data.paymentEvents.map((e: any) => <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{e.eventType}</p>
                <StatusPill tone={eventStatusTone(e.status)}>{humanize(e.status)}</StatusPill>
                <CountBadge value={e.attempts} />
                <span className="text-[11px] text-muted-foreground">attempts</span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{e.providerEventId}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const result = await retryPaymentEvent(e.id); setMessage(result.success ? { tone: 'positive', text: 'Event replayed.' } : { tone: 'danger', text: result.error || 'Replay failed' }); router.refresh(); } catch { setMessage({ tone: 'danger', text: 'Replay request failed; inspect the event before retrying.' }); } finally { setBusy(false); } }}>
              <RefreshCw aria-hidden /> Retry recorded event
            </Button>
          </li>)}
        </ul>
      )}
      <Pager name="eventSkip" page={data.pages?.events} anchor="payment-events" />
    </Panel>

  </PlatformBody>;
}
