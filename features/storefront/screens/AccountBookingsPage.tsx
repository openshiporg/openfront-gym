import { chronologicalBookings } from "@/features/storefront/lib/discovery";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookings, getBookingHistory } from "@/features/storefront/lib/data/bookings";
import { CancelBookingForm } from "@/features/storefront/modules/account/components/cancel-booking-form";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";

export default async function AccountBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string; view?: string }>;
}) {
  const user = await getUser();
  if (!user) notFound();

  const organizationId = user.organization?.id;
  if (!organizationId) notFound();

  const resolved = searchParams ? await searchParams : undefined;
  const [upcoming, history, config] = await Promise.all([
    getUpcomingBookings(user.id, organizationId),
    getBookingHistory(user.id, organizationId),
    getStorefrontConfig(),
  ]);
  const timeZone = config?.timezone || "UTC";
  const location = "Session location not published · confirm with the club";
  const view = resolved?.view === "history" ? "history" : resolved?.view === "waitlist" ? "waitlist" : "upcoming";
  const rows = view === "history" ? history : chronologicalBookings(upcoming).filter((booking: any) => booking.status === (view === "waitlist" ? "waitlist" : "confirmed"));

  return (
    <div className="space-y-10">
      <header>
        <h1 className="sf-display text-[var(--text-display-s)]">My bookings</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Upcoming sessions and historical class activity.</p>
      </header>

      {resolved?.notice ? (
        <div role="status" className="sf-status-success px-5 py-4 text-sm">{resolved.notice}</div>
      ) : null}
      {resolved?.error ? (
        <div role="alert" className="sf-status-error px-5 py-4 text-sm">{resolved.error}</div>
      ) : null}

      <nav className="sf-segmented" aria-label="Booking views">{[["upcoming", "Confirmed"], ["waitlist", "Waitlists"], ["history", "History"]].map(([value, label]) => <Link key={value} href={`/account/bookings?view=${value}`} aria-current={view === value ? "page" : undefined}>{label}</Link>)}</nav>
      <section><div className="sf-section-heading"><h2>{view === "history" ? "Recent activity" : view === "waitlist" ? "Your waitlists" : "Upcoming confirmed sessions"}</h2><Link href="/schedule" className="sf-link">Find a session →</Link></div><p className="sf-muted mb-5">All times in {timeZone}. {view === "history" ? "Showing up to 20 recent records." : view === "waitlist" ? "Waitlist entries are not confirmed spaces. Check here for promotion and eligibility updates." : "Your sessions are ordered by start time."}</p>
      {rows.length ? <div className="space-y-4">{rows.map((booking: any) => <BookingRow key={booking.id} booking={booking} canCancel={view !== "history"} timeZone={timeZone} location={location} />)}</div> : <div className="sf-empty"><h3>{view === "history" ? "No recent booking activity" : view === "waitlist" ? "You’re not on any upcoming waitlists" : "Your next class is waiting"}</h3><p>Explore the timetable for a session that fits your day.</p><Link href="/schedule" className="sf-btn-primary">Explore sessions</Link></div>}
      {upcoming.length >= 100 && view !== "history" && <p className="sf-muted mt-4">Showing up to 100 upcoming bookings. Contact the club for additional records.</p>}</section>
    </div>
  );
}

function BookingRow({
  booking,
  canCancel = false,
  timeZone,
  location,
}: {
  booking: any;
  canCancel?: boolean;
  timeZone: string;
  location: string;
}) {
  const schedule = booking.classInstance?.classSchedule;
  const date = booking.classInstance?.date;
  const instructorName = booking.classInstance?.instructor?.user?.name ?? schedule?.instructor?.user?.name;
  const stateClass =
    booking.status === "confirmed"
      ? "sf-status-success"
      : booking.status === "cancelled"
        ? "border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-ink-muted)]"
        : "sf-status-warning";

  return (
    <article className="grid gap-5 border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="sf-eyebrow">Class booking</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{schedule?.name ?? "Class"}</h3>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {date ? `${formatOccurrenceDate(date, timeZone)} · ${formatOccurrenceTime(date, timeZone)}` : "Date unavailable"}
          {instructorName ? ` · ${instructorName}` : ""}
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{booking.classInstance?.location?.name || location}</p>
        {booking.eligibilityReviewReason && <p className="sf-notice mt-3">Eligibility needs review: {booking.eligibilityReviewReason}. Contact the club for help with this booking.</p>}
        {booking.classInstance?.cancellationReason && <p className="sf-notice mt-3">Session update: {booking.classInstance.cancellationReason}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <span className={`border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${stateClass}`}>
          {booking.status === "waitlist" ? `Waitlist${booking.waitlistPosition ? ` · position ${booking.waitlistPosition}` : ""}` : booking.status}
        </span>
        {canCancel && booking.status !== "cancelled" ? (
          <CancelBookingForm bookingId={booking.id} sessionName={`${schedule?.name || "Class"}${date ? `, ${formatOccurrenceDate(date, timeZone)}, ${formatOccurrenceTime(date, timeZone)}` : ""}`} waitlist={booking.status === "waitlist"} />
        ) : null}
      </div>
    </article>
  );
}
