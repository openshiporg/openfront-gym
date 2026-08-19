import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import {
  cancelMembershipAction,
  freezeMembershipAction,
  openBillingPortalAction,
  resumeMembershipAction,
} from "@/features/storefront/lib/actions/membership";

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", options ?? { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: string) {
  if (status === "active") return "border-emerald-700/25 bg-emerald-50 text-emerald-800";
  if (status === "frozen") return "border-amber-700/25 bg-amber-50 text-amber-800";
  return "border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-ink-muted)]";
}

export default async function AccountMembershipPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const user = await getUser();
  if (!user) notFound();

  const resolved = searchParams ? await searchParams : undefined;
  const [tiers, config] = await Promise.all([
    getMembershipTiers(user.organization?.id).catch(() => []),
    getStorefrontConfig(),
  ]);
  const membership = user.membership;
  const currencyCode = config?.currencyCode || user.organization?.defaultCurrency || "USD";
  const hasStripeCustomer = Boolean(user.stripeCustomerId);
  const hasStripeSubscription = Boolean(membership?.stripeSubscriptionId);

  return (
    <div className="space-y-12">
      <header className="max-w-3xl">
        <p className="sf-eyebrow mb-3">Member access</p>
        <h1 className="sf-display text-[var(--text-display-s)]">Membership</h1>
        <p className="mt-4 sf-lead">
          Review your plan, class access, renewal dates, and the billing actions available for this account.
        </p>
      </header>

      {resolved?.success ? (
        <div className="border border-emerald-700/25 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          {resolved.success === "cancelled"
            ? "Renewal cancelled. Your membership remains active through the current paid period."
            : resolved.success === "frozen"
              ? "Membership and provider collection paused immediately."
              : resolved.success === "resumed"
                ? "Membership resumed successfully."
                : resolved.success === "tier-updated"
                  ? "Membership tier updated successfully."
                  : "Membership updated successfully."}
        </div>
      ) : null}

      {resolved?.error ? (
        <div className="border border-red-700/25 bg-red-50 px-5 py-4 text-sm text-red-900">{resolved.error}</div>
      ) : null}

      {membership ? (
        <>
          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-7 sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="sf-eyebrow">Current plan</p>
                <h2 className="sf-display mt-3 text-4xl">{membership.tier?.name ?? "Membership"}</h2>
                <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                  {formatMajorUnits(membership.tier?.monthlyPrice ?? 0, currencyCode)} per month
                </p>
              </div>
              <span className={`w-fit border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClass(membership.status)}`}>
                {membership.status}
              </span>
            </div>

            <dl className="mt-9 grid gap-px border border-[var(--color-rule)] bg-[var(--color-rule)] sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-[var(--color-surface)] p-5">
                <dt className="sf-label">Class access</dt>
                <dd className="mt-2 text-xl font-semibold">
                  {membership.tier?.classCreditsPerMonth === -1
                    ? "Unlimited"
                    : `${membership.classCreditsRemaining ?? 0} remaining`}
                </dd>
              </div>
              <div className="bg-[var(--color-surface)] p-5">
                <dt className="sf-label">Member since</dt>
                <dd className="mt-2 text-xl font-semibold">
                  {formatDate(membership.startDate, { month: "short", year: "numeric" })}
                </dd>
              </div>
              <div className="bg-[var(--color-surface)] p-5">
                <dt className="sf-label">{membership.autoRenew ? "Next billing" : "Access through"}</dt>
                <dd className="mt-2 text-xl font-semibold">{formatDate(membership.nextBillingDate)}</dd>
              </div>
              <div className="bg-[var(--color-surface)] p-5">
                <dt className="sf-label">Cancellation date</dt>
                <dd className="mt-2 text-xl font-semibold">{formatDate(membership.cancelledAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-7">
              <p className="sf-eyebrow">Billing controls</p>
              <h2 className="mt-3 text-2xl font-semibold">Payment methods and invoices</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-muted)]">
                Stripe-hosted billing is available when this account is linked to a real customer record.
              </p>
              {hasStripeCustomer ? (
                <form action={openBillingPortalAction} className="mt-6">
                  <button type="submit" className="sf-btn-primary w-full">Open billing portal</button>
                </form>
              ) : (
                <div className="mt-6 border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-4 py-4 text-sm text-[var(--color-ink-muted)]">
                  Online billing is not connected for this membership. Contact the front desk for payment-method or invoice changes.
                </div>
              )}
            </article>

            <article className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-7">
              <p className="sf-eyebrow">Membership lifecycle</p>
              <h2 className="mt-3 text-2xl font-semibold">Freeze or resume</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-muted)]">
                Eligible plans can pause access and Stripe collection immediately until the selected end date.
              </p>

              {membership.status === "frozen" ? (
                <div className="mt-6 space-y-4">
                  <div className="border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-4 py-4 text-sm text-[var(--color-ink-muted)]">
                    Freeze window: {formatDate(membership.freezeStartDate)} to {formatDate(membership.freezeEndDate)}.
                    Provider collection resumes at the freeze end unless you resume earlier.
                  </div>
                  <form action={resumeMembershipAction}>
                    <button type="submit" className="sf-btn-secondary w-full" disabled={!hasStripeSubscription}>
                      Resume membership
                    </button>
                  </form>
                </div>
              ) : (
                <form action={freezeMembershipAction} className="mt-6 space-y-4">
                  <label className="block space-y-2 text-sm font-medium">
                    Freeze through
                    <input
                      name="endDate"
                      type="date"
                      className="h-12 w-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
                      required
                    />
                    <span className="block text-xs font-normal text-[var(--color-ink-muted)]">The freeze starts as soon as you submit.</span>
                  </label>
                  <button
                    type="submit"
                    className="sf-btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasStripeSubscription || !membership.autoRenew || !membership.tier?.freezeAllowed || membership.status !== "active"}
                  >
                    {!hasStripeSubscription
                      ? "Provider billing required to freeze"
                      : !membership.autoRenew
                        ? "Renewal is already ending"
                      : !membership.tier?.freezeAllowed
                        ? "Freeze not allowed on this tier"
                        : membership.status !== "active"
                          ? "Only active memberships can be frozen"
                          : "Freeze membership"}
                  </button>
                </form>
              )}
            </article>
          </section>

          <section className="border border-red-700/20 bg-red-50/50 p-7">
            <p className="sf-eyebrow text-red-800">Cancellation</p>
            <h2 className="mt-3 text-2xl font-semibold text-red-950">End renewal after this paid period</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-red-900/75">
              Stripe will stop renewal at the end of the current paid period. Access remains active through the date shown above; this does not issue a refund.
            </p>
            <form action={cancelMembershipAction} className="mt-6 space-y-4">
              <textarea
                name="reason"
                placeholder="Why are you cancelling?"
                maxLength={500}
                className="min-h-28 w-full border border-red-900/20 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-800/20"
              />
              <label className="flex items-start gap-3 text-sm text-red-950">
                <input type="checkbox" name="confirmEndOfTerm" value="yes" required className="mt-1" />
                <span>I understand renewal will stop and access will end after the current paid period.</span>
              </label>
              <button
                type="submit"
                className="border border-red-800 px-5 py-3 text-sm font-semibold text-red-900 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!hasStripeSubscription || membership.status === "cancelled" || !membership.autoRenew}
              >
                {!hasStripeSubscription
                  ? "Contact the front desk to cancel"
                  : membership.status === "cancelled"
                    ? "Membership already ended"
                    : !membership.autoRenew
                      ? "Renewal already cancelled"
                      : "End renewal after paid period"}
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">No membership is linked to this account.</p>
          <Link href="/memberships" className="sf-btn-primary mt-6 inline-flex">View plans</Link>
        </section>
      )}

      {tiers.length > 0 ? (
        <section>
          <div className="mb-6">
            <p className="sf-eyebrow mb-2">Access levels</p>
            <h2 className="sf-display text-3xl">Available plans</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {tiers.map((tier) => {
              const isCurrent = membership?.tier?.id === tier.id;
              return (
                <article
                  key={tier.id}
                  className={`border bg-[var(--color-surface)] p-6 ${
                    isCurrent ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]" : "border-[var(--color-rule)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-semibold">{tier.name}</h3>
                    {isCurrent ? <span className="sf-tag border-[var(--color-accent)] text-[var(--color-accent)]">Current</span> : null}
                  </div>
                  <p className="sf-display mt-5 text-4xl">{formatMajorUnits(tier.monthlyPrice ?? 0, currencyCode)}</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">per month</p>
                  <ul className="mt-6 space-y-2 text-sm text-[var(--color-ink-muted)]">
                    <li>{tier.classCreditsPerMonth === -1 ? "Unlimited classes" : `${tier.classCreditsPerMonth} classes per month`}</li>
                    <li>Online class booking</li>
                    <li>Member check-in code</li>
                  </ul>
                  {!isCurrent && membership ? (
                    <p className="mt-6 border-t border-[var(--color-rule)] pt-4 text-sm text-[var(--color-ink-muted)]">
                      Contact the front desk to change plans. Operator review prevents accidental proration and class-credit resets.
                    </p>
                  ) : !membership ? (
                    <Link
                      href={`/join?tier=${tier.id}`}
                      className="sf-btn-secondary mt-6 inline-flex w-full"
                    >
                      Review plan
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
