import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookings, getBookingHistory } from "@/features/storefront/lib/data/bookings";

export default async function AccountBookingsPage() {
  const user = await getUser();
  if (!user) notFound();

  const [upcoming, history] = await Promise.all([
    getUpcomingBookings(user.id).catch(() => []),
    getBookingHistory(user.id).catch(() => []),
  ]);

  return (
    <div className="space-y-10 text-[#e5e2e1]">
      <header>
        <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
          My bookings
        </h1>
        <p className="mt-3 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">Upcoming sessions and historical class activity.</p>
      </header>

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">
            Upcoming ({upcoming.length})
          </h2>
          <Link href="/schedule" className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">Browse schedule</Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="bg-[#1c1b1b] px-6 py-16 text-center text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">No upcoming classes booked.</div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((booking: any, index: number) => (
              <BookingRow key={booking.id} booking={booking} index={index} />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-5 font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">
            Past classes ({history.length})
          </h2>
          <div className="space-y-4 opacity-80">
            {history.slice(0, 10).map((booking: any, index: number) => (
              <BookingRow key={booking.id} booking={booking} index={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BookingRow({ booking, index }: { booking: any; index: number }) {
  const schedule = booking.classInstance?.classSchedule;
  const date = booking.classInstance?.date;
  const instructorName = booking.classInstance?.instructor?.user?.name ?? schedule?.instructor?.user?.name;
  const stateClass =
    booking.status === "confirmed" ? "text-[#a5b4fc]" : booking.status === "cancelled" ? "text-[#ffb4ab]" : "text-[#818cf8]";

  return (
    <div className={`flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between ${index === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"}`}>
      <div>
        <p className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
          {schedule?.name ?? "Class"}
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
          {date
            ? new Date(date).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : "Date TBD"}
          {instructorName ? ` · ${instructorName}` : ""}
        </p>
      </div>
      <div className={`text-sm font-bold uppercase tracking-[0.18em] ${stateClass}`}>{booking.status}</div>
    </div>
  );
}
