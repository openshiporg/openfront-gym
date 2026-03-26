import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
      specialties
      certifications
      classSchedules(take: 20) {
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
        take: 10
      ) {
        id
        date
        classSchedule { name maxCapacity }
        bookingsCount
      }
    `,
  });

  return instructors[0] ?? null;
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

  return (
    <div className="space-y-10 text-[#e5e2e1]">
      <header className="border-l-4 border-[#ffb59e] pl-4">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#ffb59e]">Personnel access only</p>
        <h1 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-6xl">
          Instructor
          <br />
          console
        </h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-bold uppercase tracking-[-0.04em] text-white">Teaching schedule</h2>
            <Link href="/dashboard/platform/scheduling" className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">Full calendar</Link>
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
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#c4c7c7]">
                        {new Date(session.date).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Occupancy</span>
                        <span className="mt-1 block font-[family-name:var(--font-space-grotesk)] text-2xl font-black text-[#7df4ff]">{booked}/{cap}</span>
                      </div>
                      <Link href={`/dashboard/platform/rosters/${session.id}`} className="border border-[#ffb59e] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#ffb59e] hover:bg-[#ffb59e]/10">
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
          <div className="border-t-4 border-[#7df4ff] bg-[#0e0e0e] p-8">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">Console links</h2>
            <div className="mt-6 space-y-3">
              <Link href="/dashboard/platform/scheduling" className="block bg-[#1c1b1b] px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white hover:bg-[#2a2a2a]">Scheduling command center</Link>
              <Link href="/account/bookings" className="block bg-[#1c1b1b] px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white hover:bg-[#2a2a2a]">My bookings view</Link>
            </div>
          </div>

          <div className="bg-[#1c1b1b] p-8">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase tracking-[-0.03em] text-white">Weekly impact</h2>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-[#0e0e0e] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Sessions</p>
                <p className="mt-1 font-[family-name:var(--font-space-grotesk)] text-3xl font-black text-[#ffb59e]">{upcomingInstances.length}</p>
              </div>
              <div className="bg-[#0e0e0e] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Schedules</p>
                <p className="mt-1 font-[family-name:var(--font-space-grotesk)] text-3xl font-black text-[#7df4ff]">{schedules.length}</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Specialties</p>
              <p className="mt-3 text-sm uppercase tracking-[0.16em] text-white">{specialties.join(" · ") || "Performance coaching"}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
