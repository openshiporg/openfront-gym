import Link from "next/link"
import { getClassTypes } from "@/features/storefront/lib/data/classes"
import { ArrowUpRight, Flame, Timer, Gauge } from "lucide-react"

export default async function FeaturedClasses() {
  const classTypes = await getClassTypes()

  // Get first 4 class types to feature
  const featuredClasses = classTypes.slice(0, 4)

  if (featuredClasses.length === 0) {
    return null
  }

  return (
    <section className="bg-[#050505] py-24 text-white">
      <div className="container mx-auto px-6">
        <div className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2">
              <div className="h-px w-8 bg-violet-600" />
              <span className="text-xs font-black uppercase tracking-[0.3em] text-violet-500">
                Discipline Blocks
              </span>
            </div>
            <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter md:text-6xl">
              Elite <span className="text-zinc-500">Programming</span>
            </h2>
          </div>
          <Link
            href="/schedule"
            className="group flex items-center gap-2 border-b-2 border-white/10 pb-1 text-sm font-bold uppercase tracking-widest transition-all hover:border-violet-600"
          >
            Full Catalog
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-px bg-white/5 md:grid-cols-2 lg:grid-cols-4">
          {featuredClasses.map((classType) => (
            <div
              key={classType.id}
              className="group relative overflow-hidden bg-[#0a0a0a] p-10 transition-colors hover:bg-[#0f0f0f]"
            >
              {/* Background gradient on hover */}
              <div className="absolute -bottom-1/2 -left-1/2 h-full w-full bg-violet-600/5 blur-[100px] transition-opacity opacity-0 group-hover:opacity-100" />
              
              <div className="relative z-10">
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 font-black group-hover:border-violet-500/50 group-hover:text-violet-500">
                    {classType.name.charAt(0)}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <Gauge className="h-3 w-3" />
                    {classType.difficulty || 'Pro'}
                  </div>
                </div>

                <h3 className="mb-4 text-2xl font-black uppercase italic tracking-tight transition-colors group-hover:text-violet-400">
                  {classType.name}
                </h3>

                <div className="mb-10 grid grid-cols-2 gap-4 border-l border-white/5 pl-4">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                      <Timer className="h-3 w-3" /> Duration
                    </span>
                    <span className="text-sm font-black tabular-nums tracking-tight">
                      {classType.duration} MIN
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                      <Flame className="h-3 w-3" /> Intensity
                    </span>
                    <span className="text-sm font-black tabular-nums tracking-tight">
                      {classType.caloriesBurn || '600'} CAL
                    </span>
                  </div>
                </div>

                <Link
                  href={`/classes/${classType.id}`}
                  className="inline-flex h-10 items-center gap-2 bg-white px-6 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-violet-600 hover:text-white"
                >
                  Book Session
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
