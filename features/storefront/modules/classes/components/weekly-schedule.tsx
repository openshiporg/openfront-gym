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
      <div className="flex gap-2 overflow-x-auto pb-2">
        {DAYS_SHORT.map((label, i) => {
          const active = i === selectedDay;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelectedDay(i)}
              className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center transition-colors ${
                active ? "bg-[#353535] text-[#ffb59e] border-b-4 border-[#ffb59e]" : "bg-[#1c1b1b] text-[#c4c7c7] hover:bg-[#2a2a2a]"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.24em]">{label}</span>
              <span className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black tracking-[-0.06em]">
                {scheduleData.filter((c) => c.day === i).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-10 mb-8 flex items-end justify-between gap-6">
        <div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
            {DAYS_FULL[selectedDay]}
          </h2>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">
            {dayClasses.length === 0 ? "No sessions programmed" : `${dayClasses.length} sessions live`}
          </p>
        </div>
      </div>

      {dayClasses.length === 0 ? (
        <div className="bg-[#1c1b1b] px-6 py-16 text-center text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
          No classes scheduled for this day.
        </div>
      ) : (
        <div className="space-y-4">
          {dayClasses.map((cls, index) => {
            const isFull = cls.spots <= 0;
            return (
              <div key={`${cls.id}-${cls.time}`} className={`flex flex-col md:flex-row md:items-center ${index === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"}`}>
                <div className={`w-full md:w-44 px-8 py-6 ${index === 0 ? "bg-[#00eefc] text-[#00363a]" : "bg-transparent text-white md:border-r md:border-white/10"}`}>
                  <div className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black tracking-[-0.06em]">{cls.time}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.22em] ${index === 0 ? "text-[#004f54]" : "text-[#c4c7c7]"}`}>
                    {cls.duration} min
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-between gap-6 px-8 py-6 md:flex-row md:items-center">
                  <div>
                    <h3 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                      {cls.name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
                      <span>{cls.instructor}</span>
                      <span>{isFull ? "Waitlist only" : `${cls.spots} spots left`}</span>
                      <span>{cls.capacity} total capacity</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClass(cls);
                      setBookingModalOpen(true);
                    }}
                    className={`px-8 py-4 text-xs font-bold uppercase tracking-[0.22em] transition-transform active:scale-95 ${
                      isFull
                        ? "border border-[#ffb59e] text-[#ffb59e] hover:bg-[#ffb59e]/10"
                        : "bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] text-[#3a0b00]"
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
