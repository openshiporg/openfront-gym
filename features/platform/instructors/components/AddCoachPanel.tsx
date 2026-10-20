import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure, EmptyBlock, FieldInput, Notice, Panel, PanelHeader } from "@/features/platform/components/platform-ui";
import { createCoachProfileAction, loadEligibleCoachAccounts } from "../actions/coaches";

/**
 * Add a coach from the accounts that can be one: this club's accounts with an instructor role
 * and no coach profile yet, searched on the server. Ordinary member accounts are never offered.
 */
export async function AddCoachPanel({ q = "", skip = 0, error }: { q?: string; skip?: number; error?: string }) {
  const result = await loadEligibleCoachAccounts(q, skip);
  const page = result.ok ? result.data : null;
  const href = (next: number) => `/dashboard/platform/instructors?${new URLSearchParams({ ...(q ? { coachQuery: q } : {}), ...(next ? { coachSkip: String(next) } : {}) })}#add-coach`;
  return (
    <Panel id="add-coach">
      <PanelHeader icon={UserPlus} title="Add coach" description="Choose an account with an instructor role. Give someone that role first under Roles if they aren't listed." />
      <div className="space-y-3 px-4 py-3 sm:px-5">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!result.ok ? <Notice tone="danger">{result.error}</Notice> : null}
        <form method="get" className="flex flex-wrap gap-2" action="/dashboard/platform/instructors#add-coach">
          <FieldInput name="coachQuery" defaultValue={q} placeholder="Find by name or email" aria-label="Find an eligible account" className="w-64" />
          <Button type="submit" variant="outline" size="sm">Find</Button>
        </form>
        {page && page.accounts.length === 0 ? (
          <EmptyBlock compact icon={UserPlus} title={q ? "No eligible accounts match" : "No accounts are waiting for a coach profile"} />
        ) : page ? (
          <Disclosure summary={`Eligible accounts (${page.skip + 1}–${page.skip + page.accounts.length}${page.hasMore ? "+" : ""})`}>
            <ul className="divide-y rounded-lg border">
              {page.accounts.map((account: any) => (
                <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{account.name}</span> <span className="text-xs text-muted-foreground">{account.email}</span></span>
                  <form action={createCoachProfileAction}><input type="hidden" name="userId" value={account.id} /><Button type="submit" size="sm">Create coach profile</Button></form>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between text-xs">
              {page.skip > 0 ? <Link className="underline" href={href(Math.max(0, page.skip - page.pageSize))}>Previous</Link> : <span />}
              {page.hasMore ? <Link className="underline" href={href(page.skip + page.pageSize)}>More accounts</Link> : <span />}
            </div>
          </Disclosure>
        ) : null}
      </div>
    </Panel>
  );
}
