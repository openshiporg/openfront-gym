import Link from "next/link";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { checkoutReviewedPlan } from "@/features/storefront/lib/actions/checkout";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import LoginPage from "./LoginPage";
import SubmitButton from "@/features/storefront/modules/common/submit-button";
import { creditLabel } from "@/features/storefront/lib/discovery";
import { joinPath, safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export default async function JoinPage({ tier, cycle: requestedCycle, checkoutError, returnTo }: { tier?: string; cycle?: string; checkoutError?: string; returnTo?: string }) {
  const [tiers, user, config] = await Promise.all([getMembershipTiers(), getUser(), getStorefrontConfig()]);
  const selected = tier ? tiers.find(item => item.id === tier) : tiers[0];
  const cycle = requestedCycle === "annual" ? "annual" : "monthly";
  const safeReturnTo = returnTo ? safeStorefrontReturnPath(returnTo) : null;
  const currency = (config?.currencyCode || "USD").toUpperCase();
  const existing = user?.membership && ["active", "frozen", "past-due"].includes(user.membership.status);
  const available = currency === "USD" && selected && (cycle === "annual" ? selected.annualCheckoutAvailable : selected.monthlyCheckoutAvailable);
  return <div className="sf-page"><div className="sf-container">
    <Link href="/memberships" className="sf-link">← Compare memberships</Link>
    <header className="sf-page-header mt-8"><div><p className="sf-eyebrow">Join the club</p><h1 className="sf-display">Your plan. Your next step.</h1></div><p className="sf-lead">{available ? "Review your membership and sign in to check whether you can continue to secure checkout." : "Review the published plans. Online checkout is unavailable for this selection; contact the club about joining."}</p></header>
    <ol className="sf-steps" aria-label="Joining progress"><li aria-current="step">1 · Review plan</li><li>{user ? "2 · Signed in" : "2 · Your account"}</li><li>{available ? "3 · Secure payment" : "3 · Contact the club"}</li></ol>
    {!selected ? <div className="sf-empty"><h2>{tier ? "This plan is no longer available" : "Membership plans are not published yet"}</h2><p>Choose a current plan or ask the club about joining.</p><Link href="/memberships" className="sf-btn-primary">View current plans</Link><Link href="/contact" className="sf-link">Contact the club</Link></div> : <div className="sf-join-grid">
      <section className="sf-panel"><p className="sf-eyebrow">Review your selection</p><h2 className="sf-display text-3xl mt-3">{selected.name}</h2><nav className="sf-plan-options" aria-label="Select a membership">{tiers.map(item => <Link key={item.id} href={joinPath(item.id, safeReturnTo, cycle)} aria-current={item.id === selected.id ? "true" : undefined}>{item.name}</Link>)}</nav>
        <div className="sf-segmented my-6" aria-label="Select billing cycle">{(["monthly", "annual"] as const).map(value => <Link key={value} aria-current={cycle === value ? "true" : undefined} href={joinPath(selected.id, safeReturnTo, value)}>{value === "monthly" ? "Monthly" : "Annual"}</Link>)}</div>
        <p className="sf-plan-price">{formatMajorUnits(cycle === "annual" ? selected.annualPrice : selected.monthlyPrice, currency)}</p><p className="sf-muted">{currency} recurring {cycle === "annual" ? "yearly payment, paid in full" : "monthly payment"}</p>
        <dl className="sf-facts"><div><dt>Class allowance</dt><dd>{creditLabel(selected.classCreditsPerMonth)}</dd></div><div><dt>Access</dt><dd>{selected.accessHours || "Confirm hours with the club"}</dd></div><div><dt>Freeze</dt><dd>{selected.freezeAllowed ? "Available; dates and eligibility reviewed in your account" : "Not included"}</dd></div><div><dt>Minimum term</dt><dd>{selected.contractLength > 0 ? `${selected.contractLength} months` : "No minimum term published"}</dd></div></dl>
        <p className="sf-muted">Annual payment does not make the full year’s class credits available at once. Bookings use the allowance for the session’s service month.</p>
        {(selected.guestPasses > 0 || selected.personalTrainingSessions > 0) && <p className="sf-notice mt-4">Guest and included personal training benefits require arrangements with the club. Online bookings use separately recorded training packages.</p>}
        <div className="sf-notice mt-6"><strong>Before your first visit</strong><p>After checkout, review participation documents and any club requirements in your account. Your membership and class bookings have separate confirmations.</p><Link href="/policies" className="sf-link">Read club policies →</Link></div>
      </section>
      <aside className="sf-panel sf-join-summary"><h2 className="text-2xl font-semibold">{user ? "Continue with your plan" : "Your account"}</h2>
        {checkoutError && <div role="alert" className="sf-status-error p-4 mt-4">{checkoutError}<p className="mt-2">Your selected plan and billing cycle are saved below. If you already submitted payment, check your membership before trying again.</p></div>}
        {user ? <><p className="sf-muted my-4 break-all">Signed in as {user.email}</p>{existing ? <div className="sf-notice"><h3>You already have a membership</h3><p>Manage it from your account. The club can help with a plan change.</p><Link href="/account/membership" className="sf-btn-primary">Manage membership</Link></div> : !available ? <div className="sf-notice"><h3>Contact the club to join</h3><p>Online checkout is unavailable for this plan’s {cycle} billing in {currency}.</p><Link href="/contact" className="sf-btn-primary">Ask about this plan</Link></div> : <form action={checkoutReviewedPlan} className="space-y-5"><input type="hidden" name="tierId" value={selected.id} /><input type="hidden" name="billingCycle" value={cycle} />{safeReturnTo && <input type="hidden" name="returnTo" value={safeReturnTo} />}<p><strong>{selected.name} · {cycle}</strong><br />{formatMajorUnits(cycle === "annual" ? selected.annualPrice : selected.monthlyPrice, currency)} {currency} per {cycle === "annual" ? "year" : "month"}</p><SubmitButton pendingLabel="Opening secure checkout…" className="sf-btn-primary w-full">Continue to secure checkout →</SubmitButton><p className="sf-muted text-sm">Review the final payment details in Stripe. Your membership is confirmed after payment verification.</p></form>}</> : <div className="mt-5">{(!available || process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED !== "true") && <div className="sf-notice mb-5"><p>{!available ? "Online checkout is unavailable for this selection. " : ""}{process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED !== "true" ? "Public account creation is disabled. Existing members can sign in below." : "Creating an account does not activate a membership."}</p><Link href="/contact" className="sf-link">Ask the club about joining →</Link></div>}<LoginPage redirectTo={joinPath(selected.id, safeReturnTo, cycle)} allowSignup={process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true"} /></div>}
      </aside>
    </div>}
  </div></div>;
}
