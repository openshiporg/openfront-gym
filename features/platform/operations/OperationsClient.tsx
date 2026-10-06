'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOperations, downloadOperatingData, retryPaymentEvent, refreshEntitlements, loadOperations, updateFacilityResource } from './actions';

export function OperationsClient({ data }: { data: any }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [afterId, setAfterId] = useState<string | undefined>();
  const [casePage, setCasePage] = useState<any>(null);
  const router = useRouter();
  async function run(command: string, values: Record<string, unknown>) {
    setBusy(true); setMessage('');
    try {
      const result = await submitOperations(command, values);
      setMessage(result.success ? result.data?.token ? `Copy this credential now; it will not be shown again: ${result.data.token}` : 'Saved.' : result.error || 'Could not save');
      if (result.success) { setCasePage(null); router.refresh(); }
    } catch { setMessage('Request failed. Retry the same operation after checking the queue.'); }
    finally { setBusy(false); }
  }
  function form(command: string, fixed: Record<string, unknown> = {}) {
    return async (fd: FormData) => {
      const values: Record<string, unknown> = Object.fromEntries(fd);
      ['accepted', 'healthConsent', 'success'].forEach(key => { if (fd.has(key)) values[key] = fd.get(key) === 'on' || fd.get(key) === 'true'; });
      if (command === 'credential.create') values.scopes = ['classes:read', ...(fd.get('bookingScope') ? ['bookings:create'] : [])];
      await run(command, { ...values, ...fixed });
    };
  }
  const input = 'rounded border bg-background px-3 py-2 text-sm';
  const button = 'rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50';
  const policy = data.policies[0];
  const members = <><option value="">Choose member</option>{data.members.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.email}</option>)}</>;
  return <div className="space-y-8 p-4 md:p-6">
    <section className="space-y-3"><h2 className="text-xl font-semibold">Entitlement review</h2><p>Refresh current service-month allowances, expire elapsed access and flag future reservations for staff review. Processes at most 50 memberships per page; it does not charge a payment method.</p><button disabled={busy} className={button} onClick={async () => { setBusy(true); try { const result = await refreshEntitlements(afterId); setAfterId(result.nextAfterId || undefined); setMessage(`Reviewed ${result.processed} memberships. ${result.nextAfterId ? 'More remain; continue with the next page.' : 'Review complete.'} ${result.results.filter((r: any) => r.reason).length} require follow-up.`); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Review failed'); } finally { setBusy(false); } }}>{afterId ? 'Review next page' : 'Review current entitlements'}</button></section>
    <p className="text-sm text-muted-foreground">Contact queues contain committed service changes. Record each contact attempt; unresolved items remain visible for follow-up. This queue does not send messages automatically.</p>
    <p role="status" className="break-all">{message}</p>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Member notices</h2>
      {!data.notices.length && <p>No pending member notices.</p>}
      {data.notices.map((n: any) => <article className="space-y-2 rounded border p-4" key={n.id}>
        <p className="font-medium">{n.member?.name} · {n.kind} · {n.status}</p><p>{n.message}</p>
        <p className="text-sm">{n.member?.email} · {n.member?.phone} · {n.attempts} attempts</p>
        <form action={form('notice.followUp', { id: n.id })} className="flex flex-wrap gap-2">
          <input className={input} name="note" required maxLength={1000} aria-label="Contact outcome" placeholder="Contact method and outcome" />
          <label><input type="checkbox" name="success" /> Member reached</label>
          <button disabled={busy} className={button}>Record attempt</button>
        </form>
      </article>)}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Safety, privacy and financial cases</h2>
      <p className="text-sm">Closure cases block participation until resolved. Keep sensitive witness details in this manager-only queue. Financial cases should reference the provider statement and explain any unresolved difference.</p>
      <form action={form('case.open')} className="flex flex-wrap gap-2">
        <input type="hidden" name="requestKey" value={data.caseRequestKey || `case-${data.policies[0]?.id || 'initial'}-${data.cases.length}`} />
        <select className={input} name="kind" aria-label="Case type"><option value="incident">Incident</option><option value="inspection">Inspection</option><option value="closure">Facility closure</option><option value="finance">Financial reconciliation</option><option value="integration">Integration exception</option><option value="privacy">Privacy review</option></select>
        <select className={input} name="locationId" aria-label="Location"><option value="">All locations</option>{data.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className={input} name="memberId" aria-label="Member">{members}</select>
        <input className={input} name="reference" maxLength={200} placeholder="Statement / inspection reference" aria-label="Reference" />
        <input className={input} name="summary" required maxLength={2000} placeholder="What happened and next action" aria-label="Case summary" />
        <button className={button} disabled={busy}>Open case</button>
      </form>
      {(casePage?.cases || data.cases).map((c: any) => <article className="space-y-2 rounded border p-4" key={c.id}>
        <p className="font-medium">{c.kind} · {c.status} · {c.reference}</p><p>{c.summary}</p>
        <details><summary>Review history</summary>{(c.history || []).map((h: any, i: number) => <p className="text-sm" key={i}>{h.at} · {h.action} · {h.note}</p>)}</details>
        <form action={form('case.transition', { id: c.id })} className="flex flex-wrap gap-2">
          <select className={input} name="status" aria-label="New case state"><option value="review">In review</option><option value="resolved">Resolved / reopen facility</option><option value="open">Reopen case / close facility</option></select>
          <input className={input} name="note" required maxLength={2000} aria-label="Review evidence" placeholder="Action, owner and evidence" /><button className={button} disabled={busy}>Update case</button>
        </form>
        {c.kind === 'privacy' && c.memberId && c.status !== 'resolved' && <form action={form('privacy.clearHealth', { id: c.id })} className="flex gap-2">
          <input className={input} name="note" required placeholder="Retention review and member instruction" aria-label="Health clearing reason" />
          <button className={button} disabled={busy}>Clear health and emergency fields</button>
        </form>}
      </article>)}
      {(casePage?.nextCaseAfterId || (!casePage && data.nextCaseAfterId)) && <button className={button} disabled={busy} onClick={async () => { setBusy(true); try { setCasePage(await loadOperations(false, casePage?.nextCaseAfterId || data.nextCaseAfterId)); } catch { setMessage('Could not load the next case page'); } finally { setBusy(false); } }}>Next active cases</button>}
      {casePage && <button className={button} disabled={busy} onClick={() => setCasePage(null)}>First active cases</button>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Participation policy and external waivers</h2>
      <p>{policy ? `Current version: ${policy.version}. Adult-only participation and current waiver verification are enforced according to this policy.` : 'No participation policy is configured. Waiver verification is currently an external staff responsibility; publish a policy to enforce it in booking and admission.'}</p>
      <form action={form('policy.publish')} className="flex flex-wrap gap-2">
        <input className={input} name="version" required maxLength={100} placeholder="Policy version" aria-label="Policy version" />
        <input className={input} type="url" name="documentReference" required placeholder="https://… approved waiver" aria-label="Approved waiver URL" />
        <input className={input} name="healthPurpose" required placeholder="Purpose of health-data collection" aria-label="Health-data purpose" />
        <input className={input} type="number" name="retentionDays" required min={1} max={3650} defaultValue={365} aria-label="Health retention review days" />
        <button className={button} disabled={busy}>Publish new adult participation policy</button>
      </form>
      {policy && <form action={form('waiver.verify', { policyId: policy.id, requestKey: `verify-${policy.id}-${data.evidenceRequestKey}`, accepted: true })} className="flex flex-wrap gap-2">
        <select className={input} name="memberId" required aria-label="Verified member">{members}</select>
        <input className={input} name="documentReference" required placeholder="Signed external document reference" aria-label="Signed waiver reference" />
        <input className={input} type="date" name="expiresAt" aria-label="Optional waiver expiry" />
        <label><input type="checkbox" name="healthConsent" /> Health-data consent verified</label>
        <button className={button} disabled={busy}>Record external waiver verification</button>
      </form>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Facility resources</h2><p>Cancel or reassign future services before retiring a resource or changing allocation settings. Each change records its reason.</p>
      {data.resources.map((r: any) => <form key={r.id} className="flex flex-wrap items-center gap-2 rounded border p-3" action={async fd => { setBusy(true); try { await updateFacilityResource(r.id, { capacity: Number(fd.get('capacity')), setupBufferMinutes: Number(fd.get('setup')), cleanupBufferMinutes: Number(fd.get('cleanup')), isActive: fd.get('active') === 'on', isExclusive: fd.get('exclusive') === 'on', reason: fd.get('reason') }); setMessage('Resource updated.'); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Resource update failed'); } finally { setBusy(false); } }}>
        <strong>{r.name}</strong><label>Capacity <input className={input} name="capacity" type="number" min={1} max={500} defaultValue={r.capacity} required /></label>
        <label>Setup minutes <input className={input} name="setup" type="number" min={0} max={240} defaultValue={r.setupBufferMinutes} required /></label><label>Cleanup minutes <input className={input} name="cleanup" type="number" min={0} max={240} defaultValue={r.cleanupBufferMinutes} required /></label>
        <label><input name="active" type="checkbox" defaultChecked={r.isActive} /> Active</label><label><input name="exclusive" type="checkbox" defaultChecked={r.isExclusive} /> Exclusive</label><input className={input} name="reason" required maxLength={1000} aria-label="Resource change reason" placeholder="Reason for this change" /><button className={button} disabled={busy}>Update resource</button>
      </form>)}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Integration credentials</h2>
      <form action={form('credential.create')} className="flex flex-wrap gap-2">
        <input className={input} name="label" required placeholder="Integration name" aria-label="Credential label" /><input className={input} name="partner" required placeholder="Partner identifier" aria-label="Partner identifier" />
        <input className={input} type="date" name="expiresAt" required aria-label="Credential expiry" /><label><input type="checkbox" name="bookingScope" /> Allow booking creation</label>
        <button className={button} disabled={busy}>Create scoped credential</button>
      </form>
      {data.credentials.map((c: any) => <div className="flex flex-wrap items-center gap-3" key={c.id}><span>{c.label} · {c.partner} · {(c.scopes || []).join(', ')} · {c.revokedAt ? 'Revoked' : `Expires ${c.expiresAt}`}</span>{!c.revokedAt && <button className={button} disabled={busy} onClick={() => run('credential.revoke', { id: c.id })}>Revoke</button>}</div>)}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Operating exports</h2>
      <p className="text-sm">Up to 5,000 records across a maximum 93-day window. Payment exports use effective payment date and cumulative refunds; compare against provider statements and retain the result in a financial case.</p>
      <form className="flex flex-wrap gap-2" action={async fd => { setBusy(true); try { const result = await downloadOperatingData(String(fd.get('kind')), String(fd.get('from')), String(fd.get('to'))); const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `gym-${fd.get('kind')}.json`; a.click(); URL.revokeObjectURL(url); } catch (e) { setMessage(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(false); } }}>
        <select className={input} name="kind" aria-label="Export type"><option value="payments">Payments</option><option value="members">Member contacts</option><option value="cases">Operations cases</option></select>
        <input className={input} type="date" name="from" required aria-label="Export start inclusive" /><input className={input} type="date" name="to" required aria-label="Export end exclusive" />
        <button className={button} disabled={busy}>Download JSON</button>
      </form>
    </section>
    <section><h2 className="text-xl font-semibold">Payment event recovery</h2>{data.paymentEvents.map((e: any) => <div className="flex flex-wrap items-center gap-3" key={e.id}><span>{e.eventType} · {e.providerEventId} · {e.status} · {e.attempts} attempts</span><button className={button} disabled={busy} onClick={async () => { setBusy(true); try { const result = await retryPaymentEvent(e.id); setMessage(result.success ? 'Event replayed.' : result.error || 'Replay failed'); router.refresh(); } catch { setMessage('Replay request failed; inspect the event before retrying.'); } finally { setBusy(false); } }}>Retry recorded event</button></div>)}<p className="text-sm">Replay uses the stored verified event and may reconcile with the payment provider. Inspect unresolved prerequisites first. Never mark a failed event processed to clear this queue.</p></section>
  </div>;
}
