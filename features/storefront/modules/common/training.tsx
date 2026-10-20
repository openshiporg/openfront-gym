import { difficultyLabel } from "@/features/storefront/lib/presentation";

/**
 * Presentational gym primitives. Every value comes from the server availability projection;
 * nothing here decides whether a session can be booked.
 */

export function capacityState(spots: number, capacity: number) {
  if (spots <= 0) return "full" as const;
  if (spots <= 3 || (capacity > 0 && spots / capacity <= 0.2)) return "low" as const;
  return "open" as const;
}

const TONE = { open: "ok", low: "low", full: "full" } as const;

/** Inline status dot + short state. Place it on the title line. */
export function SessionState({ spots, capacity, waitlist, long = false }: { spots: number; capacity: number; waitlist?: number; long?: boolean }) {
  const open = Math.max(0, spots);
  const state = capacityState(open, Math.max(0, capacity));
  const label = state === "full"
    ? waitlist ? `Full · ${waitlist} waiting` : "Full"
    : long ? `${open} of ${capacity} spaces left` : `${open} left`;
  const description = state === "full"
    ? `Full${waitlist ? `, ${waitlist} on the waitlist` : ""}. Waitlist open.`
    : `${open} of ${capacity} spaces left.`;
  return (
    <span className="sf-state" data-tone={TONE[state]}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}

export function LevelTag({ difficulty }: { difficulty?: string | null }) {
  const label = difficultyLabel(difficulty);
  return label ? <span>{label}</span> : null;
}

/** "6:00 AM" → 6:00 with a small meridiem, keeping the club-timezone string intact for screen readers. */
export function SessionTime({ value, dateTime }: { value: string; dateTime?: string }) {
  const match = value.match(/^(.*?)\s?(AM|PM)$/i);
  return (
    <time dateTime={dateTime} aria-label={value}>
      {match ? <>{match[1]}<small>{match[2].toUpperCase()}</small></> : value}
    </time>
  );
}
