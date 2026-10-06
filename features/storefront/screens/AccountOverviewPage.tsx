import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookings } from "@/features/storefront/lib/data/bookings";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { chronologicalBookings } from "@/features/storefront/lib/discovery";
import { refreshMyMembership } from "@/features/platform/operations/actions";

export default async function AccountOverviewPage() {
  const user = await getUser();
  if (!user?.organization?.id) notFound();
  const [bookings, config, refreshed] = await Promise.all([getUpcomingBookings(user.id, user.organization.id), getStorefrontConfig(), refreshMyMembership()]);
  const upcoming = chronologicalBookings(bookings);
  const confirmed = upcoming.filter((item: any) => item.status === "confirmed");
  const waiting = upcoming.filter((item: any) => item.status === "waitlist");
  const next: any = confirmed[0];
  const membership = refreshed.membership || user.membership;
  const zone = config?.timezone || "UTC";
  const agreement = membership?.agreementSnapshot;
  return <div className="sf-account-overview space-y-8">
    <header><p className="sf-eyebrow">Your club, at a glance</p><h1 className="sf-display mt-3">Good to see you, {user.name?.split(" ")[0] || "Member"}.</h1><p className="sf-muted mt-3">Your next session and everything you need for your visit.</p></header>
    <div className="sf-account-grid"><section className="sf-next-session"><p className="sf-eyebrow">Your next confirmed session</p>{next ? <><h2>{next.classInstance?.classSchedule?.name || "Class"}</h2><p className="sf-next-date">{formatOccurrenceDate(next.classInstance.date, zone)}<br />{formatOccurrenceTime(next.classInstance.date, zone)} · {zone}</p><p>{next.classInstance?.instructor?.user?.name || "Coach not published"}</p><p>{next.classInstance?.location?.name || "Confirm your session location with the club"}</p><div className="sf-actions"><Link href="/member/check-in-code" className="sf-btn-primary">Open check-in code</Link><Link href="/account/bookings" className="sf-btn-secondary">Manage booking</Link></div></> : <><h2>Your next session starts here.</h2><p>You have no upcoming confirmed class bookings. Find a time that fits your week.</p><Link href="/schedule" className="sf-btn-primary mt-6">Explore the timetable →</Link></>}
      {waiting.length > 0 && <p className="sf-notice mt-6">You’re on {waiting.length} waitlist{waiting.length === 1 ? "" : "s"}. A place is confirmed only when your booking status changes. <Link href="/account/bookings?view=waitlist" className="sf-link">Check waitlists →</Link></p>}
    </section><section className="sf-panel"><div className="sf-section-heading"><h2>Your membership</h2><span className="sf-badge">{membership?.status || "No plan"}</span></div><h3 className="text-2xl font-semibold mt-4">{agreement?.tierName || membership?.tier?.name || "Find your membership"}</h3>{refreshed.error ? <p role="status" className="sf-notice mt-4">Your current class balance could not be refreshed. Check your membership or ask the club before relying on a previous balance.</p> : membership ? <dl className="sf-facts"><div><dt>Current class allowance</dt><dd>{(agreement?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth) === -1 ? "Unlimited" : `${membership.classCreditsRemaining ?? 0} credits remaining`}</dd></div><div><dt>{membership.autoRenew ? "Next billing" : "Access through"}</dt><dd>{membership.nextBillingDate ? formatOccurrenceDate(membership.nextBillingDate, zone) : "Contact the club"}</dd></div></dl> : <p className="sf-muted my-4">Compare access, class allowances and payment options before you join.</p>}<Link className="sf-btn-secondary w-full mt-4" href={membership ? "/account/membership" : "/memberships"}>{membership ? "Manage membership" : "Compare plans"}</Link><p className="sf-muted text-sm mt-4">Eligibility and credits are checked for the date of each session.</p></section></div>
    <section className="sf-quick-grid" aria-label="Prepare for your visit">{[["/account/participation", "Participation documents", "Review required documents and your consent."], ["/account/training", "Personal training", "Your packages, appointments and coaching work."], ["/account/profile", "Your details", "Keep contact and emergency details up to date."]].map(([href, title, detail]) => <Link className="sf-quick-card" key={href} href={href}><h2>{title} <span aria-hidden>↗</span></h2><p>{detail}</p></Link>)}</section>
    {user.role?.isInstructor && <Link href="/account/instructor" className="sf-btn-secondary">Open your instructor workspace →</Link>}
  </div>;
}
