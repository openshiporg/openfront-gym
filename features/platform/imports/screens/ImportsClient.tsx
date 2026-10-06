'use client';
import { useActionState } from 'react';
import { importContactsAction } from '../actions/imports';
export function ImportsClient() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">Import member contacts</h1><p>Preview up to 100 contacts, resolve conflicts, then import. Use the same source and external IDs when retrying.</p></div>
    <p>Imports prepare member accounts. Memberships and payments require the normal purchase workflow. Members can use Forgot password to set up access.</p>
    <form action={action} className="space-y-4">
      <label className="block">Source name<input name="source" required maxLength={100} placeholder="Previous gym system" className="block w-full rounded border p-2" /></label>
      <label className="block">Contact CSV<textarea name="csv" required rows={10} className="block w-full rounded border p-2 font-mono" placeholder={'externalId,name,email,phone\nmember-1,Alex Smith,alex@example.com,5550101'} /></label>
      <div className="flex gap-3"><button disabled={pending} name="mode" value="preview" className="rounded border px-4 py-2">Preview</button><button disabled={pending} name="mode" value="import" className="rounded bg-primary px-4 py-2 text-primary-foreground">Import contacts</button></div>
    </form>
    {state?.error && <p role="alert">{state.error}</p>}
    {state?.results && <section aria-live="polite"><h2 className="text-lg font-medium">{state.dryRun ? 'Preview results' : 'Import results'}</h2><table className="w-full text-left"><thead><tr><th>External ID</th><th>Result</th><th>Review</th></tr></thead><tbody>{state.results.map((row: any) => <tr key={row.externalId}><td>{row.externalId}</td><td>{row.status}</td><td>{row.message || (row.memberId ? 'Member account ready' : '')}</td></tr>)}</tbody></table></section>}
  </main>;
}
