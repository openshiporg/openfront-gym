import { Metadata } from "next";
import Link from "next/link";
import { getInstructors } from "@/features/storefront/lib/data/instructors";

export const metadata: Metadata = {
  title: "Our Instructors - Openfront Gym",
  description: "Meet our expert fitness instructors.",
};

export async function generateMetadata(): Promise<Metadata> {
  return metadata;
}

function getBioText(bio: any): string {
  if (!bio?.document?.[0]?.children?.[0]?.text) {
    return "Expert fitness instructor focused on progression, discipline, and durable performance.";
  }
  return bio.document[0].children[0].text;
}

export async function InstructorsPage() {
  const instructors = await getInstructors();

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Elite mentors</p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              The coaching
              <br />
              team
            </h1>
          </div>
          <p className="max-w-md border-l-2 border-[#818cf8] pl-6 text-base leading-relaxed text-[#c4c7c7]">
            Every class, schedule, and progression path is anchored by a real instructor with a real teaching specialty.
          </p>
        </header>

        {instructors.length === 0 ? (
          <div className="bg-[#1c1b1b] px-6 py-16 text-sm uppercase tracking-[0.16em] text-[#c4c7c7]">No instructors available yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {instructors.map((instructor, index) => (
              <Link
                key={instructor.id}
                href={`/instructors/${instructor.id}`}
                className={`group overflow-hidden ${index % 2 === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"}`}
              >
                <div className="h-64 bg-[radial-gradient(circle_at_top,rgba(255,181,158,0.18),transparent_45%),linear-gradient(180deg,#2a2a2a_0%,#131313_100%)] flex items-center justify-center">
                  <div className="font-[family-name:var(--font-space-grotesk)] text-7xl font-black text-white/20">
                    {instructor.user.name.charAt(0)}
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#818cf8]">Instructor</p>
                  <h3 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.04em] text-white group-hover:text-[#818cf8] transition-colors">
                    {instructor.user.name}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-[#c4c7c7] line-clamp-3">{getBioText(instructor.bio)}</p>

                  {instructor.specialties && instructor.specialties.length > 0 && (
                    <p className="mt-5 text-xs uppercase tracking-[0.16em] text-[#c4c7c7]">
                      {instructor.specialties.slice(0, 3).join(" · ")}
                    </p>
                  )}

                  <div className="mt-6 border-t border-white/10 pt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#a5b4fc]">
                    View profile
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
