import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookings } from "@/features/storefront/lib/data/bookings";

export default async function AccountOverviewPage() {
  const user = await getUser();
  if (!user) notFound();

  const firstName = user.name?.split(" ")[0] ?? "Member";
  const membership = user.membership;
  const upcomingBookings = await getUpcomingBookings(user.id).catch(() => []);

  return (
    <div className="space-y-12 text-[#e5e2e1]">
      <header>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.92] tracking-[-0.08em] text-white sm:text-7xl">
          Welcome back,
          <br />
          <span className="text-[#818cf8]">{firstName}</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">
          Your member account is where bookings, billing, and role-aware tools come together.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <section className="md:col-span-8 relative overflow-hidden bg-[#1c1b1b] p-8">
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div>
              <div className="mb-8 flex items-start justify-between gap-4">
                <span className="text-xs font-bold uppercase tracking-[0.28em] text-[#c4c7c7]">Current status</span>
                <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${membership?.status === "active" ? "bg-[#d3fbff] text-[#00363a]" : "bg-[#353535] text-[#e5e2e1]"}`}>
                  {membership?.status ?? "No active plan"}
                </span>
              </div>
              <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.06em] text-white sm:text-5xl">
                {membership?.tier?.name ?? "Membership required"}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[#c4c7c7]">
                {membership
                  ? "Your current plan controls facility access, class access, renewal timing, and billing status."
                  : "Activate a membership to unlock booking, billing, and full facility access."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 border-t border-white/10 pt-8 sm:grid-cols-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Credits</span>
                <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                  {membership?.tier?.classCreditsPerMonth === -1 ? "Unlimited" : membership?.classCreditsRemaining ?? 0}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Next billing</span>
                <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                  {membership?.nextBillingDate ? new Date(membership.nextBillingDate).toLocaleDateString() : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Upcoming</span>
                <span className="mt-2 block font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase italic text-white">
                  {upcomingBookings.length}
                </span>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 rotate-12 border-[28px] border-[#818cf8]/5" />
        </section>

        <section className="md:col-span-4 flex flex-col gap-4">
          <Link href="/schedule" className="bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-6 text-sm font-bold uppercase tracking-[0.2em] text-white transition-transform active:scale-95">
            Book next class
          </Link>
          <Link href="/account/membership" className="bg-[#1c1b1b] px-6 py-6 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#2a2a2a]">
            Manage membership
          </Link>
          <Link href="/account/profile" className="bg-[#1c1b1b] px-6 py-6 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#2a2a2a]">
            Update profile
          </Link>
          {user.role?.isInstructor && (
            <Link href="/account/instructor" className="bg-[#00eefc] px-6 py-6 text-sm font-bold uppercase tracking-[0.2em] text-[#00363a] transition-transform active:scale-95">
              Instructor console
            </Link>
          )}
        </section>
      </div>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">
            Upcoming bookings
          </h2>
          <Link href="/account/bookings" className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">
            View all
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="bg-[#1c1b1b] px-6 py-16 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
            No upcoming classes booked yet.
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingBookings.slice(0, 3).map((booking: any, index: number) => (
              <div key={booking.id} className={`flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between ${index === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"}`}>
                <div>
                  <p className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                    {booking.classInstance?.classSchedule?.name ?? "Class"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
                    {booking.classInstance?.date
                      ? new Date(booking.classInstance.date).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Date TBD"}
                  </p>
                </div>
                <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#a5b4fc]">{booking.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
