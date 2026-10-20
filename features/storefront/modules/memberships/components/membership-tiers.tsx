import { Suspense } from "react";
import Link from "next/link";
import { getMembershipTierPage } from "@/features/storefront/lib/data/memberships";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import PlanComparison from "./plan-comparison";

/** One page of published plans in price order; later plans stay reachable with `after`. */
export default async function MembershipTiers({ after }: { after?: string }) {
  const [page, config] = await Promise.all([getMembershipTierPage(after), getStorefrontConfig()]);
  return <>
    <Suspense fallback={<p role="status" className="sf-meta">Loading plans…</p>}><PlanComparison tiers={page.items} currencyCode={config?.currencyCode || "USD"} /></Suspense>
    {after || page.nextAfter ? (
      <nav className="sf-row" data-between aria-label="Plan pages">
        {after ? <Link className="sf-link" href="/memberships">First plans</Link> : <span />}
        {page.nextAfter ? <Link className="sf-link" href={`/memberships?after=${encodeURIComponent(page.nextAfter)}`}>More plans</Link> : <span />}
      </nav>
    ) : null}
  </>;
}
