import { Metadata } from "next";
import WeeklySchedule from "@/features/storefront/modules/classes/components/weekly-schedule";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import {
  formatOccurrenceDate,
  formatOccurrenceShortDate,
  formatOccurrenceTime,
  occurrenceDayIndex,
} from "@/features/storefront/lib/class-occurrence";

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
    getUpcomingClassOccurrences({ days: 7 }),
    getStorefrontConfig(),
  ]);
  const timeZone = config?.timezone || "UTC";
  const location = config?.address || config?.locationName || "Main studio";
  const scheduleData = occurrences.map((occurrence) => ({
    day: occurrenceDayIndex(occurrence.startsAt, timeZone),
    time: formatOccurrenceTime(occurrence.startsAt, timeZone),
    date: occurrence.startsAt,
    dateLabel: formatOccurrenceDate(occurrence.startsAt, timeZone),
    shortDateLabel: formatOccurrenceShortDate(occurrence.startsAt, timeZone),
    name: occurrence.name || occurrence.classType?.name || "Class",
    instructor: occurrence.instructor?.name || "Instructor TBD",
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
            This week&apos;s bookable schedule
          </h1>
          <p className="mt-5 sf-lead">
            Pick a day, check capacity, and reserve through the existing member booking flow.
          </p>
        </header>

        <WeeklySchedule key={book || "schedule"} scheduleData={scheduleData} initialBookingId={book} />
      </div>
    </div>
  );
}
