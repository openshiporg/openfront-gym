import { Suspense } from "react";
import { Metadata } from "next";
import WeeklySchedule from "@/features/storefront/modules/classes/components/weekly-schedule";
import { getUpcomingClassOccurrencePage, getClassOccurrenceById, getClassTypes } from "@/features/storefront/lib/data/classes";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { localDateStart } from "@/lib/timezone";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getUser } from "@/features/storefront/lib/data/user";
import { getUpcomingBookingsBefore } from "@/features/storefront/lib/data/bookings";
import { getParticipationStatus } from "@/features/storefront/lib/data/participation";
import type { BookingViewer } from "@/features/storefront/modules/classes/components/class-booking-modal";
import {
  formatOccurrenceDate,
  formatOccurrenceShortDate,
  formatOccurrenceTime,
} from "@/features/storefront/lib/class-occurrence";
import { calendarDays, localDateKey } from "@/features/storefront/lib/discovery";
import { PageHead } from "@/features/storefront/modules/common/page-head";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Schedule",
    description: "Dated classes for the next two weeks, with live spaces and booking.",
  };
}

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  return endHour * 60 + endMin - (startHour * 60 + startMin);
}

const param = (value: string | string[] | undefined, max = 200) => (typeof value === "string" ? value.slice(0, max) : "");

export async function SchedulePage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> } = {}) {
  const book = param(searchParams.book) || undefined;
  // Coach, class and search filters are applied by the server before its read limit, so a
  // matching session is never hidden behind unrelated ones. Availability depends on live seats
  // and is applied to the complete loaded window in the browser.
  const filters = { coach: param(searchParams.coach), format: param(searchParams.format), q: param(searchParams.q, 100) };
  const config = await getStorefrontConfig();
  const zone = config?.timezone || "UTC";
  const fromKey = param(searchParams.from, 10);
  let windowStart: Date | undefined;
  try { windowStart = /^\d{4}-\d{2}-\d{2}$/.test(fromKey) ? localDateStart(fromKey, zone) : undefined; } catch { windowStart = undefined; }
  if (windowStart && windowStart <= new Date()) windowStart = undefined;
  const [{ occurrences, truncated, loadedThrough }, user, coachOptions, formatOptions] = await Promise.all([
    getUpcomingClassOccurrencePage({ days: 14, from: windowStart?.toISOString(), instructorId: filters.coach || undefined, classTypeId: filters.format || undefined, search: filters.q || undefined }),
    getUser(),
    getInstructors().catch(() => []),
    getClassTypes().catch(() => []),
  ]);
  const membershipStatus = user?.membership?.status;
  const [upcoming, participation] = user?.id && user.organization?.id
    ? await Promise.all([getUpcomingBookingsBefore(new Date(Date.now() + 15 * 86_400_000).toISOString()).catch(() => []), getParticipationStatus()])
    : [[], null];
  const terms = config?.participationTerms;
  const viewer: BookingViewer = {
    signedIn: Boolean(user),
    membership: membershipStatus === "active" ? "active" : membershipStatus === "frozen" || membershipStatus === "past-due" ? "attention" : "none",
    signupsAllowed: process.env.PUBLIC_MEMBER_SIGNUPS_ALLOWED === "true",
    terms: terms?.acceptanceRequired ? { policyId: terms.policyId, version: terms.version } : null,
    participation,
    bookings: Object.fromEntries(upcoming.filter((booking: any) => booking.classInstance?.id).map((booking: any) => [
      booking.classInstance.id,
      { status: booking.status === "waitlist" ? "waitlist" : "confirmed", waitlistPosition: booking.waitlistPosition ?? null },
    ])),
  };
  if (book && !occurrences.some(item => item.id === book)) {
    const selected = await getClassOccurrenceById(book);
    if (selected) occurrences.push(selected);
  }
  const timeZone = zone;
  const scheduleData = occurrences.map((occurrence) => ({
    dateKey: localDateKey(occurrence.startsAt, timeZone),
    instructorId: occurrence.instructor?.id,
    classTypeId: occurrence.classType?.id,
    time: formatOccurrenceTime(occurrence.startsAt, timeZone),
    date: occurrence.startsAt,
    dateLabel: formatOccurrenceDate(occurrence.startsAt, timeZone),
    shortDateLabel: formatOccurrenceShortDate(occurrence.startsAt, timeZone),
    name: occurrence.name || occurrence.classType?.name || "Class",
    instructor: occurrence.instructor?.name || "Coach not published",
    location: occurrence.location ? [occurrence.location.name, occurrence.location.address].filter(Boolean).join(" · ") : undefined,
    duration:
      occurrence.classType?.duration ||
      calculateDuration(occurrence.startTime, occurrence.endTime),
    spots: occurrence.availability.spotsRemaining,
    capacity: occurrence.availability.maxCapacity,
    waitlist: occurrence.availability.waitlistCount,
    id: occurrence.id,
    isBookable: true,
    difficulty: occurrence.classType?.difficulty,
  }));

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Schedule" aside={<p className="sf-meta">Times in {timeZone}</p>} />
        <Suspense fallback={<p role="status" className="sf-meta">Loading schedule…</p>}>
          <WeeklySchedule
            scheduleData={scheduleData}
            truncated={truncated}
            loadedThroughKey={truncated && loadedThrough ? localDateKey(loadedThrough, timeZone) : null}
            startsLater={Boolean(windowStart)}
            days={calendarDays(windowStart ?? new Date(), timeZone)}
            coachOptions={coachOptions.map((coach) => [coach.id, coach.user.name] as [string, string])}
            formatOptions={formatOptions.map((format) => [format.id, format.name] as [string, string])}
            timeZone={timeZone}
            initialBookingId={book}
            viewer={viewer}
          />
        </Suspense>
      </div>
    </div>
  );
}
