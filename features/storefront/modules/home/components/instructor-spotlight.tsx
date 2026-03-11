import Link from "next/link"
import { getInstructors } from "@/features/storefront/lib/data/instructors"
import { BadgeCheck, ArrowRight } from "lucide-react"

export default async function InstructorSpotlight() {
  const instructors = await getInstructors()
  const featuredInstructors = instructors.slice(0, 3)

  if (featuredInstructors.length === 0) return null

  return (
    <section className="bg-black py-24 text-white">
      <div className="container mx-auto px-6">
        <div className="mb-20 flex flex-col items-center text-center">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.4em] text-violet-500">
            Performance Architecture
          </div>
          <h2 className="text-4xl font-black uppercase italic leading-tight tracking-tighter md:text-7xl">
            The <span className="text-zinc-600">Force</span> Multipliers
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {featuredInstructors.map((instructor, i) => (
            <div key={instructor.id} className="group relative">
              {/* Vertical Number */}
              <div className="absolute -left-4 top-0 text-7xl font-black italic leading-none text-white/5 transition-colors group-hover:text-violet-500/10">
                0{i + 1}
              </div>

              <div className="relative aspect-[3/4] overflow-hidden bg-zinc-900 border border-white/5 transition-all group-hover:border-violet-600/50">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                
                {/* Info Overlay */}
                <div className="absolute bottom-0 left-0 w-full p-8 transform translate-y-2 transition-transform group-hover:translate-y-0">
                  <div className="mb-2 flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-violet-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">
                      Master Instructor
                    </span>
                  </div>
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-4">
                    {instructor.user.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {(instructor.specialties as string[] || ['STRENGTH']).map(spec => (
                      <span key={spec} className="bg-white/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest border border-white/5">
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <Link 
                href={`/instructors/${instructor.id}`}
                className="mt-6 flex items-center justify-between border-b border-white/10 pb-4 transition-colors hover:border-violet-600"
              >
                <span className="text-xs font-black uppercase tracking-widest">Protocol Intel</span>
                <ArrowRight className="h-4 w-4 transform transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
