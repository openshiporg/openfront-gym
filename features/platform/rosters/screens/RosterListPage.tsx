import Link from "next/link";
import { ArrowRight, CalendarX2, ClipboardList, SearchX } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Button } from "@/components/ui/button";
import {
  SeatCount,
  EmptyBlock,
  FieldInput,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PlatformBody,
  PlatformHeader,
  SearchField,
  SegmentedLinks,
  StatusPill,
  type Tone,
} from "@/features/platform/components/platform-ui";
import { dateParam, enumParam, firstParam, pageParam, type SearchParamValue } from "@/features/platform/lib/search-params";
import { getRosterSessionPage } from "../actions/rosters";
import { formatRosterDayHeading, formatRosterTime, rosterDayKey } from "../timezone";

type Params = Record<string, SearchParamValue>;
type SessionState = "cancelled" | "started" | "full" | "upcoming";
const STATES = ["all", "upcoming", "full", "started", "cancelled"] as const;
const SORTS = ["soonest", "latest", "fullest"] as const;

const stateMeta: Record<SessionState, { label: string; tone: Tone }> = {
  upcoming: { label: "Upcoming", tone: "info" },
  full: { label: "Full", tone: "warning" },
  started: { label: "Started", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export async function RosterListPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = searchParams ? await searchParams : {};
  const q = firstParam(params.q, 100);
  const state = enumParam(params.state, STATES, "all");
  const sort = enumParam(params.sort, SORTS, "soonest");
  const from = dateParam(params.from);
  const to = dateParam(params.to);
  const requestedSkip = pageParam(params.skip, 1_000_000);
  const result = await getRosterSessionPage({ q: q || undefined, state, sort, from: from || undefined, to: to || undefined, skip: requestedSkip });
  const page = result.ok ? result.data : null;
  // The server moves an offset past the end to the last page.
  const skip: number = page?.skip ?? requestedSkip;
  const sessions: any[] = page?.sessions ?? [];
  const counts = page?.counts ?? {};
  // Server render needs a fixed current instant to classify the operating queue.
  // eslint-disable-next-line react-hooks/purity -- server-only time comparison
  const now = Date.now();
  const stateOf = (session: any): SessionState => {
    const booked = session.bookingsCount ?? 0;
    const cap = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
    return session.isCancelled ? "cancelled" : new Date(session.date).getTime() <= now ? "started" : booked >= cap && cap > 0 ? "full" : "upcoming";
  };

  const basePath = "/dashboard/platform/rosters";
  const hrefFor = (next: Partial<{ q: string; state: string; sort: string; from: string; to: string; skip: number }>) => {
    const search = new URLSearchParams();
    const merged = { q, state, sort, from, to, skip: 0, ...next };
    if (merged.q) search.set("q", merged.q);
    if (merged.state && merged.state !== "all") search.set("state", merged.state);
    if (merged.sort && merged.sort !== "soonest") search.set("sort", merged.sort);
    if (merged.from) search.set("from", merged.from);
    if (merged.to) search.set("to", merged.to);
    if (merged.skip) search.set("skip", String(merged.skip));
    const text = search.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const hasFilters = Boolean(q || state !== "all" || from || to);
  const total: number = page?.total ?? 0;
  const pageSize: number = page?.pageSize ?? 25;

  // Date-ordered lists read as a day-by-day run sheet; fullest-first stays one ranked list.
  const groups: Array<{ key: string; heading: string; sessions: any[] }> = [];
  for (const session of sessions) {
    const key = sort === "fullest" ? "ranked" : rosterDayKey(session.date, session.gymTimezone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.sessions.push(session);
    else groups.push({ key, heading: sort === "fullest" ? "Fullest first" : formatRosterDayHeading(session.date, session.gymTimezone, now), sessions: [session] });
  }

  const header = (
    <PlatformHeader
      eyebrow="Class operations"
      title="Rosters"
      description="Triage sessions by fill and waitlist pressure, then open a roster to promote members or record attendance."
    />
  );
  const breadcrumbs = [{ type: "link" as const, label: "Dashboard", href: "/dashboard" }, { type: "page" as const, label: "Platform" }, { type: "page" as const, label: "Rosters" }];
  const count = (value: unknown) => (typeof value === "number" ? value : undefined);

  return (
    <PageContainer title="Rosters" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {!result.ok ? <Notice tone="danger" title="Rosters not loaded">{result.error}</Notice> : null}
        {page?.scanLimited ? (
          <Notice tone="warning">More than 50,000 upcoming sessions match, so Full, Upcoming and Fullest first can’t be counted completely. Narrow the dates to see exact results.</Notice>
        ) : null}

        <Panel>
          <div className="flex flex-col gap-3 border-b p-3 sm:px-4">
            <SegmentedLinks
              label="Filter by session state"
              items={[
                { label: "All", href: hrefFor({ state: "all" }), active: state === "all", count: count(counts.all) },
                { label: "Upcoming", href: hrefFor({ state: "upcoming" }), active: state === "upcoming", count: count(counts.upcoming) },
                { label: "Full", href: hrefFor({ state: "full" }), active: state === "full", count: count(counts.full) },
                { label: "Started", href: hrefFor({ state: "started" }), active: state === "started", count: count(counts.started) },
                { label: "Cancelled", href: hrefFor({ state: "cancelled" }), active: state === "cancelled", count: count(counts.cancelled) },
              ]}
            />
            <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_9rem_auto]">
              {state !== "all" ? <input type="hidden" name="state" value={state} /> : null}
              <SearchField name="q" defaultValue={q} label="Search rosters" placeholder="Class, instructor, or location" />
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                From
                <FieldInput type="date" name="from" defaultValue={from} aria-label="From date" />
              </label>
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                To
                <FieldInput type="date" name="to" defaultValue={to} aria-label="To date" />
              </label>
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                Order
                <NativeSelect name="sort" defaultValue={sort}>
                  <option value="soonest">Soonest first</option>
                  <option value="latest">Latest first</option>
                  <option value="fullest">Fullest first</option>
                </NativeSelect>
              </label>
              <Button type="submit" variant="outline" className="self-end">Apply</Button>
            </form>
            <p className="text-[11px] text-muted-foreground">{from ? "" : "Without a start date the queue begins 24 hours ago. "}Dates use the gym&apos;s time zone{page?.timeZone ? ` (${page.timeZone})` : ""}.</p>
          </div>

          {!result.ok ? null : sessions.length === 0 ? (
            !hasFilters && skip === 0 ? (
              <EmptyBlock
                icon={CalendarX2}
                title="No sessions from the last day onward"
                description="Create upcoming sessions in Scheduling, or add a one-off session."
                action={<Button asChild variant="outline" size="sm"><Link href="/dashboard/platform/scheduling">Open scheduling</Link></Button>}
              />
            ) : (
              <EmptyBlock
                icon={SearchX}
                title="No rosters match this view"
                description="Clear the search, state or dates to widen the queue."
                action={hasFilters ? <Button asChild variant="outline" size="sm"><Link href={basePath}>Clear filters</Link></Button> : null}
              />
            )
          ) : (
            <div>
              {groups.map((group) => (
                <section key={group.key} aria-label={group.heading}>
                  <h2 className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">
                    <span>{group.heading}</span>
                    <span className="font-medium normal-case tracking-normal tabular-nums">{group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}</span>
                  </h2>
                  <ul className="divide-y">
                    {group.sessions.map((session: any) => {
                      const booked = session.bookingsCount ?? 0;
                      const cap = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
                      const waitlist = session.waitlistCount ?? 0;
                      const sessionState = stateOf(session);
                      const instructor = session.instructor?.user?.name ?? session.classSchedule?.instructor?.user?.name;
                      const href = `${basePath}/${session.id}`;
                      return (
                        <li key={session.id} className="group relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/30 focus-within:bg-muted/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring sm:px-5 md:grid-cols-[4.5rem_minmax(0,1fr)_11rem_6rem_auto] md:items-center">
                          <div className="tabular-nums">
                            <p className={sessionState === "cancelled" ? "text-sm font-semibold text-muted-foreground line-through" : "text-sm font-semibold"}>
                              {formatRosterTime(session.date, session.gymTimezone)}
                            </p>
                            {sort === "fullest" ? <p className="text-[11px] text-muted-foreground">{formatRosterDayHeading(session.date, session.gymTimezone, now)}</p> : null}
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <Link href={href} className="truncate rounded-sm text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline">
                                {session.classSchedule?.name ?? "Class"}
                              </Link>
                              <StatusPill tone={stateMeta[sessionState].tone}>{stateMeta[sessionState].label}</StatusPill>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {instructor ?? <span className="text-amber-700 dark:text-amber-400">Instructor unassigned</span>} · {session.effectiveLocation?.name ?? <span className="text-amber-700 dark:text-amber-400">Location unassigned</span>}
                            </p>
                          </div>
                          <div className="col-start-2 md:col-start-auto">
                            <SeatCount booked={booked} capacity={cap} />
                          </div>
                          <div className="col-start-2 text-xs md:col-start-auto">
                            {waitlist ? (
                              <span className="font-medium text-amber-700 dark:text-amber-400">{waitlist} waiting</span>
                            ) : (
                              <span className="text-muted-foreground">{Math.max(cap - booked, 0)} open</span>
                            )}
                          </div>
                          <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground md:block" aria-hidden />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {result.ok && (skip > 0 || total > skip + sessions.length) ? (
            <PaginationBar
              className="border-t px-4 py-3 sm:px-5"
              summary={total ? `Showing ${skip + 1}–${skip + sessions.length} of ${total}` : "Showing 0–0 of 0"}
              previousHref={skip > 0 ? hrefFor({ skip: Math.max(0, skip - pageSize) }) : null}
              nextHref={total > skip + sessions.length ? hrefFor({ skip: skip + pageSize }) : null}
            />
          ) : null}
        </Panel>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClipboardList className="size-3.5" aria-hidden />
          Attendance and waitlist promotion are recorded inside each session roster.
        </p>
      </PlatformBody>
    </PageContainer>
  );
}

export default RosterListPage;
