import Link from "next/link";
import { Check, CreditCard } from "lucide-react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { redirectToMembershipCheckout } from "@/features/integrations/payment/membership-checkout";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import LoginPage from "./LoginPage";
import { joinPath, safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

interface JoinPageProps {
  tier?: string;
  checkoutError?: string;
  returnTo?: string;
}

export default async function JoinPage({ tier, checkoutError, returnTo }: JoinPageProps) {
  const [tiers, user, config] = await Promise.all([
    getMembershipTiers().catch(() => []),
    getUser(),
    getStorefrontConfig(),
  ]);
  const selectedTier = tier ? tiers.find((t) => t.id === tier) ?? tiers[0] : tiers[0];
  const signupAllowed = process.env.PUBLIC_SIGNUPS_ALLOWED === "true";
  const safeReturnTo = returnTo ? safeStorefrontReturnPath(returnTo) : null;
  const brandName = getStorefrontBrandName(config);
  const currencyCode = String(config?.currencyCode || "USD").toUpperCase();
  const checkoutCurrencySupported = currencyCode === "USD";
  const hasCurrentMembership = Boolean(
    user?.membership && ["active", "frozen", "past-due"].includes(user.membership.status),
  );

  return (
    <div className="sf-page px-5 pb-24 pt-12 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/memberships" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
          ← Back to membership plans
        </Link>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <p className="sf-eyebrow">{config?.promoBanner || `Join ${brandName}`}</p>
            <h1 className="sf-display mt-4 text-[var(--text-display-s)]">Become a member</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">
              Choose your membership plan. We&apos;ll create your account first, then move you into secure Stripe checkout
              for {brandName}.
            </p>

            {tiers.length > 0 ? (
              <div className="mt-10 divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
                {tiers.map((t) => {
                  const isSelected = t.id === selectedTier?.id;
                  const classesCopy =
                    t.classCreditsPerMonth === -1
                      ? "Unlimited classes"
                      : t.classCreditsPerMonth === 0
                        ? "No classes included"
                        : `${t.classCreditsPerMonth} classes / month`;
                  return (
                    <Link
                      key={t.id}
                      href={joinPath(t.id, safeReturnTo)}
                      className={`grid gap-4 py-6 transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
                        isSelected ? "bg-[var(--color-accent-soft)]/40" : "hover:bg-[var(--color-paper-2)]"
                      }`}
                    >
                      <div className="px-1">
                        <p className="text-xl font-semibold">{t.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                          {classesCopy} · Online class booking
                        </p>
                      </div>
                      <div className="flex items-center gap-4 px-1">
                        <div className="text-right">
                          <p className="sf-display text-3xl">{formatMajorUnits(t.monthlyPrice, currencyCode)}</p>
                          <p className="text-xs text-[var(--color-ink-muted)]">{currencyCode} / month</p>
                        </div>
                        {isSelected ? <Check className="h-5 w-5 text-[var(--color-accent)]" strokeWidth={2.5} /> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-10 border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-10 text-sm text-[var(--color-ink-muted)]">
                Membership plans will appear here after setup.
              </div>
            )}
          </div>

          <aside className="self-start border border-[var(--color-rule)] bg-[var(--color-surface)] p-8">
            {user && selectedTier ? (
              <div className="space-y-6">
                <div>
                  <p className="sf-label">Signed in as</p>
                  <p className="mt-2 text-sm font-medium">{user.email}</p>
                </div>

                <div className="border-t border-[var(--color-rule)] pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold">{selectedTier.name}</p>
                      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                        {selectedTier.classCreditsPerMonth === -1
                          ? "Unlimited classes"
                          : selectedTier.classCreditsPerMonth === 0
                            ? "No classes included"
                            : `${selectedTier.classCreditsPerMonth} classes / month`}
                      </p>
                    </div>
                    <CreditCard className="h-4 w-4 text-[var(--color-ink-faint)]" />
                  </div>
                </div>

                {checkoutError ? (
                  <div className="border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800">{checkoutError}</div>
                ) : null}

                {hasCurrentMembership ? (
                  <div className="border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 text-sm text-[var(--color-ink-muted)]">
                    This account already has a current membership. Contact the front desk for plan changes, or manage the existing membership from your account.
                    <Link href="/account/membership" className="mt-3 block font-medium text-[var(--color-accent)] hover:underline">Manage current membership</Link>
                  </div>
                ) : !checkoutCurrencySupported ? (
                  <div className="border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 text-sm text-[var(--color-ink-muted)]">
                    Online membership checkout is available in USD only for this launch. Contact the front desk to join in {currencyCode}.
                  </div>
                ) : !selectedTier.monthlyCheckoutAvailable && !selectedTier.annualCheckoutAvailable ? (
                  <div className="border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 text-sm leading-6 text-[var(--color-ink-muted)]">
                    <p>Online checkout is not configured for this plan, so no payment can be accepted here yet.</p>
                    <Link href="/contact" className="mt-3 inline-flex font-medium text-[var(--color-accent)] hover:underline">
                      Contact the front desk
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedTier.monthlyCheckoutAvailable ? (
                      <form action={redirectToMembershipCheckout}>
                        <input type="hidden" name="tierId" value={selectedTier.id} />
                        <input type="hidden" name="billingCycle" value="monthly" />
                        {safeReturnTo ? <input type="hidden" name="returnTo" value={safeReturnTo} /> : null}
                        <button type="submit" className="sf-btn-primary w-full">
                          Checkout monthly · {formatMajorUnits(selectedTier.monthlyPrice, currencyCode)}
                        </button>
                      </form>
                    ) : null}
                    {selectedTier.annualCheckoutAvailable ? (
                      <form action={redirectToMembershipCheckout}>
                        <input type="hidden" name="tierId" value={selectedTier.id} />
                        <input type="hidden" name="billingCycle" value="annual" />
                        {safeReturnTo ? <input type="hidden" name="returnTo" value={safeReturnTo} /> : null}
                        <button type="submit" className="sf-btn-outline w-full">
                          Checkout annual · {formatMajorUnits(selectedTier.annualPrice, currencyCode)}
                        </button>
                      </form>
                    ) : null}
                  </div>
                )}

                <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
                  Checkout is handled securely by Stripe. After payment, your membership is provisioned automatically. This launch scope does not capture waivers; your studio may require a separate waiver before facility access.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="sf-eyebrow">Account first</p>
                  <h2 className="mt-3 text-2xl font-semibold">
                    {signupAllowed ? "Create your profile, then checkout" : "Sign in to continue"}
                  </h2>
                  {!signupAllowed ? (
                    <p className="mt-3 text-sm leading-6 text-[var(--color-ink-muted)]">Public account creation is disabled. Ask the front desk to create your member account, then sign in here.</p>
                  ) : null}
                </div>
                <LoginPage
                  redirectTo={joinPath(selectedTier?.id, safeReturnTo)}
                  allowSignup={signupAllowed}
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
