"use server";

import Link from "next/link";
import { Check } from "lucide-react";
import { getMembershipTiers, type MembershipTierData } from "@/features/storefront/lib/data/memberships";

function buildFeatures(tier: MembershipTierData): string[] {
  const f: string[] = ["Full gym access"];
  if (tier.classCreditsPerMonth === -1) {
    f.push("Unlimited classes");
  } else if (tier.classCreditsPerMonth > 0) {
    f.push(`${tier.classCreditsPerMonth} classes / month`);
  } else {
    f.push("No classes included");
  }
  if (tier.accessHours === "24/7") f.push("24 / 7 facility access");
  else f.push("Staffed-hours access");
  if (tier.personalTrainingSessions > 0) {
    f.push(`${tier.personalTrainingSessions} PT session${tier.personalTrainingSessions > 1 ? "s" : ""} / month`);
  }
  if (tier.guestPasses > 0) {
    f.push(`${tier.guestPasses} guest pass${tier.guestPasses > 1 ? "es" : ""} / month`);
  }
  if (tier.freezeAllowed) f.push("Membership freeze option");
  if (tier.contractLength === 0) f.push("No contract — cancel any time");
  f.push("Online class booking");
  f.push("Locker room access");
  return f;
}

export default async function MembershipTiers() {
  const tiers = await getMembershipTiers();

  if (!tiers.length) {
    return (
      <div className="border border-dashed rounded-lg px-6 py-10 text-center text-sm text-muted-foreground">
        Membership plans will appear here after setup.
      </div>
    );
  }

  const recIdx = tiers.length > 1 ? 1 : 0;

  return (
    <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3 rounded-lg overflow-hidden border">
      {tiers.map((tier, i) => {
        const isRec = i === recIdx;
        const features = buildFeatures(tier);
        const annualSaving = tier.annualPrice
          ? Math.round(tier.monthlyPrice * 12 - tier.annualPrice)
          : null;

        return (
          <div
            key={tier.id}
            className={`relative flex flex-col px-7 py-9 ${
              isRec ? "bg-foreground text-background" : "bg-background"
            }`}
          >
            {isRec && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-3">
                Most popular
              </p>
            )}

            <p className={`text-sm font-semibold uppercase tracking-wider ${
              isRec ? "text-background/70" : "text-muted-foreground"
            }`}>
              {tier.name}
            </p>

            <div className="mt-3 flex items-baseline gap-1">
              <span
                className={`text-4xl font-bold tracking-tight ${
                  isRec ? "text-background" : "text-foreground"
                }`}
                style={{ letterSpacing: "-0.03em" }}
              >
                ${tier.monthlyPrice}
              </span>
              <span className={`text-sm ${isRec ? "text-background/50" : "text-muted-foreground"}`}>/mo</span>
            </div>

            {annualSaving && annualSaving > 0 && (
              <p className={`mt-1 text-xs ${isRec ? "text-background/50" : "text-muted-foreground"}`}>
                Save ${annualSaving} / year billed annually
              </p>
            )}

            <ul className="mt-7 space-y-3 flex-1">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isRec ? "text-violet-400" : "text-violet-600"}`}
                    strokeWidth={2.5}
                  />
                  <span className={isRec ? "text-background/80" : "text-muted-foreground"}>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={`/join?tier=${tier.id}`}
              className={`mt-9 inline-flex h-10 items-center justify-center rounded-md border text-sm font-semibold transition-colors ${
                isRec
                  ? "border-background/20 bg-background/10 text-background hover:bg-background/20"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              Get started
            </Link>
          </div>
        );
      })}
    </div>
  );
}
