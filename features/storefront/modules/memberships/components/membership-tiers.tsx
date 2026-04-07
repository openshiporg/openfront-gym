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
      <div className="bg-[#1c1b1b] px-6 py-10 text-sm uppercase tracking-[0.14em] text-[#c4c7c7]">
        Membership plans will appear here after setup.
      </div>
    );
  }

  const recIdx = tiers.length > 1 ? 1 : 0;

  return (
    <div className="grid grid-cols-1 gap-px bg-white/[0.06] sm:grid-cols-3">
      {tiers.map((tier, i) => {
        const isRec = i === recIdx;
        const features = buildFeatures(tier);
        const annualSaving = tier.annualPrice
          ? Math.round(tier.monthlyPrice * 12 - tier.annualPrice)
          : null;

        return (
          <div
            key={tier.id}
            className={`relative flex flex-col px-8 py-10 ${isRec ? "bg-[#242424]" : "bg-[#1c1b1b]"}`}
          >
            {/* Recommended top accent */}
            {isRec && (
              <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#818cf8_0%,#4f46e5_100%)]" />
            )}
            {isRec && (
              <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">
                Most popular
              </p>
            )}

            <p className="gym-label">{tier.name}</p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black tracking-tight text-white">
                ${tier.monthlyPrice}
              </span>
              <span className="text-xs text-[#c4c7c7]">/mo</span>
            </div>

            {annualSaving && annualSaving > 0 && (
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a5b4fc]">
                Save ${annualSaving} / year billed annually
              </p>
            )}

            <ul className="mt-8 flex-1 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#818cf8]"
                    strokeWidth={2.5}
                  />
                  <span className="text-[#c4c7c7]">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={`/join?tier=${tier.id}`}
              className={`mt-10 block w-full py-4 text-center text-xs font-bold uppercase tracking-[0.2em] transition-all ${
                isRec
                  ? "bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] text-white"
                  : "border-2 border-white/30 text-[#e5e2e1] hover:border-[#818cf8] hover:text-[#818cf8]"
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
