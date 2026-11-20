"use client";

import { useState } from "react";
import Link from "next/link";
import { SessionTime } from "@/features/storefront/modules/common/training";

export type HomeDay = { key: string; label: string; day: string; full: string; today: boolean };
export type HomeSession = {
  id: string;
  time: string;
  startsAt: string;
  name: string;
  coach: string | null;
  classHref: string | null;
  bookHref: string;
  spots: number;
};

/**
 * Home "This week": a day picker over the club's next seven days and that day's dated sessions as
 * plain rows. Booking stays on /schedule (the server-checked review sheet).
 */
export default function HomeDaySchedule({ days, sessions, initialKey }: { days: HomeDay[]; sessions: Record<string, HomeSession[]>; initialKey: string }) {
  const [selected, setSelected] = useState(initialKey);
  const day = days.find((item) => item.key === selected) ?? days[0];
  const list = sessions[day?.key ?? ""] ?? [];

  return (
    <div className="sf-home-week">
      <div className="sf-home-days" role="group" aria-label="Choose a day">
        {days.map((item) => {
          const count = (sessions[item.key] ?? []).length;
          return (
            <button key={item.key} type="button" aria-pressed={item.key === day?.key} onClick={() => setSelected(item.key)} aria-label={`${item.full}, ${count} ${count === 1 ? "session" : "sessions"}`}>
              <span>{item.today ? "Today" : item.label}</span>
              <strong>{item.day}</strong>
            </button>
          );
        })}
      </div>
      {list.length ? (
        <ol className="sf-home-sessions" aria-label={day?.full}>
          {list.map((session) => (
            <li key={session.id}>
              <SessionTime value={session.time} dateTime={session.startsAt} />
              <div>
                <strong>{session.classHref ? <Link href={session.classHref}>{session.name}</Link> : session.name}</strong>
                {session.coach ? <span>{session.coach}</span> : null}
              </div>
              <span className="sf-home-spots">{session.spots > 0 ? `${session.spots} ${session.spots === 1 ? "spot" : "spots"} left` : "Full"}</span>
              <Link href={session.bookHref} className="sf-btn" data-size="sm" data-variant={session.spots > 0 ? "accent" : "secondary"}>
                {session.spots > 0 ? "Book" : "Waitlist"}
                <span className="sr-only"> {session.name}, {day?.full}, {session.time}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sf-home-none">No sessions on {day?.full ?? "this day"}. <Link className="sf-link" href="/schedule">Full schedule</Link></p>
      )}
    </div>
  );
}
