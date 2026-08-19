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
  searchParams?: Promise<{ notice?: string; error?: string }>;
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
  const location = config?.address || config?.locationName || "Main studio";

  return (
    <div className="space-y-10">
      <header>
        <h1 className="sf-display text-[var(--text-display-s)]">My bookings</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Upcoming sessions and historical class activity.</p>
      </header>

      {resolved?.notice ? (
        <div className="border border-emerald-700/25 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">{resolved.notice}</div>
      ) : null}
      {resolved?.error ? (
        <div className="border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-800">{resolved.error}</div>
      ) : null}

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">Upcoming ({upcoming.length})</h2>
          <Link href="/schedule" className="text-sm font-medium text-[var(--color-accent)] hover:underline">Browse schedule</Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-16 text-center text-sm text-[var(--color-ink-muted)]">No upcoming classes booked.</div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((booking: any) => (
              <BookingRow key={booking.id} booking={booking} canCancel timeZone={timeZone} location={location} />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-5 text-2xl font-semibold">Past classes ({history.length})</h2>
          <div className="space-y-4 opacity-80">
            {history.slice(0, 10).map((booking: any) => (
              <BookingRow key={booking.id} booking={booking} timeZone={timeZone} location={location} />
            ))}
          </div>
        </section>
      )}
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
      ? "border-emerald-700/25 bg-emerald-50 text-emerald-800"
      : booking.status === "cancelled"
        ? "border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-ink-muted)]"
        : "border-amber-700/25 bg-amber-50 text-amber-800";

  return (
    <article className="grid gap-5 border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="sf-eyebrow">Class booking</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{schedule?.name ?? "Class"}</h3>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {date ? `${formatOccurrenceDate(date, timeZone)} · ${formatOccurrenceTime(date, timeZone)}` : "Date unavailable"}
          {instructorName ? ` · ${instructorName}` : ""}
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{location}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <span className={`border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${stateClass}`}>
          {booking.status}
        </span>
        {canCancel && booking.status !== "cancelled" ? (
          <CancelBookingForm bookingId={booking.id} />
        ) : null}
      </div>
    </article>
  );
}
