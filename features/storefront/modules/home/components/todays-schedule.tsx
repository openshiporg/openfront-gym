import Link from "next/link"
import { Timer, Users, ChevronRight } from "lucide-react"
import { getTodaysClasses } from "@/features/storefront/lib/data/classes"

export default async function TodaysSchedule() {
  const todaysClasses = await getTodaysClasses()
  const upcomingClasses = todaysClasses.slice(0, 5)

  if (upcomingClasses.length === 0) return null

  return (
    <section className="bg-black py-24 text-white relative">
      <div className="container mx-auto px-6">
        <div className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="relative">
            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.4em] text-violet-500">
              Operational Queue
            </div>
            <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter md:text-6xl">
              Live <span className="text-zinc-600">Protocols</span>
            </h2>
            <div className="absolute -left-12 top-1/2 h-px w-8 bg-white/10 hidden xl:block" />
          </div>
          
          <Link
            href="/schedule"
            className="group flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
          >
            Tactical Schedule
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="space-y-[1px] bg-white/5 border border-white/5">
          {upcomingClasses.map((classSession) => (
            <div
              key={classSession.id}
              className="group relative bg-black p-8 transition-colors hover:bg-zinc-900/50"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="flex items-center gap-10">
                  {/* Time Block */}
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-black italic tracking-tighter text-white group-hover:text-violet-500 transition-colors">
                      {classSession.startTime}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700">
                      EST / UTC-5
                    </span>
                  </div>

                  <div className="h-12 w-px bg-white/5" />

                  {/* Class Info */}
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tight mb-1">
                      {classSession.classType.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Instructor: {classSession.instructor.name}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics & Action */}
                <div className="flex flex-wrap items-center gap-10">
                  <div className="flex items-center gap-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-700">Duration</span>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-tighter">
                        <Timer className="h-3 w-3 text-violet-500" />
                        {classSession.classType.duration}M
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-700">Capacity</span>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-tighter">
                        <Users className="h-3 w-3 text-violet-500" />
                        {classSession.currentCapacity || 0}/{classSession.maxCapacity}
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/schedule#class-${classSession.id}`}
                    className="flex h-12 items-center justify-center border border-white px-8 text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-white hover:text-black active:scale-95"
                  >
                    Engage
                  </Link>
                </div>
              </div>
              
              {/* Decorative side accent */}
              <div className="absolute left-0 top-0 h-0 w-1 bg-violet-600 transition-all group-hover:h-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
