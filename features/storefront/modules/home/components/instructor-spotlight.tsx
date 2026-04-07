import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getInstructors } from "@/features/storefront/lib/data/instructors";

export default async function InstructorSpotlight() {
  const instructors = await getInstructors();
  const featured = instructors.slice(0, 3);
  if (!featured.length) return null;

  return (
    <section className="bg-[#0e0e0e] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-16 border-b border-white/10 pb-12">
          <p className="gym-eyebrow">Coaching team</p>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <h2 className="gym-heading">Driven by<br />elite mentors</h2>
            <div className="flex flex-col items-start gap-4 md:items-end md:pb-2">
              <p className="gym-body max-w-xs md:text-right">
                Instructors anchor the brand, the schedule, and the training experience.
              </p>
              <Link href="/instructors" className="inline-flex items-center gap-2 border-b border-[#818cf8] pb-1 text-xs font-bold uppercase tracking-[0.22em] text-[#818cf8] hover:opacity-75 transition-opacity">
                Meet the team <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Instructor cards */}
        <div className="grid grid-cols-1 gap-px bg-white/[0.06] md:grid-cols-3">
          {featured.map((inst, index) => {
            const initials = inst.user?.name
              ? inst.user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
              : "??";
            const specialties = (inst.specialties ?? []).slice(0, 3) as string[];
            const rank = index === 0 ? "Lead mentor" : index === 1 ? "Senior coach" : "Coach";

            return (
              <Link
                key={inst.id}
                href={`/instructors/${inst.id}`}
                className="group flex flex-col bg-[#1c1b1b] p-8 transition-colors hover:bg-[#242424]"
              >
                {/* Avatar */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="gym-avatar h-14 w-14 shrink-0 text-2xl ring-1 ring-[#818cf8]/20 group-hover:ring-[#818cf8]/50 transition-all duration-200">
                    {initials}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">{rank}</p>
                    <h3 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white group-hover:text-[#818cf8] transition-colors">
                      {inst.user?.name ?? "Instructor"}
                    </h3>
                  </div>
                </div>

                {/* Specialties */}
                {specialties.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {specialties.map((s) => (
                      <span key={s} className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] bg-[#818cf8]/10 text-[#818cf8] border border-[#818cf8]/25">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-auto gym-label">Performance coaching</p>
                )}

                <div className="mt-5 border-t border-white/10 pt-4 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#818cf8]">
                    View profile
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#818cf8] transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
