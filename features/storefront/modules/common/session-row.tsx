import type { ReactNode } from "react";
import Link from "next/link";
import { bookingReturnPath } from "@/features/storefront/lib/return-path";
import { SessionState, SessionTime } from "./training";

export type SessionRowProps = {
  time: string;
  startsAt: string;
  caption?: ReactNode;
  title: string;
  titleHref?: string;
  meta?: ReactNode;
  note?: ReactNode;
  spots: number;
  capacity: number;
  waitlist?: number;
  action: ReactNode;
};

/** One dated session: time, title line with its live state, meta line, and the booking action. */
export function SessionRow({ time, startsAt, caption, title, titleHref, meta, note, spots, capacity, waitlist, action }: SessionRowProps) {
  return (
    <article className="sf-session">
      <div className="sf-session-time">
        <SessionTime value={time} dateTime={startsAt} />
        {caption ? <span>{caption}</span> : null}
      </div>
      <div className="sf-session-body">
        <div className="sf-titleline">
          <h3>{titleHref ? <Link href={titleHref}>{title}</Link> : title}</h3>
          <SessionState spots={spots} capacity={capacity} waitlist={waitlist} />
        </div>
        {meta ? <div className="sf-session-meta">{meta}</div> : null}
        {note ? <p className="sf-session-note">{note}</p> : null}
      </div>
      <div className="sf-session-action">{action}</div>
    </article>
  );
}

/** Link into the schedule booking review for a dated occurrence. */
export function BookSessionLink({ id, name, spots, accent = true }: { id: string; name: string; spots: number; accent?: boolean }) {
  const open = spots > 0;
  return (
    <Link href={bookingReturnPath(id)} className="sf-btn" data-size="sm" data-variant={open ? (accent ? "accent" : undefined) : "secondary"}>
      {open ? "Book" : "Waitlist"}
      <span className="sr-only"> {name}</span>
    </Link>
  );
}
