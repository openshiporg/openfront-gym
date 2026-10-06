"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { discoveryHref, matchesSession } from "@/features/storefront/lib/discovery";
import ClassBookingModal from "./class-booking-modal";

type ScheduleItem = {
  time: string; name: string; instructor: string; instructorId?: string;
  classTypeId?: string; duration: number; spots: number; capacity: number;
  id: string; isBookable?: boolean; difficulty?: string; date: string;
  dateKey: string; dateLabel: string; location: string;
};
type Day = { key: string; label: string; short: string; full: string };

export default function WeeklySchedule({ scheduleData, days, timeZone }: {
  scheduleData: ScheduleItem[]; days: Day[]; timeZone: string; initialBookingId?: string;
}) {
  const router = useRouter();
  const bookingTrigger = useRef<HTMLButtonElement | null>(null);
  const params = useSearchParams() ?? new URLSearchParams();
  const navigate = (changes: Record<string, string | null>) => router.push(discoveryHref("/schedule", params.toString(), changes), { scroll: false });
  const bookingId = params.get("book");
  const selectedClass = scheduleData.find(item => item.id === bookingId);
  if (selectedClass && !days.some(day => day.key === selectedClass.dateKey)) {
    days = [...days, { key: selectedClass.dateKey, label: "Selected", short: selectedClass.dateLabel, full: selectedClass.dateLabel }];
  }
  const requestedDay = params.get("date") || selectedClass?.dateKey;
  const day = days.find(item => item.key === requestedDay) || days[0];
  const week = params.get("view") === "week";
  const filters = { q: params.get("q") || "", coach: params.get("coach") || "", format: params.get("format") || "", availability: params.get("availability") || "" };
  const matched = scheduleData.filter(item => matchesSession(item, filters));
  const weekStart = Math.floor(Math.max(0, days.findIndex(item => item.key === day.key)) / 7) * 7;
  const visibleDays = week ? days.slice(weekStart, weekStart + 7) : [day];
  const coaches = [...new Map(scheduleData.filter(item => item.instructorId).map(item => [item.instructorId!, item.instructor])).entries()];
  const formats = [...new Map(scheduleData.filter(item => item.classTypeId).map(item => [item.classTypeId!, item.name])).entries()];
  return <section aria-label="Find a class" className="sf-timetable">
    <form className="sf-discovery-filters" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); navigate({ q: String(data.get("q") || ""), coach: String(data.get("coach") || ""), format: String(data.get("format") || ""), availability: String(data.get("availability") || ""), book: null }); }}>
      <label>Search sessions<input key={filters.q} name="q" type="search" defaultValue={filters.q} placeholder="Class, coach or level" /></label>
      <label>Coach<select key={filters.coach} name="coach" defaultValue={filters.coach}><option value="">All coaches</option>{coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Class format<select key={filters.format} name="format" defaultValue={filters.format}><option value="">All formats</option>{formats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Availability<select key={filters.availability} name="availability" defaultValue={filters.availability}><option value="">Include waitlists</option><option value="open">Spaces available</option></select></label>
      <button className="sf-btn-primary" type="submit">Find sessions</button>
    </form>
    <div className="sf-toolbar"><p>All times in <strong>{timeZone}</strong>. Next 14 dates, plus any session opened from a booking link.</p><div className="sf-segmented" aria-label="Schedule view"><button type="button" aria-pressed={!week} onClick={() => navigate({ view: null })}>Day</button><button type="button" aria-pressed={week} onClick={() => navigate({ view: "week" })}>Week</button></div></div>
    <nav className="sf-date-strip" aria-label="Choose a date">{days.map(item => <button type="button" key={item.key} aria-current={item.key === day.key ? "date" : undefined} onClick={() => navigate({ date: item.key, book: null })}><span>{item.label}</span><strong>{item.short}</strong><small>{matched.filter(session => session.dateKey === item.key).length} sessions</small></button>)}</nav>
    {bookingId && !selectedClass && <div className="sf-notice" role="status"><strong>This session is no longer in the published timetable.</strong><p>Choose another session below, or check your bookings for an existing reservation.</p><a className="sf-link" href="/account/bookings">Your bookings →</a></div>}
    {visibleDays.map(item => {
      const sessions = matched.filter(session => session.dateKey === item.key).sort((a,b) => a.date.localeCompare(b.date));
      return <section key={item.key} className="sf-day-section" aria-label={item.full}><div className="sf-section-heading"><h2>{item.full}</h2><span>{sessions.length} sessions</span></div>
        {sessions.length ? <div className="sf-session-list">{sessions.map(session => <article className="sf-session-row" key={session.id}>
          <div className="sf-session-time"><time dateTime={session.date}>{session.time}</time><span>Typically {session.duration} min</span></div>
          <div><h3>{session.name}</h3><p>{session.instructor} {session.difficulty ? `· ${session.difficulty}` : ""}</p><p className="sf-session-location">{session.location}</p></div>
          <div className="sf-session-availability"><span className={`sf-badge ${session.spots > 0 ? "sf-badge-positive" : ""}`}>{session.spots > 0 ? `${session.spots} spaces` : "Waitlist available"}</span><button type="button" className={session.spots > 0 ? "sf-btn-primary" : "sf-btn-secondary"} onClick={event => { bookingTrigger.current = event.currentTarget; navigate({ book: session.id, date: session.dateKey }); }} aria-label={`${session.spots > 0 ? "Book" : "Join waitlist for"} ${session.name}, ${session.dateLabel}, ${session.time}`}>{session.spots > 0 ? "Book session" : "Join waitlist"}</button></div>
        </article>)}</div> : <div className="sf-empty"><h3>{scheduleData.some(session => session.dateKey === item.key) ? "No sessions match these filters" : "No sessions published for this date"}</h3><p>Try another date or explore the full timetable.</p><button className="sf-btn-secondary" onClick={() => navigate({ q: null, coach: null, format: null, availability: null, view: "week", book: null })}>Show all sessions this week</button></div>}
      </section>;
    })}
    {scheduleData.length >= 100 && <p className="sf-muted">Showing up to 100 published sessions. Contact the club if you cannot find a session.</p>}
    <p className="sf-muted mt-6">Spaces and eligibility are checked when you book. Joining a waitlist does not reserve a space. Check your bookings for promotion or changes.</p>
    {selectedClass && <ClassBookingModal key={selectedClass.id} isOpen onClose={() => navigate({ book: null })} classData={{ ...selectedClass, date: selectedClass.dateLabel }} onBookingSuccess={() => router.refresh()} onReturnFocus={() => { (bookingTrigger.current || document.querySelector<HTMLButtonElement>(".sf-date-strip button[aria-current]"))?.focus(); }} />}
  </section>;
}
