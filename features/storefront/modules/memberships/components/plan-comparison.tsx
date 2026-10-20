"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import type { MembershipTierData } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { creditLabel, discoveryHref } from "@/features/storefront/lib/discovery";
import { joinPath } from "@/features/storefront/lib/return-path";
import { termLabel } from "@/features/storefront/lib/presentation";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";

export default function PlanComparison({ tiers, currencyCode }: { tiers: MembershipTierData[]; currencyCode: string }) {
  const params = useSearchParams() ?? new URLSearchParams(); const router = useRouter();
  const cycle = params.get("cycle") === "annual" ? "annual" : "monthly";
  const usd = currencyCode.toUpperCase() === "USD";
  const online = (tier: MembershipTierData) => usd && (cycle === "annual" ? tier.annualCheckoutAvailable : tier.monthlyCheckoutAvailable);

  if (!tiers.length) {
    return <EmptyState headingLevel={2} title="No plans published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />;
  }

  return <section aria-label="Compare membership plans" className="sf-stack" data-gap="lg">
    <div className="sf-seg" role="group" aria-label="Billing cycle" style={{ justifySelf: "start" }}>
      {(["monthly", "annual"] as const).map(value => (
        <button type="button" key={value} aria-pressed={cycle === value} onClick={() => router.replace(discoveryHref("/memberships", params.toString(), { cycle: value }), { scroll: false })}>
          {value === "monthly" ? "Monthly" : "Annual"}
        </button>
      ))}
    </div>

    <div className="sf-plans" data-count={tiers.length >= 3 ? "many" : undefined}>
      {tiers.map(tier => {
        const available = online(tier);
        return (
          <article key={tier.id} className="sf-plan">
            <div className="sf-plan-head">
              <h2>{tier.name}</h2>
              {tier.accessHours ? <p className="sf-meta">Access: {tier.accessHours}</p> : null}
            </div>
            <div className="sf-stack" data-gap="sm">
              <p className="sf-price"><strong>{formatMajorUnits(cycle === "annual" ? tier.annualPrice : tier.monthlyPrice, currencyCode)}</strong><span>/ {cycle === "annual" ? "year" : "month"}</span></p>
              <p className="sf-meta">{currencyCode.toUpperCase()}, billed {cycle === "annual" ? "yearly" : "monthly"}</p>
            </div>
            <dl className="sf-facts">
              <div><dt>Classes</dt><dd>{creditLabel(tier.classCreditsPerMonth)}</dd></div>
              <div><dt>Freeze</dt><dd>{tier.freezeAllowed ? "Included" : "Not included"}</dd></div>
              <div><dt>Minimum term</dt><dd>{termLabel(tier.contractLength)}</dd></div>
              {tier.guestPasses > 0 ? <div><dt>Guest passes</dt><dd>{tier.guestPasses}</dd></div> : null}
              {tier.personalTrainingSessions > 0 ? <div><dt>Personal training</dt><dd>{tier.personalTrainingSessions} sessions</dd></div> : null}
            </dl>
            {tier.features?.length ? (
              <ul className="sf-list-plain" aria-label={`${tier.name} includes`}>
                {tier.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            ) : null}
            <div className="sf-stack" data-gap="sm">
              <Link className="sf-btn" data-variant={available ? "accent" : "secondary"} data-block href={joinPath(tier.id, params.get("returnTo"), cycle)}>Choose {tier.name}</Link>
              {!available ? <p className="sf-meta">Online checkout unavailable for {cycle} billing</p> : null}
            </div>
          </article>
        );
      })}
    </div>

    {tiers.length > 1 ? (
      <section className="sf-stack" aria-labelledby="compare-plans">
        <h2 id="compare-plans" className="sf-h2">Compare</h2>
        <div className="sf-compare-wrap">
          <table className="sf-compare">
            <thead><tr><th scope="col"><span className="sr-only">Plan detail</span></th>{tiers.map(tier => <th key={tier.id} scope="col">{tier.name}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">Monthly</th>{tiers.map(tier => <td key={tier.id}>{formatMajorUnits(tier.monthlyPrice, currencyCode)}</td>)}</tr>
              <tr><th scope="row">Annual</th>{tiers.map(tier => <td key={tier.id}>{formatMajorUnits(tier.annualPrice, currencyCode)}</td>)}</tr>
              <tr><th scope="row">Classes</th>{tiers.map(tier => <td key={tier.id}>{creditLabel(tier.classCreditsPerMonth)}</td>)}</tr>
              <tr><th scope="row">Access hours</th>{tiers.map(tier => <td key={tier.id} data-muted={!tier.accessHours || undefined}>{tier.accessHours || "Not published"}</td>)}</tr>
              <tr><th scope="row">Freeze</th>{tiers.map(tier => <td key={tier.id} data-muted={!tier.freezeAllowed || undefined}>{tier.freezeAllowed ? "Included" : "Not included"}</td>)}</tr>
              <tr><th scope="row">Minimum term</th>{tiers.map(tier => <td key={tier.id} data-muted={!(tier.contractLength > 0) || undefined}>{termLabel(tier.contractLength)}</td>)}</tr>
              <tr><th scope="row">Guest passes</th>{tiers.map(tier => <td key={tier.id} data-muted={!(tier.guestPasses > 0) || undefined}>{tier.guestPasses > 0 ? tier.guestPasses : "None"}</td>)}</tr>
              <tr><th scope="row">Personal training</th>{tiers.map(tier => <td key={tier.id} data-muted={!(tier.personalTrainingSessions > 0) || undefined}>{tier.personalTrainingSessions > 0 ? `${tier.personalTrainingSessions} sessions` : "None"}</td>)}</tr>
              <tr><th scope="row">Online checkout</th>{tiers.map(tier => {
                const cycles = [usd && tier.monthlyCheckoutAvailable ? "Monthly" : null, usd && tier.annualCheckoutAvailable ? "Annual" : null].filter(Boolean);
                return <td key={tier.id} data-muted={!cycles.length || undefined}>{cycles.length ? cycles.join(", ") : "Unavailable"}</td>;
              })}</tr>
            </tbody>
          </table>
        </div>
      </section>
    ) : null}
  </section>;
}
