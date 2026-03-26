import Link from "next/link";
import { getInstructors } from "@/features/storefront/lib/data/instructors";

export default async function InstructorSpotlight() {
  const instructors = await getInstructors();
  const featured = instructors.slice(0, 2);
  if (!featured.length) return null;

  return (
    <section className="bg-[#0e0e0e] py-24">
      <div className="mx-auto grid max-w-7xl gap-16 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
        <div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.07em] text-white">
            Driven by elite mentors
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-[#c4c7c7]">
            Instructors are not filler profile cards here. They anchor the brand, the schedule, and the training experience.
          </p>
          <Link href="/instructors" className="mt-8 inline-flex border-b border-[#ffb59e] pb-1 text-xs font-bold uppercase tracking-[0.22em] text-[#ffb59e]">
            Meet the coaching team
          </Link>
        </div>

        <div className="grid gap-6">
          {featured.map((inst, index) => (
            <Link key={inst.id} href="/instructors" className="group bg-[#1c1b1b] p-8 transition-colors hover:bg-[#2a2a2a]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">
                    {index === 0 ? "Lead mentor" : "Coach"}
                  </p>
                  <h3 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
                    {inst.user?.name ?? "Instructor"}
                  </h3>
                  <p className="mt-3 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">
                    {(inst.specialties ?? []).slice(0, 3).join(" · ") || "Performance coaching"}
                  </p>
                </div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#c4c7c7] transition-colors group-hover:text-[#ffb59e]">
                  View
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
