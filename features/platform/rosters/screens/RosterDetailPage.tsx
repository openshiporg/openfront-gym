import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Badge } from "@/components/ui/badge";
import { getRosterDetail, markRosterAttendance } from "../actions/rosters";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function RosterDetailPage({ id }: { id: string }) {
  const session = await getRosterDetail(id);
  if (!session) notFound();

  const booked = session.bookings?.filter((b: any) => b.status === "confirmed").length ?? 0;
  const waitlisted = session.bookings?.filter((b: any) => b.status === "waitlist").length ?? 0;
  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">{session.classSchedule?.name ?? "Class roster"}</h1>
      <p className="text-muted-foreground">{formatDateTime(session.date)} · {session.instructor?.user?.name ?? "Instructor TBD"}</p>
    </div>
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "link" as const, label: "Rosters", href: "/dashboard/platform/rosters" },
    { type: "page" as const, label: session.classSchedule?.name ?? "Roster" },
  ];

  return (
    <PageContainer title="Roster" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Confirmed bookings</p>
            <p className="mt-1 text-2xl font-bold">{booked}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Waitlist</p>
            <p className="mt-1 text-2xl font-bold">{waitlisted}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Capacity</p>
            <p className="mt-1 text-2xl font-bold">{session.classSchedule?.maxCapacity ?? 0}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid grid-cols-[1.5fr_1fr_160px_320px] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Member</span>
            <span>Status</span>
            <span>Attendance</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y">
            {(session.bookings ?? []).length === 0 ? (
              <div className="px-5 py-12 text-sm text-muted-foreground">No members booked into this class yet.</div>
            ) : (
              session.bookings.map((booking: any) => {
                const attendance = booking.attendance;
                const attendanceLabel = attendance
                  ? attendance.attended
                    ? attendance.lateArrival
                      ? `Late${attendance.minutesLate ? ` · ${attendance.minutesLate}m` : ""}`
                      : "Attended"
                    : "No-show"
                  : "Unmarked";

                return (
                  <div key={booking.id} className="grid grid-cols-[1.5fr_1fr_160px_320px] gap-4 px-5 py-4 items-center">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{booking.member?.name ?? booking.memberName ?? "Member"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{booking.member?.email ?? booking.memberEmail ?? "—"}</p>
                    </div>
                    <div>
                      <Badge variant="outline" className="capitalize">{booking.status}</Badge>
                    </div>
                    <div className="text-sm text-foreground">{attendanceLabel}</div>
                    <div className="flex justify-end gap-2">
                      {booking.status === "confirmed" && (
                        <>
                          <form action={markRosterAttendance}>
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="memberId" value={booking.member?.id} />
                            <input type="hidden" name="classScheduleId" value={session.classSchedule?.id} />
                            <input type="hidden" name="classInstanceId" value={session.id} />
                            <input type="hidden" name="outcome" value="attended" />
                            <button type="submit" className="inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                              Attended
                            </button>
                          </form>
                          <form action={markRosterAttendance}>
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="memberId" value={booking.member?.id} />
                            <input type="hidden" name="classScheduleId" value={session.classSchedule?.id} />
                            <input type="hidden" name="classInstanceId" value={session.id} />
                            <input type="hidden" name="outcome" value="late" />
                            <button type="submit" className="inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                              Late
                            </button>
                          </form>
                          <form action={markRosterAttendance}>
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <input type="hidden" name="memberId" value={booking.member?.id} />
                            <input type="hidden" name="classScheduleId" value={session.classSchedule?.id} />
                            <input type="hidden" name="classInstanceId" value={session.id} />
                            <input type="hidden" name="outcome" value="no-show" />
                            <button type="submit" className="inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                              No-show
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Link
            href="/dashboard/platform/rosters"
            className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back to rosters
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}

export default RosterDetailPage;
