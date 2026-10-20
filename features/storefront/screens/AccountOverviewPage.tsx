import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Dumbbell, FileCheck2, GraduationCap, QrCode, UserRound } from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookingPage } from "@/features/storefront/lib/data/bookings";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { refreshMyMembership } from "@/features/platform/operations/actions";
import { Banner } from "@/features/storefront/modules/common/ui";
import { membershipTone, statusLabel } from "@/features/storefront/modules/account/templates/account-layout";

export default async function AccountOverviewPage() {
  const user = await getUser();
  if (!user?.organization?.id) notFound();
  // The soonest confirmed session, and the waitlist total, from the date-ordered server pages.
  const [confirmedPage, waitlistPage, config, refreshed] = await Promise.all([
    getUpcomingBookingPage("confirmed", 1, { pageSize: 1 }),
    getUpcomingBookingPage("waitlist", 1, { pageSize: 1 }),
    getStorefrontConfig(),
    refreshMyMembership(),
  ]);
  const waitingCount = waitlistPage.total;
  const next: any = confirmedPage.items[0];
  const nextCoach = next?.classInstance?.instructor?.displayName ?? next?.classInstance?.classSchedule?.instructor?.displayName ?? null;
  const nextLocation = next?.classInstance?.location?.name ?? next?.classInstance?.classSchedule?.location?.name ?? null;
  const membership = refreshed.membership || user.membership;
  const zone = config?.timezone || "UTC";
  const agreement = membership?.agreementSnapshot;
  const allowance = agreement?.classCreditsPerMonth ?? membership?.tier?.classCreditsPerMonth;
  const remaining = membership?.classCreditsRemaining ?? 0;
  const tiles = [
    { href: "/member/check-in-code", label: "Check-in code", icon: QrCode },
    { href: "/account/participation", label: "Participation and privacy", icon: FileCheck2 },
    { href: "/account/training", label: "Personal training", icon: Dumbbell },
    { href: "/account/profile", label: "Profile", icon: UserRound },
    ...(user.role?.isInstructor ? [{ href: "/account/instructor", label: "Coach workspace", icon: GraduationCap }] : []),
  ];

  return <>
    <h1 className="sr-only">Account</h1>
    <div className="sf-overview">
      <section className="sf-next sf-on-night sf-rise" aria-labelledby="next-session">
        <h2 id="next-session" className="sf-label">Next session</h2>
        {next ? <>
          <p className="sf-next-title">{next.classInstance?.classSchedule?.name || "Class"}</p>
          <div className="sf-next-when">
            <time dateTime={next.classInstance.date}>{formatOccurrenceTime(next.classInstance.date, zone)}</time>
            <span>{formatOccurrenceDate(next.classInstance.date, zone)}</span>
          </div>
          <dl className="sf-facts" data-plain>
            <div><dt>Coach</dt><dd>{nextCoach || "Not published"}</dd></div>
            {nextLocation ? <div><dt>Location</dt><dd>{nextLocation}</dd></div> : null}
          </dl>
          <div className="sf-actions">
            <Link href="/member/check-in-code" className="sf-btn" data-variant="light"><QrCode aria-hidden="true" />Check-in code</Link>
            <Link href="/account/bookings" className="sf-btn" data-variant="outline-night">Bookings</Link>
          </div>
        </> : <>
          <p className="sf-next-title">No upcoming bookings</p>
          <div className="sf-actions"><Link href="/schedule" className="sf-btn" data-variant="accent">Book a class</Link></div>
        </>}
        {waitingCount > 0 ? (
          <div><Link className="sf-link" data-size="sm" href="/account/bookings?view=waitlist">On {waitingCount} {waitingCount === 1 ? "waitlist" : "waitlists"}<ArrowUpRight aria-hidden="true" /></Link></div>
        ) : null}
      </section>

      <section className="sf-card" aria-labelledby="membership-summary">
        <div className="sf-titleline">
          <h2 id="membership-summary" className="sf-h3">Membership</h2>
          <span className="sf-state" data-tone={membershipTone(membership?.status)}>{statusLabel(membership?.status)}</span>
        </div>
        <p className="sf-h2">{agreement?.tierName || membership?.tier?.name || "No plan"}</p>
        {refreshed.error ? (
          <Banner tone="warn">Your class balance couldn’t be refreshed.</Banner>
        ) : membership ? (
          <dl className="sf-facts">
            <div><dt>Classes</dt><dd className="sf-num">{allowance === -1 ? "Unlimited" : typeof allowance === "number" && allowance > 0 ? `${remaining} of ${allowance} left` : `${remaining} left`}</dd></div>
            <div><dt>{membership.autoRenew ? "Next billing" : "Access through"}</dt><dd>{membership.nextBillingDate ? formatOccurrenceDate(membership.nextBillingDate, zone) : "Not set"}</dd></div>
          </dl>
        ) : null}
        <Link className="sf-btn" data-variant={membership ? "secondary" : "accent"} data-block href={membership ? "/account/membership" : "/memberships"}>{membership ? "Manage membership" : "Compare plans"}</Link>
      </section>
    </div>

    <nav className="sf-tiles" data-cols="4" aria-label="Account shortcuts">
      {tiles.map(({ href, label, icon: Icon }) => (
        <Link className="sf-tile" key={href} href={href}>
          <Icon aria-hidden="true" />
          <strong>{label}<ArrowUpRight aria-hidden="true" /></strong>
        </Link>
      ))}
    </nav>
  </>;
}
