import Link from "next/link";
import { getMembershipTierById, getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getParticipationStatus } from "@/features/storefront/lib/data/participation";
import { checkoutReviewedPlan } from "@/features/storefront/lib/actions/checkout";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import LoginPage from "./LoginPage";
import SubmitButton from "@/features/storefront/modules/common/submit-button";
import { creditLabel } from "@/features/storefront/lib/discovery";
import { termLabel } from "@/features/storefront/lib/presentation";
import { joinPath, safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";
import { contactPath } from "@/features/storefront/lib/contact-config";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink, Banner, EmptyState } from "@/features/storefront/modules/common/ui";

export default async function JoinPage({ tier, cycle: requestedCycle, checkoutError, returnTo }: { tier?: string; cycle?: string; checkoutError?: string; returnTo?: string }) {
  const [tiers, user, config, participation] = await Promise.all([getMembershipTiers(), getUser(), getStorefrontConfig(), getParticipationStatus()]);
  const terms = config?.participationTerms?.acceptanceRequired ? { policyId: config.participationTerms.policyId, version: config.participationTerms.version } : null;
  const cycle = requestedCycle === "annual" ? "annual" : "monthly";
  // Default to a plan that can be bought now for the chosen cycle.
  // A plan chosen from any catalog page is read by id, so it is never reported as unavailable
  // merely because it sorts after the plans read for the switcher.
  const selected = tier
    ? tiers.find(item => item.id === tier) ?? await getMembershipTierById(tier).catch(() => null) ?? undefined
    : tiers.find(item => cycle === "annual" ? item.annualCheckoutAvailable : item.monthlyCheckoutAvailable) ?? tiers[0];
  const safeReturnTo = returnTo ? safeStorefrontReturnPath(returnTo) : null;
  const currency = (config?.currencyCode || "USD").toUpperCase();
  const existing = user?.membership && ["active", "frozen", "past-due"].includes(user.membership.status);
  const available = currency === "USD" && selected && (cycle === "annual" ? selected.annualCheckoutAvailable : selected.monthlyCheckoutAvailable);
  const signupsAllowed = process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true";
  const price = selected ? formatMajorUnits(cycle === "annual" ? selected.annualPrice : selected.monthlyPrice, currency) : null;
  const per = cycle === "annual" ? "year" : "month";
  const contactHref = contactPath("membership", selected ? joinPath(selected.id, safeReturnTo, cycle) : "/join");

  return <div className="sf-page"><div className="sf-wrap">
    <PageHead crumb={{ href: "/memberships", label: "Memberships" }} title="Join" />

    <ol className="sf-steps" aria-label="Joining progress">
      <li aria-current="step"><b>1</b>Plan</li>
      <li data-done={user ? true : undefined}><b>2</b>Account</li>
      <li><b>3</b>{available ? "Payment" : "Contact the club"}</li>
    </ol>

    {!selected ? (
      <EmptyState
        headingLevel={2}
        title={tier ? "This plan is no longer available" : "No plans published"}
        action={<div className="sf-actions"><Link href="/memberships" className="sf-btn">Memberships</Link><ArrowLink href="/contact">Contact</ArrowLink></div>}
      />
    ) : (
      <div className="sf-join">
        <section className="sf-card" aria-labelledby="join-plan">
          {tiers.length > 1 ? (
            <nav className="sf-seg" aria-label="Plan">
              {tiers.map(item => <Link key={item.id} href={joinPath(item.id, safeReturnTo, cycle)} aria-current={item.id === selected.id ? "true" : undefined} scroll={false}>{item.name}</Link>)}
            </nav>
          ) : null}
          <div className="sf-plan-head">
            <h2 id="join-plan" className="sf-h2">{selected.name}</h2>
            {selected.accessHours ? <p className="sf-meta">Access: {selected.accessHours}</p> : null}
          </div>
          <div className="sf-row" data-between>
            <p className="sf-price"><strong>{price}</strong><span>/ {per}</span></p>
            <nav className="sf-seg" aria-label="Billing cycle">
              {(["monthly", "annual"] as const).map(value => <Link key={value} aria-current={cycle === value ? "true" : undefined} href={joinPath(selected.id, safeReturnTo, value)} scroll={false}>{value === "monthly" ? "Monthly" : "Annual"}</Link>)}
            </nav>
          </div>
          <dl className="sf-facts">
            <div><dt>Classes</dt><dd>{creditLabel(selected.classCreditsPerMonth)}</dd></div>
            <div><dt>Access</dt><dd>{selected.accessHours || "Not published"}</dd></div>
            <div><dt>Freeze</dt><dd>{selected.freezeAllowed ? "Included" : "Not included"}</dd></div>
            <div><dt>Minimum term</dt><dd>{termLabel(selected.contractLength)}</dd></div>
            {selected.guestPasses > 0 ? <div><dt>Guest passes</dt><dd>{selected.guestPasses}, arranged with the club</dd></div> : null}
            {selected.personalTrainingSessions > 0 ? <div><dt>Personal training</dt><dd>{selected.personalTrainingSessions} sessions, arranged with the club</dd></div> : null}
            <div><dt>Billing</dt><dd>{currency}, {cycle === "annual" ? `yearly, paid in full${selected.classCreditsPerMonth > 0 ? "; class credits renew monthly" : ""}` : "monthly"}</dd></div>
          </dl>
          <div><ArrowLink href="/policies" size="sm">Policies</ArrowLink></div>
        </section>

        <aside className="sf-join-aside sf-card" aria-labelledby="join-account">
          <h2 id="join-account" className="sf-h3">{user ? "Checkout" : "Account"}</h2>
          {checkoutError ? (
            <Banner tone="bad" action={<div className="sf-actions"><Link className="sf-link" href="/account/membership">Membership</Link><Link className="sf-link" href={contactHref}>Contact the club</Link></div>}>
              {checkoutError} If you already paid, check your membership before trying again.
            </Banner>
          ) : null}
          {user ? <>
            <p className="sf-meta sf-break">Signed in as {user.email}</p>
            {existing ? (
              <Banner title="You already have a membership." action={<Link href="/account/membership" className="sf-link">Manage membership</Link>} />
            ) : !available ? (
              <Banner tone="warn" title={`Online checkout is unavailable for ${cycle} billing.`} action={<Link href={contactHref} className="sf-link">Contact the club</Link>} />
            ) : (
              <form action={checkoutReviewedPlan} className="sf-form">
                <input type="hidden" name="tierId" value={selected.id} />
                <input type="hidden" name="billingCycle" value={cycle} />
                {safeReturnTo ? <input type="hidden" name="returnTo" value={safeReturnTo} /> : null}
                <div className="sf-receipt">
                  <div className="sf-row" data-between><strong>{selected.name}</strong><span className="sf-meta">{cycle === "annual" ? "Annual" : "Monthly"}</span></div>
                  <p className="sf-num"><span className="sf-strong">{price}</span> {currency} / {per}</p>
                </div>
                {participation && !participation.accepted ? (
                  <>
                    <input type="hidden" name="termsPolicyId" value={participation.policyId} />
                    <label className="sf-check">
                      <input type="checkbox" name="acceptTerms" required />
                      <span>I accept the <Link href={participation.termsHref} className="sf-link" target="_blank">participation terms</Link> (version {participation.version})</span>
                    </label>
                  </>
                ) : null}
                <SubmitButton variant="accent" size="lg" block pendingLabel="Opening checkout…">Continue to payment</SubmitButton>
                <p className="sf-meta">Payment by Stripe. Membership starts after payment is verified.</p>
              </form>
            )}
          </> : (
            <div className="sf-stack">
              {!available ? <Banner tone="warn" title="Online checkout is unavailable for this plan." action={<Link href={contactHref} className="sf-link">Contact the club</Link>} /> : null}
              {!signupsAllowed ? (
                <Banner title="Online sign-up is unavailable" action={<Link href={contactHref} className="sf-link">Contact the club to join</Link>}>
                  Members can sign in below.
                </Banner>
              ) : null}
              <LoginPage redirectTo={joinPath(selected.id, safeReturnTo, cycle)} allowSignup={signupsAllowed} defaultView="signup" terms={terms} />
            </div>
          )}
        </aside>
      </div>
    )}
  </div></div>;
}
