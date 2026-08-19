import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  GraduationCap,
  ShieldAlert,
  Users,
} from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";

type BookingSummary = {
  id: string;
  status: string;
  waitlistPosition?: number | null;
};

type SessionSummary = {
  id: string;
  date: string;
  maxCapacity?: number | null;
  instructor?: { id: string } | null;
  classSchedule?: ScheduleSummary | null;
  bookings?: BookingSummary[];
};

type ScheduleSummary = {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxCapacity?: number | null;
  instances?: SessionSummary[];
};

type InstructorProfile = {
  id: string;
  specialties?: unknown;
  certifications?: unknown;
  classSchedules?: ScheduleSummary[];
  classInstances?: SessionSummary[];
};

type PreparedSession = SessionSummary & {
  classSchedule?: ScheduleSummary | null;
  confirmedBookings: number;
  waitlistCount: number;
  capacity: number;
  openSpots: number;
  statusLabel: string;
};

async function getInstructorProfile(_userId: string, _organizationId: string): Promise<InstructorProfile | null> {
  const result = await gymClient.request<{ instructorAccount: InstructorProfile | null }>(gql`
    query InstructorAccount { instructorAccount }
  `, {}, await getAuthHeaders());
  return result.instructorAccount;
}

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSessionStatus(sessionDate: string) {
  const diffMs = new Date(sessionDate).getTime() - Date.now();

  if (diffMs <= 0) return "In progress";
  if (diffMs <= 60 * 60 * 1000) return "Starts within 1 hour";
  if (diffMs <= 3 * 60 * 60 * 1000) return "Starts this block";
  return "Upcoming";
}

function prepareSessions(instructor: InstructorProfile): PreparedSession[] {
  const sessionsById = new Map<string, SessionSummary>();

  for (const session of instructor.classInstances ?? []) {
    sessionsById.set(session.id, session);
  }

  for (const schedule of instructor.classSchedules ?? []) {
    for (const session of schedule.instances ?? []) {
      if (session.instructor && session.instructor.id !== instructor.id) continue;

      const existing = sessionsById.get(session.id);
      sessionsById.set(session.id, {
        ...existing,
        ...session,
        classSchedule: schedule,
      });
    }
  }

  return [...sessionsById.values()]
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .slice(0, 20)
    .map((session) => {
      const confirmedBookings = (session.bookings ?? []).filter((booking) => booking.status === "confirmed").length;
      const waitlistCount = (session.bookings ?? []).filter((booking) => booking.status === "waitlist").length;
      const capacity = session.maxCapacity ?? session.classSchedule?.maxCapacity ?? 0;

      return {
        ...session,
        confirmedBookings,
        waitlistCount,
        capacity,
        openSpots: Math.max(capacity - confirmedBookings, 0),
        statusLabel: getSessionStatus(session.date),
      };
    });
}

function AccountState({ title, message }: { title: string; message: string }) {
  return (
    <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-14 text-center">
      <AlertCircle aria-hidden="true" className="mx-auto h-8 w-8 text-[var(--color-ink-faint)]" />
      <h1 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">{title}</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--color-ink-muted)]">{message}</p>
    </section>
  );
}

export async function InstructorAccountPage() {
  const user = await getUser();

  if (!user) {
    return <AccountState title="Sign in required" message="Sign in to access your instructor workspace." />;
  }

  if (!user.role?.isInstructor) {
    return (
      <AccountState
        title="Instructor access required"
        message="This account is not configured as an instructor. Contact the front desk if your coaching access is missing."
      />
    );
  }

  let instructor: InstructorProfile | null;
  try {
    if (!user.organization?.id) {
      return <AccountState title="Organization required" message="Your account is not assigned to an organization." />;
    }
    instructor = await getInstructorProfile(user.id, user.organization.id);
  } catch (error) {
    console.error("Instructor account data could not be loaded:", error);
    return (
      <AccountState
        title="Instructor workspace unavailable"
        message="Teaching data could not be loaded right now. Try again shortly or contact the front desk."
      />
    );
  }

  if (!instructor) {
    return (
      <AccountState
        title="No instructor profile found"
        message="Ask an operator to link this account to an active instructor profile."
      />
    );
  }

  const specialties = Array.isArray(instructor.specialties) ? instructor.specialties.map(String) : [];
  const certifications = Array.isArray(instructor.certifications) ? instructor.certifications.map(String) : [];
  const schedules = instructor.classSchedules ?? [];
  const upcomingInstances = prepareSessions(instructor);
  const totalBooked = upcomingInstances.reduce((sum, session) => sum + session.confirmedBookings, 0);
  const totalWaitlist = upcomingInstances.reduce((sum, session) => sum + session.waitlistCount, 0);
  const sessionsStartingSoon = upcomingInstances.filter((session) => {
    // This server-rendered account view intentionally evaluates the current instant.
    const diff = new Date(session.date).getTime() - Date.now();
    return diff >= 0 && diff <= 90 * 60 * 1000;
  }).length;
  const weeklySchedule = WEEK_DAYS.map((day) => ({
    day,
    items: schedules.filter((schedule) => schedule.dayOfWeek === day),
  }));
  const nextSession = upcomingInstances[0] ?? null;
  const atRiskSessions = upcomingInstances
    .filter((session) => session.waitlistCount > 0 || (session.capacity > 0 && session.confirmedBookings >= session.capacity))
    .slice(0, 3);
  const canOpenOperations = Boolean(user.role.canAccessDashboard);

  return (
    <div className="space-y-12">
      <header className="max-w-3xl">
        <p className="sf-eyebrow mb-3">Coach workspace</p>
        <h1 className="sf-display text-[var(--text-display-s)]">Instructor console</h1>
        <p className="mt-4 sf-lead">
          Review your upcoming teaching calendar, roster occupancy, waitlist pressure, and recurring weekly schedule.
        </p>
      </header>

      <section aria-label="Instructor summary" className="grid gap-px border border-[var(--color-rule)] bg-[var(--color-rule)] sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Upcoming sessions", upcomingInstances.length],
          ["Booked members", totalBooked],
          ["Waitlisted members", totalWaitlist],
          ["Starting soon", sessionsStartingSoon],
        ].map(([label, value]) => (
          <div key={label} className="bg-[var(--color-surface)] p-5 sm:p-6">
            <p className="sf-label">{label}</p>
            <p className="sf-display mt-3 text-4xl text-[var(--color-ink)]">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="space-y-10">
          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="sf-eyebrow">Next roster</p>
                <h2 className="sf-display mt-3 text-3xl sm:text-4xl">
                  {nextSession?.classSchedule?.name ?? "No upcoming session"}
                </h2>
                <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                  {nextSession
                    ? `${formatDateTime(nextSession.date)} · ${nextSession.statusLabel}`
                    : "Your next scheduled class will appear here."}
                </p>
              </div>
              {nextSession && canOpenOperations ? (
                <Link href={`/dashboard/platform/rosters/${nextSession.id}`} className="sf-btn-secondary inline-flex shrink-0">
                  Open next roster
                </Link>
              ) : null}
            </div>

            {nextSession ? (
              <dl className="mt-8 grid gap-px border border-[var(--color-rule)] bg-[var(--color-rule)] sm:grid-cols-3">
                {[
                  ["Confirmed", nextSession.confirmedBookings],
                  ["Open spots", nextSession.openSpots],
                  ["Waitlist", nextSession.waitlistCount],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[var(--color-paper)] p-4">
                    <dt className="sf-label">{label}</dt>
                    <dd className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section aria-labelledby="upcoming-calendar-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="sf-eyebrow mb-2">Teaching calendar</p>
                <h2 id="upcoming-calendar-heading" className="text-2xl font-semibold">Upcoming sessions</h2>
              </div>
              {canOpenOperations ? (
                <Link href="/dashboard/platform/scheduling" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
                  Scheduling center
                </Link>
              ) : null}
            </div>

            {upcomingInstances.length === 0 ? (
              <div className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-14 text-center text-sm text-[var(--color-ink-muted)]">
                No upcoming sessions are assigned to this instructor profile.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingInstances.map((session) => (
                  <article key={session.id} className="grid gap-5 border border-[var(--color-rule)] bg-[var(--color-surface)] p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <p className="sf-eyebrow">{session.statusLabel}</p>
                      <h3 className="mt-2 text-xl font-semibold">{session.classSchedule?.name ?? "Class session"}</h3>
                      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{formatDateTime(session.date)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-5 md:justify-end">
                      <div>
                        <p className="sf-label">Occupancy</p>
                        <p className="mt-1 text-lg font-semibold">{session.confirmedBookings}/{session.capacity}</p>
                      </div>
                      <div>
                        <p className="sf-label">Waitlist</p>
                        <p className="mt-1 text-lg font-semibold">{session.waitlistCount}</p>
                      </div>
                      {canOpenOperations ? (
                        <Link href={`/dashboard/platform/rosters/${session.id}`} className="sf-btn-secondary inline-flex px-4 py-2 text-xs">
                          View roster
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center gap-2">
              <Users aria-hidden="true" className="h-4 w-4 text-[var(--color-accent)]" />
              <h2 className="text-xl font-semibold">Teaching tools</h2>
            </div>
            {canOpenOperations ? (
              <div className="mt-5 space-y-2">
                {[
                  ["Live rosters", "/dashboard/platform/rosters", Users],
                  ["Operations reports", "/dashboard/platform/reports", ArrowUpRight],
                  ["Scheduling center", "/dashboard/platform/scheduling", CalendarDays],
                  ["Instructor profile", "/dashboard/platform/instructors", GraduationCap],
                ].map(([label, href, Icon]) => {
                  const ToolIcon = Icon as typeof Users;
                  return (
                    <Link key={String(href)} href={String(href)} className="flex items-center justify-between border-b border-[var(--color-rule)] py-3 text-sm font-medium last:border-b-0 hover:text-[var(--color-accent)]">
                      <span>{String(label)}</span>
                      <ToolIcon aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--color-ink-muted)]">
                Roster and scheduling tools are not enabled for this role. Contact an operator if operational access is required.
              </p>
            )}
          </section>

          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center gap-2">
              <ShieldAlert aria-hidden="true" className="h-4 w-4 text-[var(--color-accent)]" />
              <h2 className="text-xl font-semibold">Session watchlist</h2>
            </div>
            {atRiskSessions.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-[var(--color-ink-muted)]">No full sessions or active waitlists need attention.</p>
            ) : (
              <div className="mt-5 space-y-4">
                {atRiskSessions.map((session) => (
                  <article key={session.id} className="border-t border-[var(--color-rule)] pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{session.classSchedule?.name ?? "Class session"}</h3>
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{formatDateTime(session.date)}</p>
                      </div>
                      <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 text-[var(--color-accent)]" />
                    </div>
                    <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                      {session.confirmedBookings}/{session.capacity} confirmed · {session.waitlistCount} waitlisted
                    </p>
                    {canOpenOperations ? (
                      <Link href={`/dashboard/platform/rosters/${session.id}`} className="mt-3 inline-flex text-sm font-medium text-[var(--color-accent)] hover:underline">
                        Open roster
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-6">
            <h2 className="text-xl font-semibold">Recurring teaching week</h2>
            <div className="mt-5 space-y-4">
              {weeklySchedule.map(({ day, items }) => (
                <div key={day} className="border-t border-[var(--color-rule)] pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="sf-label capitalize">{day}</h3>
                    <span className="text-xs text-[var(--color-ink-muted)]">{items.length} {items.length === 1 ? "session" : "sessions"}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-sm text-[var(--color-ink-faint)]">No recurring class</p>
                    ) : (
                      items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span className="shrink-0 text-[var(--color-ink-muted)]">{item.startTime}–{item.endTime}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-6">
            <h2 className="text-xl font-semibold">Coach profile</h2>
            <dl className="mt-5 space-y-5 text-sm">
              <div>
                <dt className="sf-label">Specialties</dt>
                <dd className="mt-2 leading-6 text-[var(--color-ink)]">{specialties.join(" · ") || "Not listed"}</dd>
              </div>
              <div>
                <dt className="sf-label">Certifications</dt>
                <dd className="mt-2 leading-6 text-[var(--color-ink)]">{certifications.join(" · ") || "Not listed"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
