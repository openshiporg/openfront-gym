import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";

export default async function AccountMembershipPage() {
  const user = await getUser();
  if (!user) notFound();

  const membership = user.membership;
  const tiers = await getMembershipTiers().catch(() => []);

  return (
    <div className="space-y-10 text-[#e5e2e1]">
      <header>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
          Membership
        </h1>
        <p className="mt-3 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">Plan status, billing cadence, and alternative access tiers.</p>
      </header>

      {membership ? (
        <section className="bg-[#1c1b1b] p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Current plan</p>
              <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.05em] text-white">
                {membership.tier?.name ?? "Unknown"}
              </h2>
              <p className="mt-3 text-sm uppercase tracking-[0.18em] text-[#c4c7c7]">${membership.tier?.monthlyPrice ?? 0} / month</p>
            </div>
            <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${membership.status === "active" ? "bg-[#d3fbff] text-[#00363a]" : "bg-[#353535] text-white"}`}>
              {membership.status}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 border-t border-white/10 pt-8 sm:grid-cols-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Class access</span>
              <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                {membership.tier?.classCreditsPerMonth === -1 ? "Unlimited" : `${membership.classCreditsRemaining ?? 0} left`}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Member since</span>
              <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                {membership.startDate ? new Date(membership.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Next billing</span>
              <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                {membership.nextBillingDate ? new Date(membership.nextBillingDate).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-[#1c1b1b] px-6 py-16 text-center">
          <p className="text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">No active membership.</p>
          <Link href="/memberships" className="mt-6 inline-flex bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95">
            View plans
          </Link>
        </section>
      )}

      {tiers.length > 0 && (
        <section>
          <h2 className="mb-5 font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">Available plans</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tiers.map((tier, index) => {
              const isCurrent = membership?.tier?.id === tier.id;
              return (
                <div key={tier.id} className={`${isCurrent ? "bg-[#2a2a2a] border-t-4 border-[#ffb59e]" : index % 2 === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"} p-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">{tier.name}</h3>
                    {isCurrent && <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb59e]">Current</span>}
                  </div>
                  <p className="mt-4 font-[family-name:var(--font-space-grotesk)] text-3xl font-black text-white">${Math.round(tier.monthlyPrice ?? 0)}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">USD / month</p>
                  <ul className="mt-5 space-y-2 text-xs uppercase tracking-[0.16em] text-[#c4c7c7]">
                    <li>Full gym access</li>
                    <li>{tier.classCreditsPerMonth === -1 ? "Unlimited classes" : `${tier.classCreditsPerMonth} classes / month`}</li>
                    <li>{tier.accessHours} access</li>
                  </ul>
                  {!isCurrent && (
                    <Link href={`/join?tier=${tier.id}`} className="mt-6 inline-flex border border-[#7df4ff] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#7df4ff] transition-colors hover:bg-[#7df4ff]/10">
                      Switch via checkout
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
