"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarSearch, SlidersHorizontal, X } from "lucide-react";
import { discoveryHref, matchesSession } from "@/features/storefront/lib/discovery";
import { difficultyLabel } from "@/features/storefront/lib/presentation";
import { SessionState, SessionTime } from "@/features/storefront/modules/common/training";
import { Banner, EmptyState } from "@/features/storefront/modules/common/ui";
import ClassBookingModal, { type BookingViewer } from "./class-booking-modal";

type ScheduleItem = {
  time: string; name: string; instructor: string; instructorId?: string;
  classTypeId?: string; duration: number; spots: number; capacity: number; waitlist?: number;
  id: string; isBookable?: boolean; difficulty?: string; date: string;
  dateKey: string; dateLabel: string; location?: string;
};
type Day = { key: string; label: string; short: string; full: string };

function dayNumber(day: Day) {
  const fromKey = Number(day.key.slice(8, 10));
  return Number.isFinite(fromKey) && fromKey > 0 ? String(fromKey) : day.short;
}

export default function WeeklySchedule({ scheduleData, truncated = false, loadedThroughKey = null, startsLater = false, days, coachOptions = [], formatOptions = [], timeZone, viewer }: {
  scheduleData: ScheduleItem[]; truncated?: boolean; loadedThroughKey?: string | null; startsLater?: boolean; days: Day[];
  coachOptions?: Array<[string, string]>; formatOptions?: Array<[string, string]>;
  timeZone: string; initialBookingId?: string; viewer?: BookingViewer;
}) {
  const router = useRouter();
  const bookingTrigger = useRef<HTMLButtonElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const params = useSearchParams() ?? new URLSearchParams();
  const navigate = (changes: Record<string, string | null>) => router.push(discoveryHref("/schedule", params.toString(), changes), { scroll: false });
  const bookingId = params.get("book");
  const selectedClass = scheduleData.find(item => item.id === bookingId);
  const allDays = selectedClass && !days.some(day => day.key === selectedClass.dateKey)
    ? [...days, { key: selectedClass.dateKey, label: "Selected", short: selectedClass.dateLabel, full: selectedClass.dateLabel }]
    : days;
  const requestedDay = params.get("date") || selectedClass?.dateKey;
  // Without a requested date, open on the first date that has sessions rather than an empty today.
  const firstWithSessions = allDays.find(item => scheduleData.some(session => session.dateKey === item.key));
  const day = allDays.find(item => item.key === requestedDay) || firstWithSessions || allDays[0];
  const week = params.get("view") === "week";
  const filters = { q: params.get("q") || "", coach: params.get("coach") || "", format: params.get("format") || "", availability: params.get("availability") || "" };
  // Coach, class and search were applied by the server; open spaces depend on live seats.
  const matched = scheduleData.filter(item => matchesSession(item, { availability: filters.availability }));
  const filtering = Boolean(filters.q || filters.coach || filters.format || filters.availability === "open");
  // After a read that stopped early, dates from the last one reached aren't complete.
  const notLoaded = (key: string) => Boolean(loadedThroughKey && key >= loadedThroughKey);
  const canContinue = Boolean(loadedThroughKey && loadedThroughKey !== allDays[0]?.key);
  const weekStart = Math.floor(Math.max(0, allDays.findIndex(item => item.key === day.key)) / 7) * 7;
  const visibleDays = week ? allDays.slice(weekStart, weekStart + 7) : [day];
  const coaches = coachOptions;
  const formats = formatOptions;
  const countFor = (key: string) => matched.filter(session => session.dateKey === key).length;
  const sessionsFor = (key: string) => matched.filter(session => session.dateKey === key).sort((a, b) => a.date.localeCompare(b.date));
  const activeFilters = [
    filters.q ? { key: "q", label: `“${filters.q}”` } : null,
    filters.coach ? { key: "coach", label: coaches.find(([id]) => id === filters.coach)?.[1] || "Coach" } : null,
    filters.format ? { key: "format", label: formats.find(([id]) => id === filters.format)?.[1] || "Class" } : null,
    filters.availability === "open" ? { key: "availability", label: "Spaces available" } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  const clearFilters = { q: null, coach: null, format: null, availability: null, book: null };

  const openBooking = (session: ScheduleItem, trigger: HTMLButtonElement) => {
    bookingTrigger.current = trigger;
    navigate({ book: session.id, date: session.dateKey });
  };
  const bookLabel = (session: ScheduleItem) => `${session.spots > 0 ? "Book" : "Join waitlist for"} ${session.name}, ${session.dateLabel}, ${session.time}`;

  const emptyDay = (key: string) => notLoaded(key) ? (
    <EmptyState
      icon={<CalendarSearch aria-hidden="true" />}
      title="Sessions from this date aren’t shown yet"
      action={canContinue
        ? <button type="button" className="sf-btn" data-variant="secondary" data-size="sm" onClick={() => navigate({ from: loadedThroughKey, date: key, book: null })}>Show sessions from here</button>
        : <button type="button" className="sf-btn" data-variant="secondary" data-size="sm" onClick={() => setFiltersOpen(true)}>Filter by class or coach</button>}
    />
  ) : (
    <EmptyState
      icon={<CalendarSearch aria-hidden="true" />}
      title={filtering ? "No sessions match these filters" : "No sessions on this date"}
      action={<button type="button" className="sf-btn" data-variant="secondary" data-size="sm" onClick={() => navigate({ ...clearFilters, view: "week" })}>Show the week</button>}
    />
  );

  const row = (session: ScheduleItem) => {
    const level = difficultyLabel(session.difficulty);
    return (
      <article className="sf-session" key={session.id}>
        <div className="sf-session-time"><SessionTime value={session.time} dateTime={session.date} /><span>{session.duration} min</span></div>
        <div className="sf-session-body">
          <div className="sf-titleline">
            <h3>{session.classTypeId ? <Link href={`/classes/${session.classTypeId}`}>{session.name}</Link> : session.name}</h3>
            <SessionState spots={session.spots} capacity={session.capacity} waitlist={session.waitlist} />
          </div>
          <div className="sf-session-meta">
            {session.instructorId ? <Link href={`/instructors/${session.instructorId}`}>{session.instructor}</Link> : <span>{session.instructor}</span>}
            {level ? <span>{level}</span> : null}
            {session.location ? <span>{session.location}</span> : null}
          </div>
        </div>
        <div className="sf-session-action">
          <button type="button" className="sf-btn" data-size="sm" data-variant={session.spots > 0 ? "accent" : "secondary"} onClick={event => openBooking(session, event.currentTarget)} aria-label={bookLabel(session)}>
            {session.spots > 0 ? "Book" : "Waitlist"}
          </button>
        </div>
      </article>
    );
  };

  const dayList = (item: Day) => {
    const sessions = sessionsFor(item.key);
    return (
      <section key={item.key} className="sf-day" aria-label={item.full}>
        <div className="sf-day-head"><h2>{item.key === allDays[0]?.key && !startsLater ? `Today · ${item.full}` : item.full}</h2><span>{notLoaded(item.key) ? "More to load" : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}</span></div>
        {sessions.length ? <div className="sf-sessions">{sessions.map(row)}</div> : emptyDay(item.key)}
        {sessions.length && notLoaded(item.key) ? emptyDay(item.key) : null}
      </section>
    );
  };

  return <section aria-label="Find a class" className="sf-schedule">
    <div className="sf-dates-bar">
      <nav className="sf-seg sf-dates" aria-label="Choose a date">
        {allDays.map(item => {
          const count = countFor(item.key);
          const pending = notLoaded(item.key);
          const inWeek = week && visibleDays.some(visible => visible.key === item.key) && item.key !== day.key;
          return (
            <button
              type="button"
              key={item.key}
              aria-current={item.key === day.key ? "date" : undefined}
              data-week={inWeek || undefined}
              data-empty={(count === 0 && !pending) || undefined}
              aria-label={pending ? `${item.full}, sessions not loaded yet` : `${item.full}, ${count} ${count === 1 ? "session" : "sessions"}`}
              onClick={() => navigate({ date: item.key, book: null })}
            >
              <span>{item.key === allDays[0]?.key && !startsLater ? "Today" : item.label}</span>
              <strong>{dayNumber(item)}</strong>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </nav>
    </div>
    <div className="sf-schedule-top sf-stack">
      <div className="sf-controls">
        <div className="sf-seg" role="group" aria-label="Schedule view">
          <button type="button" aria-pressed={!week} onClick={() => navigate({ view: null })}>Day</button>
          <button type="button" aria-pressed={week} onClick={() => navigate({ view: "week" })}>Week</button>
        </div>
        <button type="button" className="sf-btn sf-filter-toggle" data-variant="secondary" data-size="sm" aria-expanded={filtersOpen} aria-controls="schedule-filters" onClick={() => setFiltersOpen(open => !open)}>
          <SlidersHorizontal aria-hidden="true" />Filters{activeFilters.length ? ` · ${activeFilters.length}` : ""}
        </button>
      </div>
      {activeFilters.length ? (
        <div className="sf-chips" aria-label="Active filters">
          {activeFilters.map(filter => (
            <button key={filter.key} type="button" className="sf-chip" onClick={() => navigate({ [filter.key]: null, book: null })} aria-label={`Remove filter ${filter.label}`}>
              {filter.label}<X aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="sf-btn" data-variant="ghost" data-size="sm" onClick={() => navigate(clearFilters)}>Clear all</button>
        </div>
      ) : null}
    </div>

    <div className="sf-schedule-rail">
      <form id="schedule-filters" className="sf-filters" data-open={filtersOpen || undefined} aria-label="Filter sessions" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setFiltersOpen(false); navigate({ q: String(data.get("q") || ""), coach: String(data.get("coach") || ""), format: String(data.get("format") || ""), availability: String(data.get("availability") || ""), book: null }); }}>
        <h2>Filters</h2>
        <label className="sf-field">Search<input key={filters.q} name="q" type="search" defaultValue={filters.q} placeholder="Class, coach or level" /></label>
        <label className="sf-field">Coach<select key={filters.coach} name="coach" defaultValue={filters.coach}><option value="">All coaches</option>{coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="sf-field">Class<select key={filters.format} name="format" defaultValue={filters.format}><option value="">All classes</option>{formats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="sf-field">Availability<select key={filters.availability} name="availability" defaultValue={filters.availability}><option value="">Include full sessions</option><option value="open">Spaces available</option></select></label>
        <button className="sf-btn" data-block type="submit">Apply</button>
      </form>
    </div>

    <div className="sf-schedule-list sf-stack" data-gap="lg">
      {bookingId && !selectedClass ? (
        <Banner tone="warn" title="This session is no longer on the schedule." action={<Link className="sf-link" href="/account/bookings">Your bookings</Link>} />
      ) : null}

      {week ? (
        <>
          <div className="sf-weekgrid" aria-label="Week view">
            {visibleDays.map(item => {
              const sessions = sessionsFor(item.key);
              return (
                <section key={item.key} className="sf-weekcol" aria-label={item.full} data-today={item.key === allDays[0]?.key || undefined}>
                  <header><strong>{item.key === allDays[0]?.key && !startsLater ? "Today" : item.label}</strong><span>{dayNumber(item)}</span></header>
                  {sessions.length ? sessions.map(session => (
                    <button key={session.id} type="button" className="sf-block" onClick={event => openBooking(session, event.currentTarget)} aria-label={bookLabel(session)}>
                      <time dateTime={session.date}>{session.time}</time>
                      <strong>{session.name}</strong>
                      <SessionState spots={session.spots} capacity={session.capacity} waitlist={session.waitlist} />
                    </button>
                  )) : <p>{notLoaded(item.key) ? "Not loaded yet" : filtering ? "No matches" : "No sessions"}</p>}
                </section>
              );
            })}
          </div>
          <div className="sf-week-stack">{visibleDays.map(dayList)}</div>
        </>
      ) : visibleDays.map(dayList)}

      {truncated ? (
        <p className="sf-meta">
          {canContinue ? <>Sessions are shown up to {allDays.find(item => item.key === loadedThroughKey)?.full ?? "a later date"}. <button type="button" className="sf-link" onClick={() => navigate({ from: loadedThroughKey, date: loadedThroughKey, book: null })}>Show sessions from that date</button></> : "This date has more sessions than can be shown at once. Filter by class or coach to see them all."}
        </p>
      ) : null}
      {startsLater ? <p className="sf-meta"><button type="button" className="sf-link" onClick={() => navigate({ from: null, date: null, book: null })}>Back to today</button></p> : null}
    </div>

    {selectedClass ? <ClassBookingModal key={selectedClass.id} isOpen onClose={() => navigate({ book: null })} classData={{ ...selectedClass, date: selectedClass.dateLabel }} viewer={viewer} onBookingSuccess={() => router.refresh()} onReturnFocus={() => { (bookingTrigger.current || document.querySelector<HTMLButtonElement>(".sf-dates [aria-current]"))?.focus(); }} /> : null}
  </section>;
}
