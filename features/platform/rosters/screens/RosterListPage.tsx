import Link from "next/link";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { getUpcomingRosterSessions } from "../actions/rosters";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function RosterListPage() {
  const sessions = await getUpcomingRosterSessions();

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Class rosters</h1>
      <p className="text-muted-foreground">Open a live class roster, review bookings, and move into attendance marking.</p>
    </div>
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Rosters" },
  ];

  return (
    <PageContainer title="Rosters" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6">
        {sessions.length === 0 ? (
          <div className="rounded-lg border bg-background px-6 py-14 text-sm text-muted-foreground">
            No upcoming class instances found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="grid grid-cols-[1.2fr_1fr_120px_140px] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Class</span>
              <span>When</span>
              <span>Fill</span>
              <span></span>
            </div>
            <div className="divide-y">
              {sessions.map((session: any) => {
                const booked = session.bookingsCount ?? 0;
                const cap = session.classSchedule?.maxCapacity ?? 0;
                return (
                  <div key={session.id} className="grid grid-cols-[1.2fr_1fr_120px_140px] gap-4 px-5 py-4 items-center">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{session.classSchedule?.name ?? "Class"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{session.instructor?.user?.name ?? "Instructor TBD"}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDateTime(session.date)}</div>
                    <div className="text-sm font-medium text-foreground">{booked}/{cap}</div>
                    <div className="flex justify-end">
                      <Link
                        href={`/dashboard/platform/rosters/${session.id}`}
                        className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        Open roster
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

export default RosterListPage;
