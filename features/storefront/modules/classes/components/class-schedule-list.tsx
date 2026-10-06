import Link from "next/link";
import { getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath } from "@/features/storefront/lib/return-path";

export default async function ClassScheduleList({ classId }: { classId: string }) {
  const [sessions, config] = await Promise.all([
    getUpcomingClassOccurrences({ days: 14, classTypeId: classId, limit: 8 }),
    getStorefrontConfig(),
  ]);
  const timeZone = config?.timezone || "UTC";

  if (!sessions.length) {
    return <div className="border border-[var(--sf-border)] bg-[var(--sf-surface)] p-6 text-sm text-[var(--sf-muted)]">No upcoming dated sessions are published for this class.</div>;
  }

  return (
    <div className="border-t border-[var(--sf-border)]">
      {sessions.map((session) => (
        <article key={session.id} className="grid gap-4 border-b border-[var(--sf-border)] py-5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
          <div><p className="font-bold tabular-nums text-[var(--sf-primary)]">{formatOccurrenceTime(session.startsAt, timeZone)}</p><p className="mt-1 text-xs text-[var(--sf-muted)]">{formatOccurrenceDate(session.startsAt, timeZone)}</p></div>
          <div><h3 className="font-semibold">{session.name || session.classType?.name || "Class"}</h3>{session.instructor?.name ? <p className="mt-1 text-sm text-[var(--sf-muted)]">{session.instructor.name}</p> : null}</div>
          <div className="sm:text-right"><p className="text-sm font-semibold">{session.availability.spotsRemaining > 0 ? `${session.availability.spotsRemaining} spots open` : "Waitlist"}</p><Link href={bookingReturnPath(session.id)} className="mt-2 inline-flex text-xs font-semibold text-[var(--sf-primary)] underline underline-offset-4">{session.availability.spotsRemaining > 0 ? "Reserve" : "Join waitlist"}</Link></div>
        </article>
      ))}
    </div>
  );
}
