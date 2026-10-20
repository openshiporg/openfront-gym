'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { submitOperations } from '@/features/platform/operations/actions';
import { Banner } from '@/features/storefront/modules/common/ui';

export function ParticipationClient({ data }: { data: any }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function run(command: string, values: Record<string, unknown>) {
    setBusy(true);
    try { const result = await submitOperations(command, values); setMessage(result.success ? 'Saved.' : result.error || 'Could not save'); if (result.success) router.refresh(); }
    catch { setMessage('The request could not be completed. Please retry.'); }
    finally { setBusy(false); }
  }
  const p = data.policy;
  // The server applies the same validity rule as admission (expired or future evidence isn't current).
  const acceptedCurrent = Boolean(p && data.acceptedCurrent);
  const healthConsentCurrent = Boolean(p && data.healthConsentCurrent);
  const stateLabel: Record<string, string> = { withdrawn: 'Withdrawn', expired: 'Expired', pending: 'Not yet effective', current: 'Current' };
  let documentHref: string | null = null;
  try {
    const reference = String(p?.documentReference || "");
    const url = new URL(reference, "https://club.invalid");
    if (/^(https?:\/\/|\/(?!\/))/.test(reference) && !reference.includes("\\") && ["http:", "https:"].includes(url.protocol)) documentHref = reference;
  } catch { /* Keep acceptance unavailable until the published document has a usable link. */ }
  return <div className="sf-stack" data-gap="lg" style={{ maxWidth: 760 }}>
    <div aria-live="polite">{message ? <Banner tone={message === "Saved." ? "ok" : "bad"}>{message}</Banner> : null}</div>

    {p && !p.placeholder ? <section className="sf-card" aria-labelledby="participation-policy">
      <div className="sf-titleline"><h2 id="participation-policy" className="sf-h3">Participation document</h2><span className="sf-state" data-tone="neutral">Version {p.version}</span></div>
      {p.documentText ? <p style={{ whiteSpace: "pre-wrap" }}>{p.documentText}</p>
        : documentHref ? <a className="sf-btn" data-variant="secondary" href={documentHref} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>Read document<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
        : <Banner tone="warn">The current document can’t be opened here. Contact the club to review it.</Banner>}
      {p.healthPurpose || p.adultOnly ? <dl className="sf-facts" data-plain>
        {p.healthPurpose ? <div><dt>Health information</dt><dd>{p.healthPurpose}</dd></div> : null}
        {p.healthPurpose ? <div><dt>Retention review</dt><dd>Every {p.retentionDays} days</dd></div> : null}
        {p.adultOnly ? <div><dt>Eligibility</dt><dd>Adults only</dd></div> : null}
      </dl> : null}
      {acceptedCurrent ? <Banner tone="ok" title={`You accepted version ${p.version}`} /> : null}
      {/* Optional health storage is its own choice; it doesn't need, and never counts as, accepting the terms. */}
      {p.healthPurpose && (acceptedCurrent || !(p.enforceWaiver && (p.documentText || documentHref))) ? <div className="sf-stack" data-gap="sm">
        <h3 className="sf-h3">Optional health information</h3>
        <p className="sf-text-2">{healthConsentCurrent ? 'You allow the club to store optional health information for the purpose above.' : 'You haven’t allowed the club to store optional health information.'}</p>
        <div><button type="button" disabled={busy} className="sf-btn" data-variant="secondary" data-size="sm" onClick={() => run('health.consent', { policyId: p.id, grant: !healthConsentCurrent, requestKey: data.requestKey })}>
          {busy ? 'Saving…' : healthConsentCurrent ? 'Withdraw health consent' : 'Allow health information'}
        </button></div>
      </div> : null}
      {p.enforceWaiver && (p.documentText || documentHref) && !acceptedCurrent ? <form action={async fd => run('waiver.accept', { policyId: p.id, requestKey: data.requestKey, accepted: fd.get('accepted') === 'on', healthConsent: fd.get('healthConsent') === 'on' })} className="sf-form">
        <label className="sf-check"><input type="checkbox" name="accepted" required /><span>I accept the participation terms, version {p.version}</span></label>
        {p.healthPurpose ? <label className="sf-check"><input type="checkbox" name="healthConsent" /><span>Store optional health information for the stated purpose</span></label> : null}
        <div><button disabled={busy} className="sf-btn">{busy ? "Saving…" : "Record acceptance"}</button></div>
      </form> : null}
    </section> : <Banner title="No participation document to accept online">The club hasn’t published one. Ask the front desk if you have questions about taking part.</Banner>}

    <section className="sf-card" aria-labelledby="participation-evidence">
      <h2 id="participation-evidence" className="sf-h3">Your acceptances and consents</h2>
      {acceptedCurrent || healthConsentCurrent ? <details className="sf-disclosure"><summary>Withdraw acceptance and consent</summary><div>
        <p className="sf-meta">This withdraws every current acceptance of the participation terms and any permission to store optional health information. It can affect your eligibility to take part. The club keeps the history.</p>
        <div><button disabled={busy} className="sf-btn" data-variant="danger" data-size="sm" onClick={() => run('waiver.revoke', { reason: 'Member withdrew acceptance and optional health consent' })}>Withdraw all</button></div>
      </div></details> : null}
      {!data.evidence?.length ? <p className="sf-text-2">None recorded</p> : null}
      {(data.evidence || []).map((e: any) => <div key={e.id} className="sf-panel" style={{ padding: 16, gap: 8 }}>
        <div className="sf-titleline"><p className="sf-num">{e.acceptedAt}{e.expiresAt ? ` · expires ${e.expiresAt}` : ''}</p><span className="sf-state" data-tone={e.state === 'current' ? 'ok' : 'neutral'}>{e.kind === 'health_consent' ? 'Health information permission' : e.healthConsent ? 'Acceptance with health permission' : 'Acceptance'} · {stateLabel[e.state] || 'Recorded'}</span></div>
      </div>)}
      {data.evidenceNextAfterId ? <div><Link className="sf-link" href={`/account/participation?after=${encodeURIComponent(data.evidenceNextAfterId)}`}>Show older records</Link></div> : null}
    </section>

    <section className="sf-card" aria-labelledby="privacy-requests">
      <h2 id="privacy-requests" className="sf-h3">Privacy requests</h2>
      <form action={async fd => run('privacy.request', { requestKey: `privacy-${data.requestKey}`, summary: fd.get('summary') })} className="sf-form">
        <label className="sf-field">Request access, correction or removal of your information<textarea name="summary" required maxLength={2000} rows={4} /></label>
        <div><button className="sf-btn" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></div>
      </form>
      {(data.requests || []).length ? <ul className="sf-bookings">{(data.requests || []).map((r: any) => <li key={r.id} className="sf-stack" data-gap="sm" style={{ borderBottom: "1px solid var(--sf-line)", paddingBlock: 12 }}><div className="sf-titleline"><span className="sf-meta sf-num">{r.createdAt}</span><span className="sf-state" data-tone="neutral" style={{ textTransform: "capitalize" }}>{r.status}</span></div><p>{r.summary}</p></li>)}</ul> : null}
    </section>
  </div>;
}
