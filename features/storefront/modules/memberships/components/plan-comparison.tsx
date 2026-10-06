"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import type { MembershipTierData } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { creditLabel, discoveryHref } from "@/features/storefront/lib/discovery";
import { joinPath } from "@/features/storefront/lib/return-path";

export default function PlanComparison({ tiers, currencyCode }: { tiers: MembershipTierData[]; currencyCode: string }) {
  const params = useSearchParams() ?? new URLSearchParams(); const router = useRouter();
  const cycle = params.get("cycle") === "annual" ? "annual" : "monthly";
  return <section aria-label="Compare membership plans">
    <div className="sf-toolbar"><p>Choose how you pay. Class allowances renew by service month.</p><div className="sf-segmented" aria-label="Billing cycle">{(["monthly", "annual"] as const).map(value => <button type="button" key={value} aria-pressed={cycle === value} onClick={() => router.replace(discoveryHref("/memberships", params.toString(), { cycle: value }), { scroll: false })}>{value === "monthly" ? "Monthly" : "Annual"}</button>)}</div></div>
    {!tiers.length ? <div className="sf-empty"><h2>Plans are not available to review yet</h2><p>The club can help you find the right access.</p><Link href="/contact" className="sf-btn-secondary">Ask about membership</Link></div> : <div className="sf-plan-grid">{tiers.map(tier => {
      const available = currencyCode.toUpperCase() === "USD" && (cycle === "annual" ? tier.annualCheckoutAvailable : tier.monthlyCheckoutAvailable);
      return <article key={tier.id} className="sf-plan-card"><p className="sf-eyebrow">{tier.accessHours || "Facility membership"}</p><h2>{tier.name}</h2><p className="sf-plan-price">{formatMajorUnits(cycle === "annual" ? tier.annualPrice : tier.monthlyPrice, currencyCode)}</p><p className="sf-muted">{currencyCode} billed {cycle === "annual" ? "once each year" : "each month"}</p><dl className="sf-facts"><div><dt>Classes</dt><dd>{creditLabel(tier.classCreditsPerMonth)}</dd></div><div><dt>Access hours</dt><dd>{tier.accessHours || "Ask the club"}</dd></div><div><dt>Freeze</dt><dd>{tier.freezeAllowed ? "Available on this plan" : "Not included"}</dd></div><div><dt>Commitment</dt><dd>{tier.contractLength > 0 ? `${tier.contractLength} months` : "No minimum term published"}</dd></div></dl>
      {(tier.guestPasses > 0 || tier.personalTrainingSessions > 0) && <p className="sf-muted text-sm">Published extras: {tier.guestPasses > 0 ? `${tier.guestPasses} guest passes. ` : ""}{tier.personalTrainingSessions > 0 ? `${tier.personalTrainingSessions} personal training sessions. ` : ""}Arrange these with the club; they are not redeemed online.</p>}
      <Link className={available ? "sf-btn-primary" : "sf-btn-secondary"} href={joinPath(tier.id, params.get("returnTo"), cycle)}>Review {tier.name} →</Link><p className="sf-muted text-sm">{available ? "Review your plan before secure checkout." : "Online checkout unavailable for this billing cycle. Contact the club to join."}</p></article>;
    })}</div>}
    <div className="sf-notice mt-8"><strong>Choose a plan around the sessions you want.</strong><p>Class bookings depend on availability, membership eligibility and credits for the session date. A membership purchase does not reserve a class.</p><Link href="/schedule" className="sf-link">Explore the timetable →</Link></div>
  </section>;
}
