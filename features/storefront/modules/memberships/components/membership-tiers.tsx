"use server";

import Link from "next/link";
import { Check } from "lucide-react";
import { getMembershipTiers, type MembershipTierData } from "@/features/storefront/lib/data/memberships";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatMajorUnits } from "@/features/platform/lib/currency";

function buildFeatures(tier: MembershipTierData): string[] {
  const f: string[] = [];
  if (tier.classCreditsPerMonth === -1) {
    f.push("Unlimited classes");
  } else if (tier.classCreditsPerMonth > 0) {
    f.push(`${tier.classCreditsPerMonth} classes / month`);
  } else {
    f.push("No classes included");
  }
  if (tier.freezeAllowed) f.push("Provider-backed membership freeze option");
  f.push("Online class booking");
  f.push("Member check-in code");
  return f;
}

export default async function MembershipTiers() {
  const [tiers, config] = await Promise.all([getMembershipTiers(), getStorefrontConfig()]);
  const currencyCode = config?.currencyCode || "USD";

  if (!tiers.length) {
    return (
      <div className="sf-card px-6 py-10 text-sm text-[var(--sf-ink-muted)]">
        Membership plans will appear here after setup.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {tiers.map((tier) => {
        const features = buildFeatures(tier);
        const annualSaving = tier.annualPrice ? tier.monthlyPrice * 12 - tier.annualPrice : null;
        return (
          <div key={tier.id} className="sf-card relative flex flex-col p-8">
            <h3 className="text-xl font-semibold">{tier.name}</h3>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="sf-display text-5xl">{formatMajorUnits(tier.monthlyPrice, currencyCode)}</span>
              <span className="text-sm text-[var(--sf-ink-muted)]">/mo</span>
            </div>

            {annualSaving && annualSaving > 0 ? (
              <p className="mt-2 text-xs text-[var(--sf-ink-muted)]">Save {formatMajorUnits(annualSaving, currencyCode)} / year billed annually</p>
            ) : null}

            <ul className="mt-8 flex-1 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-accent)]" strokeWidth={2.5} />
                  <span className="text-[var(--sf-ink-muted)]">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={`/join?tier=${tier.id}`}
              className="sf-btn-secondary mt-10 block w-full text-center"
            >
              Review {tier.name}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
