import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, ClipboardCheck, Hourglass, Info, ListOrdered, UserX } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Button } from "@/components/ui/button";
import {
  SeatCount,
  Disclosure,
  EmptyBlock,
  FieldInput,
  FieldTextarea,
  FormField,
  Initials,
  KeyValueList,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  PlatformBody,
  PlatformHeader,
  SplitLayout,
  StatusPill,
  humanize,
  type Tone,
} from "@/features/platform/components/platform-ui";
import { requireDashboardUser } from "@/features/platform/lib/current-user";
import {
  getRosterDetail,
  markRosterAttendance,
  promoteWaitlistBooking,
} from "../actions/rosters";
import {
  formatRosterAuditDateTime,
  formatRosterOccurrenceDateTime,
} from "../timezone";

function getAttendance(attendance: any): { label: string; tone: Tone } {
  if (!attendance) return { label: "Unmarked", tone: "neutral" };
  if (attendance.attended) {
    if (attendance.lateArrival) {
      return { label: `Late${attendance.minutesLate ? ` · ${attendance.minutesLate}m` : ""}`, tone: "warning" };
    }
    return { label: "Attended", tone: "positive" };
  }
  return { label: "No-show", tone: "danger" };
}

function AttendanceHiddenFields({
  booking,
  classScheduleId,
  classInstanceId,
  outcome,
}: {
  booking: any;
  classScheduleId: string;
  classInstanceId: string;
  outcome: "attended" | "late" | "no-show";
}) {
  return (
    <>
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="memberId" value={booking.member?.id} />
      <input type="hidden" name="classScheduleId" value={classScheduleId} />
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <input type="hidden" name="outcome" value={outcome} />
    </>
  );
}

function AttendanceControls({
  booking,
  classScheduleId,
  classInstanceId,
}: {
  booking: any;
  classScheduleId: string;
  classInstanceId: string;
}) {
  const currentNotes = booking.attendance?.noShowReason || "";
  const currentMinutesLate = booking.attendance?.minutesLate || "";
  const name = booking.member?.name ?? booking.memberName ?? "member";

  return (
    <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      <form action={markRosterAttendance}>
        <AttendanceHiddenFields booking={booking} classScheduleId={classScheduleId} classInstanceId={classInstanceId} outcome="attended" />
        <Button type="submit" variant="outline" size="sm" className="h-[34px] w-full sm:w-auto" aria-label={`Mark ${name} attended`}>
          <Check aria-hidden /> Attended
        </Button>
      </form>
      <Disclosure summary={<span className="inline-flex items-center gap-1.5"><Hourglass className="size-3.5" aria-hidden /> Mark late…</span>}>
        <form action={markRosterAttendance} className="grid gap-2">
          <AttendanceHiddenFields booking={booking} classScheduleId={classScheduleId} classInstanceId={classInstanceId} outcome="late" />
          <FormField label="Minutes late">
            <FieldInput name="minutesLate" type="number" min={1} defaultValue={currentMinutesLate} />
          </FormField>
          <Button type="submit" variant="outline" size="sm">Save late arrival</Button>
        </form>
      </Disclosure>
      <Disclosure tone="danger" summary={<span className="inline-flex items-center gap-1.5"><UserX className="size-3.5" aria-hidden /> Mark no-show…</span>}>
        <form action={markRosterAttendance} className="grid gap-2">
          <AttendanceHiddenFields booking={booking} classScheduleId={classScheduleId} classInstanceId={classInstanceId} outcome="no-show" />
          <FormField label="No-show note">
            <FieldTextarea name="notes" defaultValue={currentNotes} placeholder="Reason, fee note, or operator context" />
          </FormField>
          <Button type="submit" variant="destructive" size="sm">Save no-show</Button>
        </form>
      </Disclosure>
    </div>
  );
}

function MemberIdentity({ booking }: { booking: any }) {
  const name = booking.member?.name ?? booking.memberName ?? "Member";
  const email = booking.member?.email ?? booking.memberEmail;
  const phone = booking.member?.phone ?? booking.memberPhone;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Initials name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {email ?? "—"}
          {phone ? ` · ${phone}` : ""}
        </p>
        {booking.eligibilityReviewReason ? (
          <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">Review: {booking.eligibilityReviewReason}</p>
        ) : null}
      </div>
    </div>
  );
}

function pageNumber(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  const number = Number(first);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 1_000_000) : 0;
}

function GroupPager({ id, group, page, params }: { id: string; group: "cs" | "ws" | "os"; page?: { total: number; skip: number; pageSize: number; rows: any[] }; params: Record<string, string | string[] | undefined> }) {
  if (!page || page.total <= page.pageSize) return null;
  const href = (skip: number) => {
    const search = new URLSearchParams();
    for (const key of ["cs", "ws", "os"]) { const value = key === group ? skip : pageNumber(params[key]); if (value) search.set(key, String(value)); }
    return `/dashboard/platform/rosters/${encodeURIComponent(id)}${search.size ? `?${search}` : ""}`;
  };
  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-xs sm:px-5">
      {page.skip > 0 ? <Link className="underline" href={href(Math.max(0, page.skip - page.pageSize))}>Previous</Link> : <span />}
      <span className="text-muted-foreground tabular-nums">{page.skip + 1}–{page.skip + page.rows.length} of {page.total}</span>
      {page.total > page.skip + page.rows.length ? <Link className="underline" href={href(page.skip + page.pageSize)}>Next</Link> : <span />}
    </div>
  );
}

export async function RosterDetailPage({ id, searchParams = {} }: { id: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const user = await requireDashboardUser();
  const session = await getRosterDetail(id, { confirmedSkip: pageNumber(searchParams.cs), waitlistSkip: pageNumber(searchParams.ws), otherSkip: pageNumber(searchParams.os) });
  if (!session) {
    if (user.role?.canManageAllRecords) notFound();
    redirect("/dashboard/no-access");
  }

  // Each group is one server page; every count below covers all of the session's bookings.
  const pages = session.bookingPages ?? {};
  const confirmedBookings: any[] = pages.confirmed?.rows ?? [];
  const waitlistBookings: any[] = pages.waitlist?.rows ?? [];
  const otherBookings: any[] = pages.other?.rows ?? [];
  const totals = session.counts ?? {};
  const confirmedTotal: number = totals.confirmed ?? confirmedBookings.length;
  const waitlistTotal: number = totals.waitlist ?? waitlistBookings.length;
  const noShowCount: number = totals.noShow ?? 0;
  const checkedInCount: number = totals.attended ?? 0;
  const unmarkedCount: number = totals.unmarked ?? 0;
  const capacity = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
  const availableSpots = Math.max(capacity - confirmedTotal, 0);
  // Server render needs the current instant to gate attendance controls.
  // eslint-disable-next-line react-hooks/purity -- intentional server-time eligibility boundary
  const sessionStarted = new Date(session.date).getTime() <= Date.now();
  // A cancelled session keeps its attendance evidence read-only.
  const attendanceOpen = sessionStarted && !session.isCancelled;
  const locationLabel = session.effectiveLocation ? [session.effectiveLocation.name, session.effectiveLocation.address].filter(Boolean).join(" · ") : "Location unassigned";
  const instructorName = session.instructor?.user?.name ?? session.classSchedule?.instructor?.user?.name;
  const sessionState: { label: string; tone: Tone } = session.isCancelled
    ? { label: "Cancelled", tone: "danger" }
    : sessionStarted
      ? { label: "Live / past start", tone: "warning" }
      : { label: "Upcoming", tone: "info" };

  const header = (
    <PlatformHeader
      eyebrow="Session roster"
      title={session.classSchedule?.name ?? "Class roster"}
      description={
        <>
          {formatRosterOccurrenceDateTime(session.date, session.gymTimezone)} · {instructorName ?? "Instructor TBD"} · {locationLabel}
        </>
      }
      meta={
        <>
          <StatusPill tone={sessionState.tone}>{sessionState.label}</StatusPill>
          <StatusPill tone={availableSpots ? "neutral" : "warning"} dot={false}>
            {availableSpots} open spot{availableSpots === 1 ? "" : "s"}
          </StatusPill>
        </>
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/platform/rosters">
            <ArrowLeft aria-hidden /> All rosters
          </Link>
        </Button>
      }
    />
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Platform" },
    { type: "link" as const, label: "Rosters", href: "/dashboard/platform/rosters" },
    { type: "page" as const, label: session.classSchedule?.name ?? "Roster" },
  ];

  return (
    <PageContainer title="Roster" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {session.isCancelled ? (
          <Notice tone="danger" title="Session cancelled">
            {session.cancellationReason || "This session has been cancelled."}
          </Notice>
        ) : null}

        {!session.isCancelled && waitlistTotal > 0 && availableSpots > 0 ? (
          <Notice
            tone="info"
            title="Spot available for promotion"
            action={
              <Button asChild size="sm" variant="outline">
                <a href="#waitlist">Review waitlist <ArrowUpRight aria-hidden /></a>
              </Button>
            }
          >
            There {availableSpots === 1 ? "is" : "are"} {availableSpots} open spot{availableSpots === 1 ? "" : "s"} and {waitlistTotal} member{waitlistTotal === 1 ? "" : "s"} waiting.
          </Notice>
        ) : null}


        <SplitLayout
          asideWidth="narrow"
          main={
            <Panel>
              <PanelHeader
                icon={ClipboardCheck}
                title="Attendance"
                count={confirmedTotal}
                description={
                  <>
                    {confirmedTotal}/{capacity} confirmed · {checkedInCount} checked in · {unmarkedCount} unmarked · {noShowCount} no-show{noShowCount === 1 ? "" : "s"} · {waitlistTotal} waiting.{" "}
                    {session.isCancelled
                      ? "This session was cancelled; recorded attendance is read-only."
                      : sessionStarted
                        ? "Record each confirmed member's outcome. Notes support no-show follow-up and instructor handoff."
                        : "Attendance controls open when the class starts."}
                  </>
                }
              />
              {confirmedTotal === 0 && (totals.other ?? otherBookings.length) === 0 ? (
                <EmptyBlock icon={ClipboardCheck} title="No members booked into this class yet" description="Confirmed bookings appear here with their attendance state." />
              ) : (
                <ul className="divide-y">
                  {confirmedBookings.map((booking: any) => {
                    const attendance = getAttendance(booking.attendance);
                    return (
                      <li key={booking.id} className="space-y-3 px-4 py-4 sm:px-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <MemberIdentity booking={booking} />
                          <div className="flex shrink-0 flex-col items-start gap-1 pl-11 sm:items-end sm:pl-0">
                            <StatusPill tone={attendance.tone}>{attendance.label}</StatusPill>
                            <p className="text-[11px] text-muted-foreground">
                              {booking.attendance?.markedAt
                                ? `Marked ${formatRosterAuditDateTime(booking.attendance.markedAt, session.gymTimezone)}`
                                : `Booked ${formatRosterAuditDateTime(booking.bookedAt, session.gymTimezone)}`}
                            </p>
                          </div>
                        </div>
                        {attendanceOpen ? (
                          <div className="sm:pl-11">
                            <AttendanceControls booking={booking} classScheduleId={session.classSchedule?.id} classInstanceId={session.id} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {otherBookings.map((booking: any) => (
                    <li key={booking.id} className="flex flex-col gap-2 bg-muted/20 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <MemberIdentity booking={booking} />
                      <div className="flex shrink-0 flex-col items-start gap-1 pl-11 sm:items-end sm:pl-0">
                        <StatusPill>{humanize(booking.status)}</StatusPill>
                        <p className="text-[11px] text-muted-foreground">Booked {formatRosterAuditDateTime(booking.bookedAt, session.gymTimezone)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <GroupPager id={session.id} group="cs" page={pages.confirmed} params={searchParams} />
              <GroupPager id={session.id} group="os" page={pages.other} params={searchParams} />
              {!sessionStarted && !session.isCancelled && confirmedTotal > 0 ? (
                <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
                  <Info className="size-3.5" aria-hidden /> Attendance opens when the class starts.
                </div>
              ) : null}
            </Panel>
          }
          aside={
            <>
              <Panel>
                <PanelHeader title="Session brief" />
                <PanelBody className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Seats filled</p>
                    <SeatCount booked={confirmedTotal} capacity={capacity} />
                  </div>
                  <KeyValueList
                    items={[
                      { label: "Instructor", value: instructorName ?? "Instructor TBD" },
                      { label: "Start", value: formatRosterOccurrenceDateTime(session.date, session.gymTimezone) },
                      { label: "Location", value: locationLabel },
                      { label: "State", value: <StatusPill tone={sessionState.tone}>{sessionState.label}</StatusPill> },
                      { label: "No-shows", value: noShowCount },
                      { label: "Open spots", value: availableSpots },
                    ]}
                  />
                </PanelBody>
              </Panel>

              <Panel id="waitlist">
                <PanelHeader
                  icon={ListOrdered}
                  title="Waitlist"
                  count={waitlistTotal}
                  description="Promote when a spot opens. Credits are validated before promotion."
                />
                {waitlistTotal === 0 ? (
                  <EmptyBlock compact title="No one is waiting for this session" />
                ) : (
                  <ol className="divide-y">
                    {waitlistBookings.map((booking: any, index: number) => (
                      <li key={booking.id} className="space-y-3 px-4 py-3.5 sm:px-5">
                        <div className="flex items-start gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-xs font-semibold tabular-nums">
                            {booking.waitlistPosition ?? "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{booking.member?.name ?? booking.memberName ?? "Member"}</p>
                            <p className="truncate text-xs text-muted-foreground">{booking.member?.email ?? booking.memberEmail ?? "—"}</p>
                            {booking.eligibilityReviewReason ? (
                              <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">Review: {booking.eligibilityReviewReason}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-muted-foreground">Joined {formatRosterAuditDateTime(booking.bookedAt, session.gymTimezone)}</p>
                          </div>
                        </div>
                        {index === 0 && (pages.waitlist?.skip ?? 0) === 0 ? (
                          <form action={promoteWaitlistBooking}>
                            <input type="hidden" name="classInstanceId" value={session.id} />
                            <Button type="submit" variant="outline" size="sm" className="w-full" disabled={availableSpots === 0 || session.isCancelled}>
                              {availableSpots === 0 ? "No open spot to promote into" : "Promote next eligible member"}
                            </Button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
                <GroupPager id={session.id} group="ws" page={pages.waitlist} params={searchParams} />
              </Panel>
            </>
          }
        />
      </PlatformBody>
    </PageContainer>
  );
}

export default RosterDetailPage;
