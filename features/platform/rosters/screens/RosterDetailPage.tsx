import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Users } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getRosterDetail,
  markRosterAttendance,
  promoteWaitlistBooking,
} from "../actions/rosters";
import {
  formatRosterAuditDateTime,
  formatRosterOccurrenceDateTime,
} from "../timezone";

function getAttendanceLabel(attendance: any) {
  if (!attendance) return "Unmarked";
  if (attendance.attended) {
    if (attendance.lateArrival) {
      return `Late${attendance.minutesLate ? ` · ${attendance.minutesLate}m` : ""}`;
    }
    return "Attended";
  }
  return "No-show";
}

function AttendanceActionForm({
  booking,
  classScheduleId,
  classInstanceId,
  outcome,
  label,
  variant = "outline",
}: {
  booking: any;
  classScheduleId: string;
  classInstanceId: string;
  outcome: "attended" | "late" | "no-show";
  label: string;
  variant?: "outline" | "destructive";
}) {
  const currentNotes = booking.attendance?.noShowReason || "";
  const currentMinutesLate = booking.attendance?.minutesLate || "";

  return (
    <form action={markRosterAttendance} className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="memberId" value={booking.member?.id} />
      <input type="hidden" name="classScheduleId" value={classScheduleId} />
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <input type="hidden" name="outcome" value={outcome} />

      {outcome === "late" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minutes late</label>
          <Input name="minutesLate" type="number" min={1} defaultValue={currentMinutesLate} className="h-9" />
        </div>
      )}

      {outcome === "no-show" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No-show note</label>
          <Textarea name="notes" defaultValue={currentNotes} placeholder="Reason, fee note, or operator context" className="min-h-[84px]" />
        </div>
      )}

      <Button type="submit" variant={variant} className="w-full">
        {label}
      </Button>
    </form>
  );
}

export async function RosterDetailPage({ id }: { id: string }) {
  const session = await getRosterDetail(id);
  if (!session) notFound();

  const bookings = session.bookings ?? [];
  const confirmedBookings = bookings.filter((b: any) => b.status === "confirmed");
  const waitlistBookings = bookings.filter((b: any) => b.status === "waitlist");
  const noShowCount = confirmedBookings.filter((b: any) => b.attendance && b.attendance.attended === false).length;
  const checkedInCount = confirmedBookings.filter((b: any) => b.attendance?.attended === true).length;
  const unmarkedCount = confirmedBookings.filter((b: any) => !b.attendance).length;
  const capacity = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;
  const availableSpots = Math.max(capacity - confirmedBookings.length, 0);
  // Server render needs the current instant to gate attendance controls.
  // eslint-disable-next-line react-hooks/purity -- this is a server-only time comparison.
  const sessionStarted = new Date(session.date).getTime() <= Date.now();

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">{session.classSchedule?.name ?? "Class roster"}</h1>
      <p className="text-muted-foreground">
        {formatRosterOccurrenceDateTime(session.date, session.gymTimezone)} · {session.instructor?.user?.name ?? session.classSchedule?.instructor?.user?.name ?? "Instructor TBD"}
        <span className="block text-sm">{session.gymLocation || "Main studio"}</span>
      </p>
    </div>
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "link" as const, label: "Rosters", href: "/dashboard/platform/rosters" },
    { type: "page" as const, label: session.classSchedule?.name ?? "Roster" },
  ];

  return (
    <PageContainer title="Roster" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full space-y-6 p-4 md:p-6">
        {session.isCancelled && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Session cancelled</AlertTitle>
            <AlertDescription>
              {session.cancellationReason || "This class instance has been cancelled."}
            </AlertDescription>
          </Alert>
        )}

        {!session.isCancelled && waitlistBookings.length > 0 && availableSpots > 0 && (
          <Alert>
            <ArrowUpRight className="h-4 w-4" />
            <AlertTitle>Spot available for promotion</AlertTitle>
            <AlertDescription>
              There {availableSpots === 1 ? "is" : "are"} {availableSpots} open spot{availableSpots === 1 ? "" : "s"} and {waitlistBookings.length} member{waitlistBookings.length === 1 ? "" : "s"} waiting.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Confirmed</p>
            <p className="mt-1 text-2xl font-bold">{confirmedBookings.length}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Waitlist</p>
            <p className="mt-1 text-2xl font-bold">{waitlistBookings.length}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</p>
            <p className="mt-1 text-2xl font-bold">{checkedInCount}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Unmarked</p>
            <p className="mt-1 text-2xl font-bold">{unmarkedCount}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Capacity</p>
            <p className="mt-1 text-2xl font-bold">{confirmedBookings.length}/{capacity}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="min-w-0 space-y-6">
            <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold">Live roster</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review booked members, attendance state, and in-session operator actions.
                </p>
              </div>

              <div className="hidden overflow-x-auto md:block"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Booked</TableHead>
                    <TableHead>Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-sm text-muted-foreground">
                        No members booked into this class yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bookings.map((booking: any) => {
                      const attendanceLabel = getAttendanceLabel(booking.attendance);
                      return (
                        <TableRow key={booking.id}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{booking.member?.name ?? booking.memberName ?? "Member"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{booking.member?.email ?? booking.memberEmail ?? "—"}</p>
                              {booking.member?.phone || booking.memberPhone ? (
                                <p className="mt-1 text-xs text-muted-foreground">{booking.member?.phone ?? booking.memberPhone}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Badge variant="outline" className="capitalize">{booking.status}</Badge>
                              {booking.status === "waitlist" && typeof booking.waitlistPosition === "number" ? (
                                <p className="text-xs text-muted-foreground">Position #{booking.waitlistPosition}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatRosterAuditDateTime(booking.bookedAt, session.gymTimezone)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">{attendanceLabel}</p>
                              {booking.attendance?.markedAt ? (
                                <p className="text-xs text-muted-foreground">Marked {formatRosterAuditDateTime(booking.attendance.markedAt, session.gymTimezone)}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">Not marked yet</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table></div>
              <div className="divide-y md:hidden">
                {bookings.length === 0 ? <div className="px-5 py-10 text-sm text-muted-foreground">No members booked into this class yet.</div> : bookings.map((booking: any) => <details key={`${booking.id}-mobile`} className="px-5 py-4"><summary className="list-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{booking.member?.name ?? booking.memberName ?? 'Member'}</p><p className="mt-1 text-xs text-muted-foreground">{booking.member?.email ?? booking.memberEmail ?? '—'}</p></div><Badge variant="outline" className="capitalize">{booking.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Attendance: {getAttendanceLabel(booking.attendance)}</p></summary><dl className="mt-3 grid gap-2 border-t pt-3 text-xs"><div><dt className="text-muted-foreground">Attendance state</dt><dd>{getAttendanceLabel(booking.attendance)}</dd></div>{booking.member?.phone || booking.memberPhone ? <div><dt className="text-muted-foreground">Phone</dt><dd>{booking.member?.phone ?? booking.memberPhone}</dd></div> : null}</dl></details>)}
              </div>
            </div>

            <div className="rounded-lg border bg-background">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold">Attendance actions</h2>
                <p className="mt-1 text-xs text-muted-foreground">Mark attendance outcomes with notes that support no-show follow-up and instructor handoff.</p>
              </div>
              <div className="space-y-6 p-5">
                {!sessionStarted ? (
                  <div className="rounded-lg border border-dashed px-4 py-10 text-sm text-muted-foreground">
                    Attendance opens when the class starts.
                  </div>
                ) : confirmedBookings.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-10 text-sm text-muted-foreground">
                    No confirmed members to mark attendance for.
                  </div>
                ) : (
                  confirmedBookings.map((booking: any) => (
                    <div key={booking.id} className="rounded-xl border p-4">
                      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{booking.member?.name ?? booking.memberName ?? "Member"}</p>
                          <p className="text-xs text-muted-foreground">{booking.member?.email ?? booking.memberEmail ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getAttendanceLabel(booking.attendance)}</Badge>
                          {booking.attendance?.attended ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : booking.attendance ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        <AttendanceActionForm
                          booking={booking}
                          classScheduleId={session.classSchedule?.id}
                          classInstanceId={session.id}
                          outcome="attended"
                          label="Mark attended"
                        />
                        <AttendanceActionForm
                          booking={booking}
                          classScheduleId={session.classSchedule?.id}
                          classInstanceId={session.id}
                          outcome="late"
                          label="Mark late"
                        />
                        <AttendanceActionForm
                          booking={booking}
                          classScheduleId={session.classSchedule?.id}
                          classInstanceId={session.id}
                          outcome="no-show"
                          label="Mark no-show"
                          variant="destructive"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="min-w-0 space-y-6">
            <div className="rounded-lg border bg-background p-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Session brief</h2>
              </div>
              <dl className="mt-4 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Instructor</dt>
                  <dd className="text-right font-medium">{session.instructor?.user?.name ?? session.classSchedule?.instructor?.user?.name ?? "Instructor TBD"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Start time</dt>
                  <dd className="text-right font-medium">{formatRosterOccurrenceDateTime(session.date, session.gymTimezone)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Session state</dt>
                  <dd className="text-right font-medium">{session.isCancelled ? "Cancelled" : sessionStarted ? "Live / past start" : "Upcoming"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">No-shows</dt>
                  <dd className="text-right font-medium">{noShowCount}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Open spots</dt>
                  <dd className="text-right font-medium">{availableSpots}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-background">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold">Waitlist management</h2>
                <p className="mt-1 text-xs text-muted-foreground">Promote members when a spot opens. Credits are validated before promotion.</p>
              </div>
              <div className="space-y-4 p-5">
                {waitlistBookings.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">No one is waiting for this session.</div>
                ) : (
                  waitlistBookings.map((booking: any, index: number) => (
                    <div key={booking.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{booking.member?.name ?? booking.memberName ?? "Member"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{booking.member?.email ?? booking.memberEmail ?? "—"}</p>
                        </div>
                        <Badge variant="outline">#{booking.waitlistPosition ?? "—"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Joined waitlist {formatRosterAuditDateTime(booking.bookedAt, session.gymTimezone)}</p>
                      {index === 0 ? (
                        <form action={promoteWaitlistBooking}>
                          <input type="hidden" name="classInstanceId" value={session.id} />
                          <Button type="submit" variant="outline" className="w-full" disabled={availableSpots === 0 || session.isCancelled}>
                            Promote next eligible member
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                href="/dashboard/platform/rosters"
                className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                Back to rosters
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}

export default RosterDetailPage;
