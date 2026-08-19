import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookings } from "@/features/storefront/lib/data/bookings";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";

export default async function AccountOverviewPage() {
  const user = await getUser();
  if (!user) notFound();

  const organizationId = user.organization?.id;
  if (!organizationId) notFound();
  const firstName = user.name?.split(" ")[0] ?? "Member";
  const membership = user.membership;
  const [upcomingBookings, config] = await Promise.all([
    getUpcomingBookings(user.id, organizationId),
    getStorefrontConfig(),
  ]);
  const timeZone = config?.timezone || "UTC";
  const location = config?.address || config?.locationName || "Main studio";

  return (
    <div className="space-y-12">
      <header>
        <h1 className="sf-display text-[var(--text-display-s)]">
          Welcome back, <span className="text-[var(--color-accent)]">{firstName}</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-ink-muted)]">
          Your bookings, membership, and profile in one place.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-8 lg:col-span-8">
          <div className="flex items-start justify-between gap-4">
            <p className="sf-label">Current membership</p>
            <span
              className={`border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                membership?.status === "active"
                  ? "border-emerald-700/25 bg-emerald-50 text-emerald-800"
                  : membership?.status === "frozen"
                    ? "border-amber-700/25 bg-amber-50 text-amber-800"
                    : "border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-ink-muted)]"
              }`}
            >
              {membership?.status ?? "No active plan"}
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-semibold">{membership?.tier?.name ?? "Membership required"}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {membership
              ? "Your plan controls facility access, class credits, renewal timing, and billing."
              : "Activate a membership to unlock booking and full facility access."}
          </p>

          <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-[var(--color-rule)] pt-8 sm:grid-cols-3">
            <div>
              <dt className="sf-label">Credits</dt>
              <dd className="mt-2 text-2xl font-medium">
                {membership?.tier?.classCreditsPerMonth === -1 ? "Unlimited" : membership?.classCreditsRemaining ?? 0}
              </dd>
            </div>
            <div>
              <dt className="sf-label">Next billing</dt>
              <dd className="mt-2 text-2xl font-medium">
                {membership?.nextBillingDate ? new Date(membership.nextBillingDate).toLocaleDateString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="sf-label">Upcoming</dt>
              <dd className="mt-2 text-2xl font-medium">{upcomingBookings.length}</dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-3 lg:col-span-4">
          <Link href="/schedule" className="sf-btn-primary px-6 py-5 text-center">
            Book next class
          </Link>
          <Link href="/account/membership" className="sf-btn-outline px-6 py-5 text-center">
            Manage membership
          </Link>
          {membership?.status === "active" ? (
            <Link href="/member/check-in-code" className="sf-btn-outline px-6 py-5 text-center">
              Open check-in QR code
            </Link>
          ) : null}
          <Link href="/account/profile" className="sf-btn-outline px-6 py-5 text-center">
            Update profile
          </Link>
          {user.role?.isInstructor ? (
            <Link
              href="/account/instructor"
              className="border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-6 py-5 text-center text-sm font-medium text-[var(--color-accent)]"
            >
              Instructor console
            </Link>
          ) : null}
        </section>
      </div>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">Upcoming bookings</h2>
          <Link href="/account/bookings" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
            View all
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-16 text-sm text-[var(--color-ink-muted)]">
            No upcoming classes booked yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
            {upcomingBookings.slice(0, 3).map((booking: any) => (
              <div key={booking.id} className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xl font-semibold">{booking.classInstance?.classSchedule?.name ?? "Class"}</p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    {booking.classInstance?.date
                      ? `${formatOccurrenceDate(booking.classInstance.date, timeZone)} · ${formatOccurrenceTime(booking.classInstance.date, timeZone)}`
                      : "Date unavailable"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{location}</p>
                </div>
                <div className="text-sm font-medium text-[var(--color-ink-muted)]">{booking.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
