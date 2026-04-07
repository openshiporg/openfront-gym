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
  difficulty?: string;
  room?: string;
};

export default function WeeklySchedule({ scheduleData = [] }: { scheduleData?: ScheduleItem[] }) {
  const today = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(today);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(null);

  const dayClasses = scheduleData
    .filter((c) => c.day === selectedDay)
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div>
      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {DAYS_SHORT.map((label, i) => {
          const active = i === selectedDay;
          const count = scheduleData.filter((c) => c.day === i).length;
          const isToday = i === today;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelectedDay(i)}
              className={`relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 border-b-2 transition-all ${
                active
                  ? "border-[#818cf8] bg-[#252525] text-white"
                  : "border-transparent bg-[#1c1b1b] text-[#c4c7c7] hover:bg-[#222]"
              }`}
            >
              {isToday && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#818cf8]" />
              )}
              <span className={`text-[9px] font-bold uppercase tracking-[0.22em] ${active ? "text-[#818cf8]" : ""}`}>
                {label}
              </span>
              <span className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black tracking-[-0.06em]">
                {count}
              </span>
              <span className={`text-[8px] uppercase tracking-widest ${count > 0 ? "text-[#c4c7c7]" : "text-[#555]"}`}>
                {count === 1 ? "class" : "classes"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day heading */}
      <div className="mt-10 mb-6 flex items-end justify-between gap-6">
        <div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
            {DAYS_FULL[selectedDay]}
          </h2>
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">
            {dayClasses.length === 0 ? "No sessions programmed" : `${dayClasses.length} session${dayClasses.length > 1 ? "s" : ""} live`}
          </p>
        </div>
      </div>

      {dayClasses.length === 0 ? (
        <div className="bg-[#1c1b1b] px-6 py-16 text-center text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
          No classes scheduled for this day.
        </div>
      ) : (
        <div className="space-y-1">
          {dayClasses.map((cls, index) => {
            const isFull = cls.spots <= 0;
            const fillPct = cls.capacity > 0 ? Math.round(((cls.capacity - cls.spots) / cls.capacity) * 100) : 0;
            return (
              <div
                key={`${cls.id}-${cls.time}`}
                className={`group flex flex-col md:flex-row md:items-stretch ${
                  index === 0 ? "bg-[#1c1b1b]" : "bg-[#191919] border border-white/[0.07]"
                }`}
              >
                {/* Time column */}
                <div
                  className={`w-full shrink-0 px-6 py-5 md:w-36 md:border-r ${
                    index === 0 ? "border-[#818cf8]/20 bg-[#818cf8]/[0.08]" : "border-white/10"
                  }`}
                >
                  <div
                    className={`font-[family-name:var(--font-space-grotesk)] text-2xl font-black tracking-[-0.04em] ${
                      index === 0 ? "text-[#818cf8]" : "text-white"
                    }`}
                  >
                    {cls.time}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">
                    {cls.duration} min
                  </div>
                </div>

                {/* Class info */}
                <div className="flex flex-1 flex-col justify-between gap-4 px-6 py-5 md:flex-row md:items-center">
                  <div>
                    <h3 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                      {cls.name}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs uppercase tracking-[0.16em] text-[#c4c7c7]">
                      <span>{cls.instructor}</span>
                      <span>{isFull ? "Waitlist only" : `${cls.spots} spots left`}</span>
                    </div>
                    {/* Capacity bar */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1 w-24 overflow-hidden bg-white/10">
                        <div
                          className="h-full bg-[linear-gradient(90deg,#818cf8,#4f46e5)]"
                          style={{ width: `${Math.min(fillPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#c4c7c7]">
                        {fillPct}% full
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClass(cls);
                      setBookingModalOpen(true);
                    }}
                    className={`shrink-0 px-7 py-3.5 text-xs font-bold uppercase tracking-[0.22em] transition-all active:scale-95 ${
                      isFull
                        ? "border border-[#818cf8] text-[#818cf8] hover:bg-[#818cf8]/10"
                        : "bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] text-white"
                    }`}
                  >
                    {isFull ? "Join waitlist" : "Book slot"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedClass && (
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
            date: DAYS_FULL[selectedDay],
          }}
          onBookingSuccess={() => {}}
        />
      )}
    </div>
  );
}
