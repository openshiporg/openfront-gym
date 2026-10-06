import { Suspense } from "react";
import { Metadata } from "next";
import WeeklySchedule from "@/features/storefront/modules/classes/components/weekly-schedule";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getUpcomingClassOccurrences, getClassOccurrenceById } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import {
  formatOccurrenceDate,
  formatOccurrenceShortDate,
  formatOccurrenceTime,

} from "@/features/storefront/lib/class-occurrence";

import { calendarDays, localDateKey } from "@/features/storefront/lib/discovery";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Schedule — ${getStorefrontBrandName(config)}`,
    description: "View the weekly class schedule and book your spot.",
  };
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  return endHour * 60 + endMin - (startHour * 60 + startMin);
}

export async function SchedulePage({ book }: { book?: string } = {}) {
  const [occurrences, config] = await Promise.all([
    getUpcomingClassOccurrences({ days: 14 }),
    getStorefrontConfig(),
  ]);
  if (book && !occurrences.some(item => item.id === book)) {
    const selected = await getClassOccurrenceById(book);
    if (selected) occurrences.push(selected);
  }
  const timeZone = config?.timezone || "UTC";
  const location = "Session location not published · confirm with the club";
  const scheduleData = occurrences.map((occurrence) => ({
    dateKey: localDateKey(occurrence.startsAt, timeZone),
    instructorId: occurrence.instructor?.id,
    classTypeId: occurrence.classType?.id,
    time: formatOccurrenceTime(occurrence.startsAt, timeZone),
    date: occurrence.startsAt,
    dateLabel: formatOccurrenceDate(occurrence.startsAt, timeZone),
    shortDateLabel: formatOccurrenceShortDate(occurrence.startsAt, timeZone),
    name: occurrence.name || occurrence.classType?.name || "Class",
    instructor: occurrence.instructor?.name || "Instructor not published",
    duration:
      occurrence.classType?.duration ||
      calculateDuration(occurrence.startTime, occurrence.endTime),
    spots: occurrence.availability.spotsRemaining,
    capacity: occurrence.availability.maxCapacity,
    id: occurrence.id,
    isBookable: true,
    difficulty: occurrence.classType?.difficulty,
    location,
  }));

  return (
    <div className="sf-page">
      <div className="sf-container">
        <header className="mb-12 max-w-3xl">
          <p className="sf-eyebrow mb-3">Class calendar</p>
          <h1 className="sf-display text-5xl sm:text-6xl">
            Make time to train
          </h1>
          <p className="mt-5 sf-lead">
            Find your next session. Compare times, meet your coach and choose a space that fits your day.
          </p>
        </header>

        <Suspense fallback={<p role="status" className="sf-notice">Loading the timetable…</p>}><WeeklySchedule scheduleData={scheduleData} days={calendarDays(new Date(), timeZone)} timeZone={timeZone} initialBookingId={book} /></Suspense>
      </div>
    </div>
  );
}
