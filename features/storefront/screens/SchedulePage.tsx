import { Metadata } from "next"
import WeeklySchedule from "@/features/storefront/modules/classes/components/weekly-schedule"
import { getSchedulesWithAvailability } from "@/features/storefront/lib/data/classes"

export const metadata: Metadata = {
  title: "Class Schedule - Openfront Gym",
  description: "View our weekly class schedule and book your spot.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Class Schedule - Openfront Gym",
    description: "View our weekly class schedule and book your spot.",
  }
}

// Map day codes to day index
const dayCodeToIndex: Record<string, number> = {
  'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
}

// Calculate duration in minutes from startTime and endTime (HH:MM format)
function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes - startMinutes;
}

export async function SchedulePage() {
  const schedules = await getSchedulesWithAvailability();

  // Transform schedules into the format expected by WeeklySchedule
  const scheduleData = schedules.map((schedule: any) => ({
    day: dayCodeToIndex[schedule.dayOfWeek] ?? 0,
    time: schedule.startTime,
    name: schedule.name || "Unknown Class",
    instructor: schedule.instructor?.user?.name || "TBD",
    duration: calculateDuration(schedule.startTime, schedule.endTime),
    spots: schedule.spotsAvailable || 0,
    capacity: schedule.totalCapacity || schedule.maxCapacity,
    id: schedule.id,
    difficulty: undefined,
    room: undefined,
  }));

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Class Schedule</h1>
        <p className="text-lg text-muted-foreground">
          Book your spot in our expert-led fitness classes
        </p>
      </div>
      <WeeklySchedule scheduleData={scheduleData} />
    </div>
  )
}
