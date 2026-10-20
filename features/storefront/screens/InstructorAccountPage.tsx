import { qualificationSummary } from "@/features/keystone/mutations/trainerQualifications";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CalendarX2,
  GraduationCap,
  ShieldAlert,
  Users,
} from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";
import { instructorTools } from "@/features/storefront/lib/instructor-tools";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { humanizeLabel, isClubToday } from "@/features/storefront/lib/presentation";
import { SessionState, SessionTime } from "@/features/storefront/modules/common/training";
import { EmptyState } from "@/features/storefront/modules/common/ui";

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

function getSessionStatus(sessionDate: string) {
  const diffMs = new Date(sessionDate).getTime() - Date.now();

  if (diffMs <= 0) return "Started";
  if (diffMs <= 60 * 60 * 1000) return "Starts within 1 hour";
  if (diffMs <= 3 * 60 * 60 * 1000) return "Starts this block";
  return "Upcoming";
}

function statusTone(label: string) {
  if (label === "Started") return "neutral";
  if (label === "Upcoming") return "ok";
  return "accent";
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

/** Roster fill for a coach: the published capacity state, or the booked count when no capacity is set. */
function RosterFill({ session }: { session: PreparedSession }) {
  if (session.capacity > 0) {
    return <SessionState spots={session.openSpots} capacity={session.capacity} waitlist={session.waitlistCount} />;
  }
  return <span className="sf-state" data-tone="neutral">{session.confirmedBookings} booked</span>;
}

function AccountState({ title, icon: Icon = AlertCircle }: { title: string; icon?: LucideIcon }) {
  return (
    <>
      <h1 className="sf-h2">Coach workspace</h1>
      <EmptyState
        headingLevel={2}
        icon={<Icon aria-hidden="true" />}
        title={title}
        action={<div className="sf-actions"><Link href="/account" className="sf-btn" data-variant="secondary" data-size="sm">Account</Link><Link href="/contact" className="sf-btn" data-variant="ghost" data-size="sm">Contact</Link></div>}
      />
    </>
  );
}

export async function InstructorAccountPage() {
  const [user, config] = await Promise.all([getUser(), getStorefrontConfig()]);
  const timeZone = config?.timezone || "UTC";

  if (!user) {
    return <AccountState title="Sign in required" />;
  }

  if (!user.role?.isInstructor) {
    return <AccountState icon={ShieldAlert} title="This account isn’t set up as a coach" />;
  }

  let instructor: InstructorProfile | null;
  try {
    if (!user.organization?.id) {
      return <AccountState title="This account has no organization" />;
    }
    instructor = await getInstructorProfile(user.id, user.organization.id);
  } catch (error) {
    console.error("Instructor account data could not be loaded:", error);
    return <AccountState title="Teaching data couldn’t be loaded" />;
  }

  if (!instructor) {
    return <AccountState icon={GraduationCap} title="No coach profile is linked to this account" />;
  }

  const specialties = Array.isArray(instructor.specialties) ? instructor.specialties.map(String) : [];
  // The coach's own qualifications by name and current standing; evidence details stay private.
  const certifications = (Array.isArray(instructor.certifications) ? instructor.certifications : [])
    .map((entry) => qualificationSummary(entry))
    .filter((entry): entry is NonNullable<ReturnType<typeof qualificationSummary>> => Boolean(entry))
    .map((entry) => entry.status === "listed" || entry.status === "current" ? entry.name : `${entry.name} (${entry.status})`);
  const schedules = instructor.classSchedules ?? [];
  const upcomingInstances = prepareSessions(instructor);
  const weeklySchedule = WEEK_DAYS.map((day) => ({
    day,
    items: schedules
      .filter((schedule) => schedule.dayOfWeek === day)
      .sort((left, right) => left.startTime.localeCompare(right.startTime)),
  }));
  const nextSession = upcomingInstances[0] ?? null;
  const atRiskSessions = upcomingInstances
    .filter((session) => session.waitlistCount > 0 || (session.capacity > 0 && session.confirmedBookings >= session.capacity))
    .slice(0, 3);
  const canOpenOperations = Boolean(user.role.canAccessDashboard);
  const teachingTools = instructorTools(user.role);
  const teachingToolIcons = {
    users: Users,
    external: ArrowUpRight,
    calendar: CalendarDays,
    graduation: GraduationCap,
  };

  // Group the dated sessions by club-local day for the teaching calendar.
  const days: Array<{ key: string; sessions: PreparedSession[] }> = [];
  for (const session of upcomingInstances) {
    const key = formatOccurrenceDate(session.date, timeZone);
    const group = days.find((entry) => entry.key === key);
    if (group) group.sessions.push(session);
    else days.push({ key, sessions: [session] });
  }

  return (
    <>
      <div className="sf-row" data-between>
        <h1 className="sf-h2">Coach workspace</h1>
        <span className="sf-meta">Times in {timeZone}</span>
      </div>

      <section className="sf-next sf-on-night" aria-labelledby="next-teaching-title">
        <p className="sf-label">Next session</p>
        {nextSession ? (
          <>
            <div className="sf-titleline">
              <h2 id="next-teaching-title" className="sf-next-title">{nextSession.classSchedule?.name ?? "Class session"}</h2>
              <span className="sf-state" data-tone={statusTone(nextSession.statusLabel)}>{nextSession.statusLabel}</span>
            </div>
            <div className="sf-next-when">
              <time dateTime={nextSession.date}>{formatOccurrenceTime(nextSession.date, timeZone)}</time>
              <span>{formatOccurrenceDate(nextSession.date, timeZone)}</span>
            </div>
            <dl className="sf-facts" data-plain>
              <div><dt>Confirmed</dt><dd className="sf-num">{nextSession.confirmedBookings}</dd></div>
              <div><dt>Open spaces</dt><dd className="sf-num">{nextSession.capacity > 0 ? nextSession.openSpots : "Capacity not set"}</dd></div>
              <div><dt>Waitlist</dt><dd className="sf-num">{nextSession.waitlistCount}</dd></div>
            </dl>
            {canOpenOperations ? (
              <div className="sf-actions">
                <Link href={`/dashboard/platform/rosters/${nextSession.id}`} className="sf-btn" data-variant="light">
                  Open roster<ArrowUpRight aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <h2 id="next-teaching-title" className="sf-next-title">No upcoming sessions</h2>
        )}
      </section>

      <div className="sf-detail">
        <section aria-labelledby="upcoming-calendar-heading" className="sf-stack">
          <div className="sf-row" data-between>
            <h2 id="upcoming-calendar-heading" className="sf-h3">Teaching calendar</h2>
            {canOpenOperations ? <Link href="/dashboard/platform/scheduling" className="sf-link" data-size="sm">Scheduling<ArrowUpRight aria-hidden="true" /></Link> : null}
          </div>

          {upcomingInstances.length === 0 ? (
            <EmptyState icon={<CalendarX2 aria-hidden="true" />} title="No sessions assigned" />
          ) : (
            days.map(({ key, sessions }) => (
              <div key={key} className="sf-day">
                <div className="sf-day-head"><h3>{key}</h3><span>{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span></div>
                <div className="sf-sessions">
                  {sessions.map((session) => (
                    <article key={session.id} className="sf-session">
                      <div className="sf-session-time">
                        <SessionTime value={formatOccurrenceTime(session.date, timeZone)} dateTime={session.date} />
                        {session.classSchedule ? <span>{session.classSchedule.startTime}–{session.classSchedule.endTime}</span> : null}
                      </div>
                      <div className="sf-session-body">
                        <div className="sf-titleline">
                          <h3>{session.classSchedule?.name ?? "Class session"}</h3>
                          <RosterFill session={session} />
                        </div>
                        <div className="sf-session-meta">
                          <span>{session.confirmedBookings} confirmed</span>
                          <span>{session.waitlistCount} waitlisted</span>
                          <span>{session.statusLabel}</span>
                        </div>
                      </div>
                      <div className="sf-session-action">
                        {canOpenOperations ? (
                          <Link href={`/dashboard/platform/rosters/${session.id}`} className="sf-btn" data-variant="secondary" data-size="sm">
                            Roster<span className="sr-only"> for {session.classSchedule?.name ?? "class session"}</span>
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <aside className="sf-stack">
          <section className="sf-card" aria-labelledby="teaching-tools">
            <h2 id="teaching-tools" className="sf-h3">Tools</h2>
            {teachingTools.length ? (
              <div className="sf-stack" data-gap="sm">
                {teachingTools.map((tool) => {
                  const ToolIcon = teachingToolIcons[tool.icon];
                  return (
                    <Link key={tool.href} href={tool.href} className="sf-btn" data-variant="secondary" data-block style={{ justifyContent: "flex-start" }}>
                      <ToolIcon aria-hidden="true" />
                      {tool.label}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="sf-text-2">No roster or scheduling access on this role.</p>
            )}
          </section>

          <section className="sf-card" aria-labelledby="watchlist-heading">
            <div className="sf-titleline">
              <h2 id="watchlist-heading" className="sf-h3">Full or waitlisted</h2>
              {atRiskSessions.length ? <span className="sf-state" data-tone="low">{atRiskSessions.length}</span> : null}
            </div>
            {atRiskSessions.length === 0 ? (
              <p className="sf-text-2">None</p>
            ) : (
              <ul className="sf-bookings">
                {atRiskSessions.map((session) => (
                  <li key={session.id} className="sf-stack" data-gap="sm" style={{ borderBottom: "1px solid var(--sf-line)", paddingBlock: 12 }}>
                    <strong>{session.classSchedule?.name ?? "Class session"}</strong>
                    <span className="sf-meta">{formatOccurrenceDate(session.date, timeZone)} · {formatOccurrenceTime(session.date, timeZone)}</span>
                    <span className="sf-meta">{session.confirmedBookings}/{session.capacity} confirmed · {session.waitlistCount} waitlisted</span>
                    {canOpenOperations ? (
                      <Link href={`/dashboard/platform/rosters/${session.id}`} className="sf-link" data-size="sm">
                        Open roster<span className="sr-only"> for {session.classSchedule?.name ?? "class session"}</span><ArrowUpRight aria-hidden="true" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sf-card" aria-labelledby="teaching-week-heading">
            <h2 id="teaching-week-heading" className="sf-h3">Weekly classes</h2>
            <dl className="sf-hours">
              {weeklySchedule.map(({ day, items }) => (
                <div key={day} data-today={isClubToday(day, timeZone) || undefined}>
                  <dt>{day.charAt(0).toUpperCase() + day.slice(1, 3)}</dt>
                  <dd>
                    {items.length === 0 ? (
                      <span className="sf-meta">None</span>
                    ) : (
                      items.map((item) => (
                        <span key={item.id} style={{ display: "block" }}>
                          <b className="sf-num">{item.startTime}–{item.endTime}</b> {item.name}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="sf-card" aria-labelledby="coach-profile">
            <h2 id="coach-profile" className="sf-h3">Profile</h2>
            <dl className="sf-facts" data-plain>
              <div><dt>Specialties</dt><dd>{specialties.length ? specialties.map(humanizeLabel).join(", ") : "None listed"}</dd></div>
              <div><dt>Certifications</dt><dd>{certifications.length ? certifications.join(", ") : "None listed"}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
