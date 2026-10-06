import { Suspense } from "react";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import PlanComparison from "./plan-comparison";
export default async function MembershipTiers() {
  const [tiers, config] = await Promise.all([getMembershipTiers(), getStorefrontConfig()]);
  return <Suspense fallback={<p role="status">Loading plan comparison…</p>}><PlanComparison tiers={tiers} currencyCode={config?.currencyCode || "USD"} /></Suspense>;
}
