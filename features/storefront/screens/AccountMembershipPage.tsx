import { randomUUID } from "node:crypto";
import SubmitButton from "../modules/common/submit-button";
import { creditLabel } from "../lib/discovery";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { formatMinorUnits } from '@/features/platform/lib/currency';
import { refreshMyMembership } from '@/features/platform/operations/actions';
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import {
  cancelMembershipAction,
  freezeMembershipAction,
  openBillingPortalAction,
  resumeMembershipAction,
} from "@/features/storefront/lib/actions/membership";
import { joinPath } from "@/features/storefront/lib/return-path";
import { contactPath } from "@/features/storefront/lib/contact-config";
import { ArrowLink, Banner, EmptyState } from "@/features/storefront/modules/common/ui";
import { membershipTone, statusLabel } from "@/features/storefront/modules/account/templates/account-layout";

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("en-US", options ?? { month: "short", day: "numeric", year: "numeric" });
}

const MEMBERSHIP_CONTACT = contactPath("membership", "/account/membership");

const SUCCESS: Record<string, string> = {
  cancelled: "Renewal ended. Access continues through the current paid period.",
  frozen: "Membership frozen. Billing is paused until the freeze ends.",
  resumed: "Membership resumed.",
  "tier-updated": "Plan updated.",
};

export default async function AccountMembershipPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; retryOp?: string; retryKey?: string }>;
}) {
  const user = await getUser();
  if (!user) notFound();

  const resolved = searchParams ? await searchParams : undefined;
  // After an unconfirmed attempt the same operation reuses its key, so a retry cannot apply it twice.
  const keyFor = (operation: string) =>
    resolved?.retryOp === operation && /^[A-Za-z0-9-]{12,100}$/.test(resolved.retryKey || "") ? resolved.retryKey! : randomUUID();
  const [tiers, config] = await Promise.all([
    getMembershipTiers(user.organization?.id).catch(() => []),
    getStorefrontConfig(),
  ]);
  const refreshed = await refreshMyMembership();
  const currentUser = refreshed.error ? user : await getUser();
  const membership = refreshed.membership ? { ...currentUser?.membership, ...refreshed.membership } : user.membership;
  const timeZone = config?.timezone || "UTC";
  const creditDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
  const agreement = membership?.agreementSnapshot;
  const freezeAllowed = agreement?.freezeAllowed ?? membership?.tier?.freezeAllowed;
  const currencyCode = config?.currencyCode || user.organization?.defaultCurrency || "USD";
  const hasStripeCustomer = Boolean(user.stripeCustomerId);
  const hasStripeSubscription = Boolean(membership?.stripeSubscriptionId);
  const freezeUnavailable = !hasStripeSubscription
    ? "Freezes are arranged by the front desk for this membership."
    : !freezeAllowed
      ? "Not included in this plan."
      : !membership?.autoRenew
        ? "Not available while renewal is ending."
        : membership?.status !== "active"
          ? "Only active memberships can be frozen."
          : null;
  const renewalEnded = membership?.status === "cancelled" || !membership?.autoRenew;

  const allowance = agreement?.classCreditsPerMonth ?? membership?.tier?.classCreditsPerMonth;

  return (
    <>
      <div className="sf-row" data-between>
        <h1 className="sf-h2">Membership</h1>
        <ArrowLink href={MEMBERSHIP_CONTACT} size="sm">Membership questions</ArrowLink>
      </div>

      {refreshed.error ? <Banner tone="warn">Membership details couldn’t be refreshed and may be out of date.</Banner> : null}
      {resolved?.success ? <Banner tone="ok">{SUCCESS[resolved.success] ?? "Membership updated."}</Banner> : null}
      {resolved?.error ? <Banner tone="bad" action={<Link href={MEMBERSHIP_CONTACT} className="sf-link">Contact the club</Link>}>{resolved.error}</Banner> : null}

      {membership ? (
        <>
          <section className="sf-next sf-on-night" aria-labelledby="current-plan">
            <div className="sf-titleline">
              <h2 id="current-plan" className="sf-next-title">{agreement?.tierName || membership.tier?.name || "Membership"}</h2>
              <span className="sf-state" data-tone={membershipTone(membership.status)}>{statusLabel(membership.status)}</span>
            </div>
            <p className="sf-text-2">
              {agreement?.amount !== undefined ? `${formatMinorUnits(agreement.amount, agreement.currencyCode || currencyCode)} / ${membership.billingCycle === 'annual' ? 'year' : 'month'}` : 'Price not recorded on this agreement'}
            </p>
            <dl className="sf-facts" data-plain>
              <div><dt>Classes</dt><dd className="sf-num">{refreshed.error ? "Unavailable" : allowance === -1 ? "Unlimited" : `${membership.classCreditsRemaining ?? 0} left`}</dd></div>
              <div><dt>Member since</dt><dd>{formatDate(membership.startDate, { month: "short", year: "numeric" })}</dd></div>
              <div><dt>{membership.autoRenew ? "Next billing" : "Access through"}</dt><dd>{formatDate(membership.nextBillingDate)}</dd></div>
              {membership.cancelledAt ? <div><dt>Cancelled</dt><dd>{formatDate(membership.cancelledAt)}</dd></div> : null}
              {membership.creditPeriodStart && membership.creditPeriodEnd && !refreshed.error ? (
                <div><dt>Credit period</dt><dd>{creditDate(membership.creditPeriodStart)} – {creditDate(membership.creditPeriodEnd)}</dd></div>
              ) : null}
            </dl>
          </section>

          <section className="sf-card" aria-labelledby="plan-terms">
            <h2 id="plan-terms" className="sf-h3">Accepted terms</h2>
            {agreement ? (
              <dl className="sf-facts" data-plain>
                <div><dt>Classes</dt><dd>{creditLabel(agreement.classCreditsPerMonth)}</dd></div>
                <div><dt>Access hours</dt><dd>{agreement.accessHours || "Not recorded"}</dd></div>
                <div><dt>Freeze</dt><dd>{agreement.freezeAllowed ? "Included" : "Not included"}</dd></div>
              </dl>
            ) : <Banner tone="warn" action={<Link href={MEMBERSHIP_CONTACT} className="sf-link">Contact the club</Link>}>No terms are recorded for this membership. Contact the club to confirm your price and allowance.</Banner>}
          </section>

          <div className="sf-split" style={{ gap: 16 }}>
            <section className="sf-card" aria-labelledby="billing-controls">
              <h2 id="billing-controls" className="sf-h3">Payment and invoices</h2>
              {hasStripeCustomer ? (
                <form action={openBillingPortalAction}>
                  <SubmitButton variant="secondary" block pendingLabel="Opening billing…">Open billing portal</SubmitButton>
                </form>
              ) : (
                <Banner action={<Link href={MEMBERSHIP_CONTACT} className="sf-link">Contact the club</Link>}>Online billing isn’t connected. Contact the front desk for payment changes.</Banner>
              )}
            </section>

            <section className="sf-card" aria-labelledby="freeze-controls">
              <h2 id="freeze-controls" className="sf-h3">{membership.status === "frozen" ? "Frozen" : "Freeze"}</h2>
              {membership.status === "frozen" ? (
                <>
                  <dl className="sf-facts" data-plain>
                    <div><dt>From</dt><dd>{formatDate(membership.freezeStartDate)}</dd></div>
                    <div><dt>Until</dt><dd>{formatDate(membership.freezeEndDate)}</dd></div>
                  </dl>
                  <form action={resumeMembershipAction}>
                    <input type="hidden" name="operationKey" value={keyFor("resume")} />
                    <SubmitButton variant="secondary" block disabled={!hasStripeSubscription} pendingLabel="Resuming…">
                      Resume membership
                    </SubmitButton>
                  </form>
                </>
              ) : freezeUnavailable ? (
                <p className="sf-text-2">{freezeUnavailable}</p>
              ) : (
                <form action={freezeMembershipAction} className="sf-form">
                  <input type="hidden" name="operationKey" value={keyFor("freeze")} />
                  <label className="sf-field">
                    Freeze until
                    <input name="endDate" type="date" required />
                    <small>Starts now and ends at the end of this day.</small>
                  </label>
                  <SubmitButton variant="secondary" block pendingLabel="Freezing…">Freeze membership</SubmitButton>
                </form>
              )}
            </section>
          </div>

          {renewalEnded ? (
            <section className="sf-card" aria-labelledby="end-renewal">
              <div className="sf-titleline">
                <h2 id="end-renewal" className="sf-h3">Renewal</h2>
                <span className="sf-state" data-tone={membership.status === "cancelled" ? "neutral" : "low"}>{membership.status === "cancelled" ? "Ended" : `Ends ${formatDate(membership.nextBillingDate)}`}</span>
              </div>
              {membership.status !== "cancelled" ? (
                hasStripeCustomer ? (
                  <form action={openBillingPortalAction}>
                    <SubmitButton variant="secondary" pendingLabel="Opening billing…">Keep membership in billing portal</SubmitButton>
                  </form>
                ) : (
                  <ArrowLink href={MEMBERSHIP_CONTACT} size="sm">Ask the club to keep your membership</ArrowLink>
                )
              ) : null}
            </section>
          ) : (
            <section className="sf-danger-zone" aria-labelledby="end-renewal">
              <h2 id="end-renewal" className="sf-h3">End renewal</h2>
              <p className="sf-text-2">Renewal stops after the current paid period. Access continues until then. No refund is issued.</p>
              {hasStripeSubscription ? (
                <form action={cancelMembershipAction} className="sf-form">
                  <input type="hidden" name="operationKey" value={keyFor("cancel")} />
                  <label htmlFor="cancel-reason" className="sf-field">Reason (optional)
                    <textarea id="cancel-reason" name="reason" maxLength={500} rows={3} />
                  </label>
                  <label className="sf-check">
                    <input type="checkbox" name="confirmEndOfTerm" value="yes" required />
                    <span>End renewal after the current paid period</span>
                  </label>
                  <div>
                    <SubmitButton variant="danger" pendingLabel="Ending renewal…">End renewal</SubmitButton>
                  </div>
                </form>
              ) : (
                <ArrowLink href={MEMBERSHIP_CONTACT} size="sm">Contact the front desk to cancel</ArrowLink>
              )}
            </section>
          )}
        </>
      ) : (
        <EmptyState headingLevel={2} title="No membership on this account" action={<Link href="/memberships" className="sf-btn" data-variant="accent" data-size="sm">Compare plans</Link>} />
      )}

      {tiers.length > 0 ? (
        <section className="sf-stack" aria-labelledby="available-plans">
          <h2 id="available-plans" className="sf-h3">Plans</h2>
          <div className="sf-plans" data-count={tiers.length >= 3 ? "many" : undefined}>
            {tiers.map((tier) => {
              const isCurrent = membership?.tier?.id === tier.id;
              return (
                <article key={tier.id} className="sf-plan" data-current={isCurrent || undefined}>
                  <div className="sf-titleline">
                    <h3 className="sf-h3">{tier.name}</h3>
                    {isCurrent ? <span className="sf-state" data-tone="accent">Current plan</span> : null}
                  </div>
                  <p className="sf-price"><strong>{formatMajorUnits(tier.monthlyPrice ?? 0, currencyCode)}</strong><span>/ month</span></p>
                  <p className="sf-meta">{creditLabel(tier.classCreditsPerMonth)}</p>
                  {!isCurrent && membership ? (
                    <p className="sf-meta">Plan changes are made by the front desk. <Link href={MEMBERSHIP_CONTACT} className="sf-link" data-size="sm">Request a change</Link></p>
                  ) : !membership ? (
                    <Link href={joinPath(tier.id)} className="sf-btn" data-variant="secondary" data-block>Choose {tier.name}</Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
