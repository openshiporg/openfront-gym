import Link from "next/link";
import { Search } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUpcomingRosterSessions } from "../actions/rosters";
import { formatRosterOccurrenceDateTime } from "../timezone";

type Params = { q?: string; state?: string; sort?: string };

export async function RosterListPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = searchParams ? await searchParams : {};
  const query = (params.q || "").trim().toLowerCase();
  const state = params.state || "all";
  const sort = params.sort || "soonest";
  const source = await getUpcomingRosterSessions();
  // Server render needs a fixed current instant to classify the operating queue.
  // eslint-disable-next-line react-hooks/purity -- server-only time comparison
  const now = Date.now();
  const sessions = source
    .filter((session: any) => {
      const name = session.classSchedule?.name || "";
      const instructor = session.instructor?.user?.name || session.classSchedule?.instructor?.user?.name || "";
      const matchesQuery = !query || `${name} ${instructor} ${session.gymLocation || ""}`.toLowerCase().includes(query);
      const booked = session.bookingsCount ?? 0;
      const cap = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
      const sessionState = session.isCancelled ? "cancelled" : new Date(session.date).getTime() <= now ? "started" : booked >= cap && cap > 0 ? "full" : "upcoming";
      return matchesQuery && (state === "all" || state === sessionState);
    })
    .sort((a: any, b: any) => sort === "fullest"
      ? ((b.bookingsCount ?? 0) / Math.max(b.maxCapacity ?? b.classSchedule?.maxCapacity ?? 1, 1)) - ((a.bookingsCount ?? 0) / Math.max(a.maxCapacity ?? a.classSchedule?.maxCapacity ?? 1, 1))
      : new Date(a.date).getTime() - new Date(b.date).getTime());

  const confirmed = source.reduce((sum: number, item: any) => sum + (item.bookingsCount ?? 0), 0);
  const waiting = source.reduce((sum: number, item: any) => sum + (item.bookings?.length ?? 0), 0);
  const nearCapacity = source.filter((item: any) => {
    const cap = item.maxCapacity ?? item.classSchedule?.maxCapacity ?? 0;
    return cap > 0 && (item.bookingsCount ?? 0) / cap >= 0.8;
  }).length;

  const header = <div className="flex flex-col gap-1"><h1 className="text-lg font-semibold md:text-2xl">Class rosters</h1><p className="text-muted-foreground">Triage upcoming sessions, attendance, capacity, and waitlists.</p></div>;
  const breadcrumbs = [{ type: "link" as const, label: "Dashboard", href: "/dashboard" }, { type: "page" as const, label: "Rosters" }];

  return (
    <PageContainer title="Rosters" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full min-w-0 space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-3 divide-x rounded-lg border bg-card">
          <div className="p-3"><p className="text-xs text-muted-foreground">Sessions in window</p><p className="mt-1 text-2xl font-semibold tabular-nums">{source.length}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Confirmed seats</p><p className="mt-1 text-2xl font-semibold tabular-nums">{confirmed}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Waitlisted / near capacity</p><p className="mt-1 text-2xl font-semibold tabular-nums">{waiting} / {nearCapacity}</p></div>
        </div>

        <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="relative min-w-0"><span className="sr-only">Search rosters</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input name="q" type="search" defaultValue={params.q} placeholder="Search class, instructor, or location" className="pl-9" /></label>
          <select name="state" defaultValue={state} aria-label="Session state" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All states</option><option value="upcoming">Upcoming</option><option value="started">Started</option><option value="full">Full</option><option value="cancelled">Cancelled</option></select>
          <select name="sort" defaultValue={sort} aria-label="Sort rosters" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="soonest">Soonest first</option><option value="fullest">Fullest first</option></select>
          <Button type="submit">Apply</Button>
        </form>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card px-6 py-14 text-center"><p className="font-medium">No rosters match this view.</p><p className="mt-1 text-sm text-muted-foreground">Clear the search or state filter to review the full operating window.</p><Button asChild variant="outline" className="mt-4"><Link href="/dashboard/platform/rosters">Clear filters</Link></Button></div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_100px_48px] gap-4 border-b bg-muted/30 px-5 py-3 text-xs font-medium text-muted-foreground md:grid"><span>Session</span><span>Timing</span><span>Fill</span><span><span className="sr-only">Actions</span></span></div>
            <div className="divide-y">
              {sessions.map((session: any) => {
                const booked = session.bookingsCount ?? 0;
                const cap = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
                const waitlist = session.bookings?.length ?? 0;
                const started = new Date(session.date).getTime() <= now;
                return (
                  <details key={session.id} className="group px-5 py-4 open:bg-muted/20">
                    <summary className="grid cursor-pointer list-none gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_100px_48px] md:items-center">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{session.classSchedule?.name ?? "Class"}</p><Badge variant={session.isCancelled ? "destructive" : started ? "secondary" : "outline"}>{session.isCancelled ? "Cancelled" : started ? "Started" : "Upcoming"}</Badge>{waitlist ? <Badge variant="outline">{waitlist} waiting</Badge> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{session.instructor?.user?.name ?? session.classSchedule?.instructor?.user?.name ?? "Instructor unassigned"}</p></div>
                      <div className="text-sm"><span className="font-medium md:hidden">When: </span>{formatRosterOccurrenceDateTime(session.date, session.gymTimezone)}<span className="mt-1 block text-xs text-muted-foreground">{session.gymLocation || "Main studio"}</span></div>
                      <div className="text-sm font-medium tabular-nums"><span className="md:hidden">Fill: </span>{booked}/{cap}</div><span className="text-right text-sm text-muted-foreground group-open:rotate-180" aria-hidden="true">⌄</span>
                    </summary>
                    <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-muted-foreground">{Math.max(cap - booked, 0)} open spot{Math.max(cap - booked, 0) === 1 ? "" : "s"}; {waitlist} waiting. Attendance is recorded in the session roster.</p><Button asChild size="sm"><Link href={`/dashboard/platform/rosters/${session.id}`}>Open roster</Link></Button></div>
                  </details>
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
