import Link from "next/link";
import { Check } from "lucide-react";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";

const TIER_PERKS: Record<string, string[]> = {
  basic: ["Full gym access", "4 classes / month", "6am–10pm access", "Online booking"],
  premium: ["Full gym access", "Unlimited classes", "24/7 access", "2 guest passes", "1 PT session / month"],
  elite: ["Full gym access", "Unlimited classes", "24/7 access", "5 guest passes", "4 PT sessions / month", "Nutrition consult"],
};

function getPerks(name: string): string[] {
  const k = name.toLowerCase();
  for (const [key, value] of Object.entries(TIER_PERKS)) {
    if (k.includes(key)) return value;
  }
  return ["Full gym access", "Structured booking", "Coach-led classes"];
}

export default async function MembershipCTA() {
  const tiers = await getMembershipTiers();
  const shown = tiers.slice(0, 3);
  if (!shown.length) return null;

  return (
    <section className="bg-[#0e0e0e] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="mb-16 border-b border-white/10 pb-12">
          <p className="gym-eyebrow">Membership</p>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <h2 className="gym-heading">Your contract<br />with self</h2>
            <p className="gym-body max-w-sm md:text-right md:pb-2">
              No hidden fees. No predatory lock-ins. Just clear facility access, class credits, and coaching benefits.
            </p>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 gap-px bg-white/[0.06] md:grid-cols-3">
          {shown.map((tier, index) => {
            const perks = getPerks(tier.name);
            const isPrimary = index === 1;
            return (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between p-8 ${isPrimary ? "bg-[#242424]" : "bg-[#1c1b1b]"}`}
              >
                {/* Featured accent bar — indigo */}
                {isPrimary && (
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#818cf8_0%,#4f46e5_100%)]" />
                )}
                {isPrimary && (
                  <span className="absolute top-4 right-6 text-[9px] font-bold uppercase tracking-[0.22em] text-[#818cf8]">
                    Most popular
                  </span>
                )}

                <div>
                  <h3 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                    {tier.name}
                  </h3>
                  <ul className="mt-6 space-y-3">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-3 text-sm text-[#e5e2e1]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#818cf8]" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-10">
                  <div className="flex items-baseline gap-1">
                    <div className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black leading-none text-white">
                      {Math.round(tier.monthlyPrice)}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c4c7c7]">USD/mo</div>
                  </div>
                  <Link
                    href={`/join?tier=${tier.id}`}
                    className={`mt-6 block w-full py-4 text-center text-xs font-bold uppercase tracking-[0.22em] transition-all ${
                      isPrimary
                        ? "bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] text-white"
                        : "border-2 border-white/30 text-[#e5e2e1] hover:border-[#818cf8] hover:text-[#818cf8]"
                    }`}
                  >
                    Join now
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
