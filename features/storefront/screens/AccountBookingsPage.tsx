import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookingPage, getBookingHistory } from "@/features/storefront/lib/data/bookings";
import { CancelBookingForm } from "@/features/storefront/modules/account/components/cancel-booking-form";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { clubDateParts } from "@/features/storefront/lib/presentation";
import { Banner, EmptyState } from "@/features/storefront/modules/common/ui";
import { contactPath } from "@/features/storefront/lib/contact-config";

const BOOKING_CONTACT = contactPath("booking", "/account/bookings");

export default async function AccountBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string; view?: string; page?: string }>;
}) {
  const user = await getUser();
  if (!user) notFound();

  const organizationId = user.organization?.id;
  if (!organizationId) notFound();

  const resolved = searchParams ? await searchParams : undefined;
  const view = resolved?.view === "history" ? "history" : resolved?.view === "waitlist" ? "waitlist" : "upcoming";
  const page = Number(resolved?.page) || 1;
  // Each tab pages on the server in session-date order; the other tabs are read only for their totals.
  const [confirmed, waitlist, history, config] = await Promise.all([
    getUpcomingBookingPage("confirmed", view === "upcoming" ? page : 1, view === "upcoming" ? {} : { pageSize: 1 }),
    getUpcomingBookingPage("waitlist", view === "waitlist" ? page : 1, view === "waitlist" ? {} : { pageSize: 1 }),
    getBookingHistory(user.id, organizationId, view === "history" ? page : 1),
    getStorefrontConfig(),
  ]);
  const timeZone = config?.timezone || "UTC";
  const current = view === "history" ? history : view === "waitlist" ? waitlist : confirmed;
  const rows = current.items;

  const counts = {
    upcoming: confirmed.total,
    waitlist: waitlist.total,
    history: history.total,
  };

  return (
    <>
      <div className="sf-row" data-between>
        <h1 className="sf-h2">Bookings</h1>
        <Link href="/schedule" className="sf-btn" data-variant="accent" data-size="sm">Book a class</Link>
      </div>

      {resolved?.notice ? <Banner tone="ok">{resolved.notice}</Banner> : null}
      {resolved?.error ? <Banner tone="bad" action={<Link href={BOOKING_CONTACT} className="sf-link">Contact the club</Link>}>{resolved.error}</Banner> : null}

      <section className="sf-stack" aria-label="Bookings">
        <div className="sf-row" data-between>
          <nav className="sf-seg" aria-label="Booking views">
            {([["upcoming", "Confirmed"], ["waitlist", "Waitlists"], ["history", "History"]] as const).map(([value, label]) => (
              <Link key={value} href={`/account/bookings?view=${value}`} aria-current={view === value ? "page" : undefined} scroll={false}>
                {label}<span className="sf-count">{counts[value]}</span>
              </Link>
            ))}
          </nav>
          <span className="sf-meta">Times in {timeZone}</span>
        </div>
        {rows.length ? (
          <div className="sf-bookings">{rows.map((booking: any) => <BookingRow key={booking.id} booking={booking} canCancel={view !== "history"} timeZone={timeZone} />)}</div>
        ) : (
          <EmptyState
            headingLevel={2}
            icon={<CalendarPlus aria-hidden="true" />}
            title={view === "history" ? "No past bookings" : view === "waitlist" ? "No waitlists" : "No upcoming bookings"}
            action={<Link href="/schedule" className="sf-btn" data-variant="secondary" data-size="sm">Schedule</Link>}
          />
        )}
        {current.pages > 1 ? (
          <nav className="sf-row" data-between aria-label={view === "history" ? "Booking history pages" : "Booking pages"}>
            {current.page > 1 ? <Link className="sf-link" href={`/account/bookings?view=${view}&page=${current.page - 1}`}>{view === "history" ? "Newer" : "Sooner"}</Link> : <span />}
            <span className="sf-meta">Page {current.page} of {current.pages}</span>
            {current.page < current.pages ? <Link className="sf-link" href={`/account/bookings?view=${view}&page=${current.page + 1}`}>{view === "history" ? "Older" : "Later"}</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function bookingState(status: string, position?: number | null) {
  if (status === "confirmed") return { tone: "ok", label: "Confirmed" };
  if (status === "waitlist") return { tone: "low", label: position ? `Waitlist · #${position}` : "Waitlist" };
  if (status === "cancelled") return { tone: "neutral", label: "Cancelled" };
  const text = status.replace(/[-_]+/g, " ");
  return { tone: "neutral", label: text.charAt(0).toUpperCase() + text.slice(1) };
}

function BookingRow({
  booking,
  canCancel = false,
  timeZone,
}: {
  booking: any;
  canCancel?: boolean;
  timeZone: string;
}) {
  // What was booked comes from the reservation snapshot. The session itself can be moved by the
  // club, so the date, coach and location shown are the session's actual ones, and any change
  // made after booking is called out next to what was booked.
  const booked = booking.serviceSnapshot?.version ? booking.serviceSnapshot : null;
  const instance = booking.classInstance;
  const schedule = instance?.classSchedule;
  const date = instance?.date ?? booked?.startsAt;
  const instructorName = instance?.instructor?.displayName ?? schedule?.instructor?.displayName ?? (instance ? null : booked?.instructorName);
  const locationName = instance?.location?.name ?? schedule?.location?.name ?? (instance ? null : booked?.locationName);
  const bookedAt = booking.bookedAt ? new Date(booking.bookedAt).getTime() : 0;
  const changes = (Array.isArray(instance?.amendments) ? instance.amendments : [])
    .filter((entry: any) => entry?.at && new Date(entry.at).getTime() > bookedAt && entry.changed?.length);
  const changed = [...new Set(changes.flatMap((entry: any) => entry.changed as string[]))] as string[];
  const lastChange = changes.map((entry: any) => entry.at as string).sort().at(-1);
  const parts = clubDateParts(date, timeZone);
  const state = bookingState(booking.status, booking.waitlistPosition);
  const name = booked?.className ?? schedule?.name ?? "Class";
  const renamed = booked?.className && schedule?.name && schedule.name !== booked.className ? schedule.name : null;
  const credit = creditLine(booked);

  return (
    <article className="sf-booking" data-muted={booking.status === "cancelled" || !canCancel || undefined}>
      <div className="sf-datebox" aria-hidden="true">
        {parts ? <><span>{parts.weekday}</span><strong>{parts.day}</strong><span>{parts.month}</span></> : <strong>–</strong>}
      </div>
      <div className="sf-booking-body">
        <div className="sf-titleline">
          <h3>{name}</h3>
          <span className="sf-state" data-tone={state.tone}>{state.label}</span>
        </div>
        {renamed ? <p className="sf-meta">Now listed as {renamed}</p> : null}
        <p>
          {date ? `${formatOccurrenceDate(date, timeZone)} · ${formatOccurrenceTime(date, timeZone)}` : "Date unavailable"}
          {instructorName ? ` · ${instructorName}` : ""}
        </p>
        {locationName ? <p>{locationName}</p> : null}
        {credit ? <p className="sf-meta">{credit}</p> : null}
        {!booked ? <p className="sf-meta">Booked before booking details were recorded; shown as the session is scheduled now.</p> : null}
      </div>
      {canCancel && booking.status !== "cancelled" ? (
        <div className="sf-booking-side">
          <CancelBookingForm bookingId={booking.id} sessionName={`${name}${date ? `, ${formatOccurrenceDate(date, timeZone)}, ${formatOccurrenceTime(date, timeZone)}` : ""}`} waitlist={booking.status === "waitlist"} />
        </div>
      ) : null}
      {booking.classInstance?.isCancelled ? (
        <div className="sf-booking-extra">
          <Banner tone="warn" title="Cancelled by the club" action={<Link href={BOOKING_CONTACT} className="sf-link">Contact the club</Link>}>
            This session was cancelled. Your booking is closed and a class credit used for it is returned to your membership.
          </Banner>
        </div>
      ) : changed.length && booked ? (
        <div className="sf-booking-extra">
          <Banner tone="warn" title="Changed by the club" action={<Link href={BOOKING_CONTACT} className="sf-link">Contact the club</Link>}>
            The {listOf(changed)} changed after you booked{lastChange ? ` (last change ${formatOccurrenceDate(lastChange, timeZone)})` : ""}. You booked {booked.className}
            {booked.startsAt ? ` on ${formatOccurrenceDate(booked.startsAt, timeZone)} at ${formatOccurrenceTime(booked.startsAt, timeZone)}` : ""}
            {booked.instructorName ? ` with ${booked.instructorName}` : ""}{booked.locationName ? ` at ${booked.locationName}` : ""}.
          </Banner>
        </div>
      ) : booking.eligibilityReviewReason ? (
        <div className="sf-booking-extra">
          <Banner tone="warn" title="Eligibility under review" action={<Link href={BOOKING_CONTACT} className="sf-link">Contact the club</Link>}>{booking.eligibilityReviewReason}</Banner>
        </div>
      ) : null}
    </article>
  );
}

function listOf(items: string[]) {
  if (items.length < 2) return items[0] ?? "details";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The credit terms this booking was made on, from its snapshot. */
function creditLine(booked: any) {
  const credit = booked?.credit;
  if (credit?.basis === "unlimited") return "Booked on an unlimited membership.";
  if (credit?.basis === "debited_at_booking") return "Used one class credit from your membership allowance; it's returned if you cancel before the class starts.";
  if (credit?.basis === "debited_when_confirmed") return "A class credit is used only if your waitlist place is confirmed.";
  return booked?.creditTerms ? `Credit terms: ${booked.creditTerms}.` : null;
}
