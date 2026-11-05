"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarSearch, ChevronRight } from "lucide-react";
import { SessionTime } from "@/features/storefront/modules/common/training";

export type HomeDay = { key: string; label: string; day: string; full: string; today: boolean };
export type HomeSession = {
  id: string;
  time: string;
  startsAt: string;
  name: string;
  coach: string | null;
  classHref: string | null;
  /** The class type's photo, when one ships for it; otherwise the card keeps its dark fill. */
  photo?: string | null;
  bookHref: string;
  spots: number;
};

/**
 * Phone "Today's schedule": a day picker over the club's next seven days and a timeline of that
 * day's dated sessions. Booking stays on /schedule (the server-checked review sheet).
 */
export default function HomeDaySchedule({ days, sessions, initialKey }: { days: HomeDay[]; sessions: Record<string, HomeSession[]>; initialKey: string }) {
  const [selected, setSelected] = useState(initialKey);
  const day = days.find((item) => item.key === selected) ?? days[0];
  const list = sessions[day?.key ?? ""] ?? [];

  return (
    <section className="sf-rg-today" aria-labelledby="home-today">
      <div className="sf-rg-head">
        <h2 id="home-today">{day?.today ? "Today’s schedule" : day?.full}</h2>
        <Link href={`/schedule?date=${day?.key ?? ""}`} className="sf-rg-more">View full schedule<ChevronRight aria-hidden="true" /></Link>
      </div>
      <div className="sf-rg-days" role="group" aria-label="Choose a day">
        {days.map((item) => (
          <button key={item.key} type="button" aria-pressed={item.key === day?.key} onClick={() => setSelected(item.key)} aria-label={`${item.full}, ${(sessions[item.key] ?? []).length} sessions`}>
            <span>{item.label}</span>
            <strong>{item.day}</strong>
          </button>
        ))}
      </div>
      {list.length ? (
        <ol className="sf-rg-timeline">
          {list.map((session) => (
            <li key={session.id}>
              <div className="sf-rg-class" data-photo={session.photo ? "" : undefined}>
                {session.photo ? <Image className="sf-rg-class-photo" src={session.photo} alt="" fill sizes="(max-width: 899px) 100vw, 1px" unoptimized /> : null}
                <div className="sf-rg-class-top">
                  <span className="sf-rg-class-time"><SessionTime value={session.time} dateTime={session.startsAt} /></span>
                  <Link href={session.bookHref} className="sf-rg-book">
                    {session.spots > 0 ? "Book now" : "Waitlist"}<ChevronRight aria-hidden="true" />
                    <span className="sr-only"> {session.name}, {session.time}</span>
                  </Link>
                </div>
                <strong>{session.classHref ? <Link href={session.classHref}>{session.name}</Link> : session.name}</strong>
                {session.coach ? <span>with {session.coach}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sf-rg-none">
          <CalendarSearch aria-hidden="true" />
          <p>No sessions on {day?.full ?? "this day"}.</p>
          <Link href="/schedule" className="sf-rg-more">Full schedule<ChevronRight aria-hidden="true" /></Link>
        </div>
      )}
    </section>
  );
}
