import Link from "next/link";
import { AlertCircle, CalendarDays, GraduationCap, Users } from "lucide-react";
import { getUser } from "@/features/storefront/lib/data/user";
import { keystoneContext } from "@/features/keystone/context";

async function getInstructorProfile(userId: string) {
  const context = keystoneContext.sudo();
  const now = new Date().toISOString();

  const instructors = await context.query.Instructor.findMany({
    where: {
      user: { id: { equals: userId } },
      isActive: { equals: true },
    },
    take: 1,
    query: `
      id
      bio { document }
      specialties
      certifications
      classSchedules(take: 30) {
        id
        name
        dayOfWeek
        startTime
        endTime
        maxCapacity
      }
      classInstances(
        where: { date: { gte: "${now}" }, isCancelled: { equals: false } }
        orderBy: [{ date: asc }]
        take: 20
      ) {
        id
        date
        classSchedule { name maxCapacity dayOfWeek startTime endTime }
        bookingsCount
      }
    `,
  });

  return instructors[0] ?? null;
}

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function InstructorAccountPage() {
  const user = await getUser();

  if (!user) {
    return (
      <div className="bg-[#1c1b1b] p-8 text-center text-[#e5e2e1]">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[#c4c7c7]/40" />
        <p className="font-medium">Sign in to access your instructor console.</p>
      </div>
    );
  }

  if (!user.role?.isInstructor) {
    return (
      <div className="bg-[#1c1b1b] p-8 text-center text-[#e5e2e1]">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[#c4c7c7]/40" />
        <h1 className="text-lg font-semibold">Instructor access required</h1>
        <p className="mt-2 text-sm text-[#c4c7c7]">Your account is not configured as an instructor.</p>
      </div>
    );
  }

  const instructor = await getInstructorProfile(user.id);
  if (!instructor) {
    return (
      <div className="bg-[#1c1b1b] p-8 text-center text-[#e5e2e1]">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[#c4c7c7]/40" />
        <h1 className="text-lg font-semibold">No instructor profile found</h1>
        <p className="mt-2 text-sm text-[#c4c7c7]">Ask an admin to link your user to an instructor profile.</p>
      </div>
    );
  }

  const specialties: string[] = Array.isArray(instructor.specialties) ? instructor.specialties : [];
  const schedules = instructor.classSchedules ?? [];
  const upcomingInstances = instructor.classInstances ?? [];
  const totalBooked = upcomingInstances.reduce((sum: number, session: any) => sum + (session.bookingsCount ?? 0), 0);
  const weeklySchedule = WEEK_DAYS.map((day) => ({
    day,
    items: schedules.filter((schedule: any) => schedule.dayOfWeek === day),
  }));

  return (
    <div className="space-y-10 text-[#e5e2e1]">
      <header className="border-l-4 border-[#818cf8] pl-4">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#818cf8]">Personnel access only</p>
        <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-6xl">
          Instructor
          <br />
          console
        </h1>
        <p className="mt-4 max-w-2xl text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
          Offer classes, review your teaching calendar, and move directly into session rosters from one storefront-side workspace.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-[#1c1b1b] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Upcoming sessions</p>
          <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black text-white">{upcomingInstances.length}</p>
        </div>
        <div className="bg-[#1c1b1b] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Recurring offers</p>
          <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black text-[#a5b4fc]">{schedules.length}</p>
        </div>
        <div className="bg-[#1c1b1b] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Booked athletes</p>
          <p className="mt-2 font-[family-name:var(--font-space-grotesk)] text-4xl font-black text-[#818cf8]">{totalBooked}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">Upcoming calendar</h2>
            <Link href="/dashboard/platform/scheduling" className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">Scheduling center</Link>
          </div>

          <div className="space-y-4">
            {upcomingInstances.length === 0 ? (
              <div className="bg-[#1c1b1b] px-6 py-16 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">No upcoming sessions.</div>
            ) : (
              upcomingInstances.map((session: any, index: number) => {
                const booked = session.bookingsCount ?? 0;
                const cap = session.classSchedule?.maxCapacity ?? 0;
                return (
                  <div key={session.id} className={`flex flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between ${index === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"}`}>
                    <div>
                      <p className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                        {session.classSchedule?.name ?? "Class"}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">{formatDateTime(session.date)}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Occupancy</span>
                        <span className="mt-1 block font-[family-name:var(--font-space-grotesk)] text-2xl font-black text-[#a5b4fc]">{booked}/{cap}</span>
                      </div>
                      <Link href={`/dashboard/platform/rosters/${session.id}`} className="border border-[#818cf8] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#818cf8] hover:bg-[#818cf8]/10">
                        View roster
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-8">
          <div className="border-t-4 border-[#a5b4fc] bg-[#0e0e0e] p-8">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">Teaching tools</h2>
            <div className="mt-6 space-y-3">
              <Link href="/dashboard/platform/instructors" className="flex items-center justify-between bg-[#1c1b1b] px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white hover:bg-[#2a2a2a]">
                <span>Instructor profile</span>
                <GraduationCap className="h-4 w-4 text-[#818cf8]" />
              </Link>
              <Link href="/dashboard/platform/scheduling" className="flex items-center justify-between bg-[#1c1b1b] px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white hover:bg-[#2a2a2a]">
                <span>Offer and manage classes</span>
                <CalendarDays className="h-4 w-4 text-[#a5b4fc]" />
              </Link>
            </div>
          </div>

          <div className="bg-[#1c1b1b] p-8">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">Recurring teaching week</h2>
            <div className="mt-6 space-y-3">
              {weeklySchedule.map(({ day, items }) => (
                <div key={day} className="bg-[#0e0e0e] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">{day}</p>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#818cf8]">{items.length} sessions</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs uppercase tracking-[0.16em] text-[#7f8282]">No recurring class</p>
                    ) : (
                      items.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.14em] text-white">
                          <span>{item.name}</span>
                          <span className="text-[#c4c7c7]">{item.startTime}–{item.endTime}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1c1b1b] p-8">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">Coach profile</h2>
            <div className="mt-6 space-y-4 text-sm text-[#e5e2e1]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Specialties</p>
                <p className="mt-2 uppercase tracking-[0.16em]">{specialties.join(" · ") || "Performance coaching"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Certifications</p>
                <p className="mt-2 uppercase tracking-[0.16em]">{(instructor.certifications || []).join(" · ") || "Not listed"}</p>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Next roster action</span>
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#818cf8]">
                  <Users className="h-3.5 w-3.5" /> Open next class roster
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
