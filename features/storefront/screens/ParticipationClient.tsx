'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOperations } from '@/features/platform/operations/actions';

export function ParticipationClient({ data }: { data: any }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function run(command: string, values: Record<string, unknown>) {
    setBusy(true);
    try { const result = await submitOperations(command, values); setMessage(result.success ? 'Saved.' : result.error || 'Could not save'); if (result.success) router.refresh(); }
    catch { setMessage('The request could not be completed. Please retry.'); }
    finally { setBusy(false); }
  }
  const p = data.policy;
  let documentHref: string | null = null;
  try {
    const reference = String(p?.documentReference || "");
    const url = new URL(reference, "https://club.invalid");
    if (/^(https?:\/\/|\/(?!\/))/.test(reference) && !reference.includes("\\") && ["http:", "https:"].includes(url.protocol)) documentHref = reference;
  } catch { /* Keep acceptance unavailable until the published document has a usable link. */ }
  return <div className="space-y-6"><p role="status">{message}</p>
    {p ? <section className="sf-panel space-y-3"><h2 className="text-xl font-medium">Policy {p.version}</h2>
      {documentHref ? <a className="sf-link" href={documentHref} target="_blank" rel="noreferrer">Read the participation document (opens a new tab)</a> : <p className="sf-notice">The current document cannot be opened here. Contact the club to review it before recording acceptance.</p>}
      <p>Health information is used for: {p.healthPurpose}. Retention review interval: {p.retentionDays} days. {p.adultOnly ? 'Participation is limited to adults; keep your birth date accurate in your profile.' : ''}</p>
      {documentHref && <form action={async fd => run('waiver.accept', { policyId: p.id, requestKey: data.requestKey, accepted: fd.get('accepted') === 'on', healthConsent: fd.get('healthConsent') === 'on' })} className="space-y-3">
        <label className="block"><input type="checkbox" name="accepted" required /> I have read and accept the linked participation document, version {p.version}.</label>
        <label className="block"><input type="checkbox" name="healthConsent" /> I consent to storing optional health information for the stated purpose.</label>
        <button disabled={busy} className="sf-btn-primary">{busy ? "Saving…" : "Record acceptance"}</button>
      </form>}
    </section> : <p>The studio has not published a participation policy here. Contact staff about external waiver verification before attending.</p>}
    <section className="sf-panel space-y-3"><h2 className="text-xl font-medium">Your participation evidence</h2>{!data.evidence?.length && <p className="sf-muted">No acceptance is recorded here yet. Review the current document above, or ask staff about evidence recorded outside this account.</p>}{(data.evidence || []).map((e: any) => <div key={e.id} className="rounded border p-3"><p>{e.acceptedAt} · {e.revokedAt ? 'Revoked' : 'Recorded'}{e.expiresAt ? ` · Expires ${e.expiresAt}` : ''}</p>{!e.revokedAt && <details><summary>Withdraw this acceptance and consent</summary><p className="sf-muted mb-3">This can affect participation eligibility. The club retains acceptance history and reviews optional health information separately.</p><button disabled={busy} className="underline" onClick={() => run('waiver.revoke', { id: e.id, reason: 'Member withdrew acceptance and optional health consent' })}>Confirm withdrawal</button></details>}</div>)}</section>
    <section className="sf-panel space-y-3"><h2 className="text-xl font-medium">Privacy requests</h2><p>Request access, correction or removal of health/profile information. Staff will review retained financial evidence separately and record the outcome.</p>
      <form action={async fd => run('privacy.request', { requestKey: `privacy-${data.requestKey}`, summary: fd.get('summary') })} className="space-y-2"><textarea name="summary" required maxLength={2000} aria-label="Privacy request" className="w-full border border-[var(--sf-border-strong)] bg-[var(--sf-background)] p-3" /><button className="sf-btn-primary" disabled={busy}>{busy ? "Sending…" : "Submit privacy request"}</button></form>
      {(data.requests || []).map((r: any) => <p key={r.id}>{r.createdAt} · {r.status} · {r.summary}</p>)}
    </section>
  </div>;
}
