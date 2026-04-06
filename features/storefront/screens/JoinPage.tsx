import Link from "next/link";
import { Check, CreditCard } from "lucide-react";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { redirectToMembershipCheckout } from "@/features/integrations/payment/stripe";
import LoginPage from "./LoginPage";

interface JoinPageProps {
  tier?: string;
  checkoutError?: string;
}

export default async function JoinPage({ tier, checkoutError }: JoinPageProps) {
  const [tiers, user, config] = await Promise.all([
    getMembershipTiers().catch(() => []),
    getUser(),
    getStorefrontConfig(),
  ]);
  const selectedTier = tier ? tiers.find((t) => t.id === tier) ?? tiers[0] : tiers[0];

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Link href="/memberships" className="inline-flex border-b border-[#ffb59e] pb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">
          ← Back to memberships
        </Link>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">
              {config?.promoBanner || `Join ${config?.name || 'the gym'}`}
            </p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              Join
              <br />
              {config?.name || 'the gym'}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">
              Choose your level of facility access and class access. We’ll create your account first, then move you into secure Stripe checkout for {config?.name || 'your gym membership'}.
            </p>

            {tiers.length > 0 ? (
              <div className="mt-10 space-y-4">
                {tiers.map((t, index) => {
                  const isSelected = t.id === selectedTier?.id;
                  const classesCopy =
                    t.classCreditsPerMonth === -1
                      ? "Unlimited classes"
                      : t.classCreditsPerMonth === 0
                        ? "Gym access only"
                        : `${t.classCreditsPerMonth} classes / month`;
                  return (
                    <Link
                      key={t.id}
                      href={`/join?tier=${t.id}`}
                      className={`flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between ${
                        isSelected ? "bg-[#1c1b1b] border-l-4 border-[#ffb59e]" : "bg-[#0e0e0e] border border-white/10 hover:bg-[#1c1b1b]"
                      }`}
                    >
                      <div>
                        <p className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                          {t.name}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
                          Full gym access · {classesCopy}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black tracking-[-0.04em] text-white">${Math.round(t.monthlyPrice)}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">USD / month</p>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-[#ffb59e]" strokeWidth={2.5} />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-10 bg-[#1c1b1b] px-6 py-10 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
                Membership plans will appear here after setup.
              </div>
            )}
          </div>

          <div className="self-start bg-[#1c1b1b] p-8">
            {user && selectedTier ? (
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">Signed in as</p>
                  <p className="mt-2 text-sm uppercase tracking-[0.16em] text-white">{user.email}</p>
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                        {selectedTier.name}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
                        {selectedTier.classCreditsPerMonth === -1
                          ? "Unlimited classes"
                          : selectedTier.classCreditsPerMonth === 0
                            ? "No classes included"
                            : `${selectedTier.classCreditsPerMonth} classes / month`}
                      </p>
                    </div>
                    <CreditCard className="h-4 w-4 text-[#c4c7c7]" />
                  </div>
                </div>

                {checkoutError && (
                  <div className="border border-[#ffb4ab]/30 bg-[#93000a]/20 px-3 py-3 text-sm text-[#ffdad6]">
                    {checkoutError}
                  </div>
                )}

                <div className="grid gap-3">
                  <form action={redirectToMembershipCheckout}>
                    <input type="hidden" name="tierId" value={selectedTier.id} />
                    <input type="hidden" name="billingCycle" value="monthly" />
                    <button type="submit" className="w-full bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95">
                      Checkout monthly · ${Math.round(selectedTier.monthlyPrice)}
                    </button>
                  </form>
                  <form action={redirectToMembershipCheckout}>
                    <input type="hidden" name="tierId" value={selectedTier.id} />
                    <input type="hidden" name="billingCycle" value="annual" />
                    <button type="submit" className="w-full border border-[#7df4ff] px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#7df4ff] transition-colors hover:bg-[#7df4ff]/10">
                      Checkout annual · ${Math.round(selectedTier.annualPrice)}
                    </button>
                  </form>
                </div>

                <p className="text-xs leading-relaxed text-[#c4c7c7]">
                  Checkout is handled securely by Stripe. After payment, your membership will be provisioned automatically and synced back into your account.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">Create your account</p>
                  <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
                    Identity first.
                    <br />
                    Checkout second.
                  </h2>
                </div>
                <LoginPage redirectTo={selectedTier ? `/join?tier=${selectedTier.id}` : "/join"} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
