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
      <div className="mx-auto grid max-w-7xl gap-16 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="flex flex-col justify-center">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-6xl">
            Your contract
            <br />
            with self
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#c4c7c7]">
            No hidden fees. No predatory lock-ins. Just a clear mix of facility access, class access, and recovery-oriented membership benefits.
          </p>
          <Link href="/memberships" className="mt-8 inline-flex border-2 border-[#d3fbff] px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] text-[#d3fbff] transition-colors hover:bg-[#d3fbff]/10">
            Compare all plans
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((tier, index) => {
            const perks = getPerks(tier.name);
            const isPrimary = index === 1;
            return (
              <div key={tier.id} className={`flex flex-col justify-between p-8 ${isPrimary ? "border-t-4 border-[#ffb59e] bg-[#2a2a2a]" : "bg-[#1c1b1b]"}`}>
                <div>
                  <h3 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
                    {tier.name}
                  </h3>
                  <ul className="mt-6 space-y-3">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-3 text-sm text-[#e5e2e1]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7df4ff]" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-10">
                  <div className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black leading-none text-white">
                    {Math.round(tier.monthlyPrice)}
                  </div>
                  <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">USD / month</div>
                  <Link href={`/join?tier=${tier.id}`} className="mt-6 inline-flex bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95">
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
