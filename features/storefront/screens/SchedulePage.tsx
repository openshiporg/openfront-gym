import { Metadata } from "next";
import WeeklySchedule from "@/features/storefront/modules/classes/components/weekly-schedule";
import { getSchedulesWithAvailability } from "@/features/storefront/lib/data/classes";

export const metadata: Metadata = {
  title: "Class Schedule - Openfront Gym",
  description: "View our weekly class schedule and book your spot.",
};

export async function generateMetadata(): Promise<Metadata> {
  return metadata;
}

const dayCodeToIndex: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  return endHour * 60 + endMin - (startHour * 60 + startMin);
}

export async function SchedulePage() {
  const schedules = await getSchedulesWithAvailability();
  const scheduleData = schedules.map((schedule: any) => ({
    day: dayCodeToIndex[schedule.dayOfWeek] ?? 0,
    time: schedule.startTime,
    name: schedule.name || "Unknown Class",
    instructor: schedule.instructor?.user?.name || "TBD",
    duration: calculateDuration(schedule.startTime, schedule.endTime),
    spots: schedule.spotsAvailable || 0,
    capacity: schedule.totalCapacity || schedule.maxCapacity,
    id: schedule.nextInstanceId ?? schedule.id,
    difficulty: undefined,
    room: undefined,
  }));

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-12">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
            Weekly Vanguard
            <br />
            <span className="text-[#818cf8]">Schedule</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c4c7c7]">
            Precision-engineered programming for members who want fast booking, clear availability, and schedule visibility at a glance.
          </p>
        </header>

        <WeeklySchedule scheduleData={scheduleData} />
      </div>
    </div>
  );
}
