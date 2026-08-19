"use client";

import { useState } from "react";
import ClassBookingModal from "./class-booking-modal";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ScheduleItem = {
  day: number;
  time: string;
  name: string;
  instructor: string;
  duration: number;
  spots: number;
  capacity: number;
  id: string;
  isBookable?: boolean;
  difficulty?: string;
  date: string;
  dateLabel: string;
  shortDateLabel: string;
  location: string;
};

export default function WeeklySchedule({
  scheduleData = [],
  initialBookingId,
}: {
  scheduleData?: ScheduleItem[];
  initialBookingId?: string;
}) {
  const today = new Date().getDay();
  const initialClass = scheduleData.find(
    (item) => item.id === initialBookingId && item.isBookable !== false,
  ) ?? null;
  const [selectedDay, setSelectedDay] = useState(
    () => initialClass?.day ?? scheduleData.find((item) => item.day === today)?.day ?? scheduleData[0]?.day ?? today,
  );
  const [bookingModalOpen, setBookingModalOpen] = useState(Boolean(initialClass));
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(initialClass);

  const dayClasses = scheduleData
    .filter((c) => c.day === selectedDay)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-rule)] pb-px">
        {DAYS_SHORT.map((label, i) => {
          const active = i === selectedDay;
          const count = scheduleData.filter((c) => c.day === i).length;
          const isToday = i === today;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelectedDay(i)}
              className={`relative flex min-w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 border-b-2 px-3 py-4 transition ${
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-paper-2)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-paper-2)]"
              }`}
            >
              {isToday ? (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
              ) : null}
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
              <span className="text-sm font-semibold">{scheduleData.find((item) => item.day === i)?.shortDateLabel ?? "—"}</span>
              <span className="text-[10px] text-[var(--color-ink-muted)]">{count} session{count === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-10 mb-6">
        <h2 className="text-2xl font-semibold text-[var(--color-ink)]">
          {dayClasses[0]?.dateLabel ?? DAYS_FULL[selectedDay]}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {dayClasses.length === 0
            ? "No sessions scheduled"
            : `${dayClasses.length} session${dayClasses.length > 1 ? "s" : ""} available`}
        </p>
      </div>

      {dayClasses.length === 0 ? (
        <div className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-16 text-center text-sm text-[var(--color-ink-muted)]">
          No classes scheduled for this day.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
          {dayClasses.map((cls) => {
            const isFull = cls.spots <= 0;
            const isBookable = cls.isBookable !== false;
            const fillPct = cls.capacity > 0 ? Math.round(((cls.capacity - cls.spots) / cls.capacity) * 100) : 0;
            return (
              <div
                key={`${cls.id}-${cls.time}`}
                className="grid gap-4 py-6 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-center"
              >
                <div>
                  <p className="text-2xl font-medium text-[var(--color-accent)]">{cls.time}</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{cls.duration} min</p>
                </div>

                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[var(--color-ink)]">{cls.name}</h3>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    {cls.instructor} · {cls.location}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    {!isBookable ? "Next date pending" : isFull ? "Waitlist only" : `${cls.spots} spots left`}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1 w-24 overflow-hidden bg-[var(--color-paper-3)]">
                      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${Math.min(fillPct, 100)}%` }} />
                    </div>
                    <span className="text-xs text-[var(--color-ink-faint)]">{fillPct}% full</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!isBookable) return;
                    setSelectedClass(cls);
                    setBookingModalOpen(true);
                  }}
                  disabled={!isBookable}
                  className={`shrink-0 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                    !isBookable
                      ? "cursor-not-allowed border border-[var(--color-rule)] text-[var(--color-ink-faint)]"
                      : isFull
                        ? "border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                        : "bg-[var(--color-accent)] text-[var(--color-accent-on)] hover:brightness-110"
                  }`}
                >
                  {!isBookable ? "Date pending" : isFull ? "Waitlist" : "Book"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedClass ? (
        <ClassBookingModal
          isOpen={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          classData={{
            id: selectedClass.id,
            name: selectedClass.name,
            instructor: selectedClass.instructor,
            time: selectedClass.time,
            duration: selectedClass.duration,
            spots: selectedClass.spots,
            capacity: selectedClass.capacity,
            difficulty: selectedClass.difficulty,
            date: selectedClass.dateLabel,
            location: selectedClass.location,
            isBookable: selectedClass.isBookable,
          }}
          onBookingSuccess={() => {}}
        />
      ) : null}
    </div>
  );
}
