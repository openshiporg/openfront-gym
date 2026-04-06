import Link from "next/link";
import { getClassTypes } from "@/features/storefront/lib/data/classes";

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Balanced",
  intermediate: "Intense",
  advanced: "Elite",
  "all-levels": "Balanced",
};

export default async function FeaturedClasses() {
  const classTypes = await getClassTypes();
  const featured = classTypes.slice(0, 4);
  if (!featured.length) return null;

  return (
    <section className="bg-[#131313] px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-6xl">
            Disciplines of
            <br />
            evolution
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-[#c4c7c7] sm:text-base">
            Strength, conditioning, mobility, and coached formats built directly from the live class catalog.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {featured.map((ct, index) => (
            <Link
              key={ct.id}
              href="/classes"
              className={`group relative overflow-hidden bg-[#1c1b1b] p-8 transition-colors hover:bg-[#2a2a2a] ${index % 2 === 1 ? "md:mt-10" : ""}`}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ffb59e_0%,#e44400_100%)] opacity-70" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">
                    {DIFFICULTY_LABEL[ct.difficulty] ?? "Balanced"}
                  </p>
                  <h3 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
                    {ct.name}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black text-white">
                    {ct.duration}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[#c4c7c7]">min</div>
                </div>
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-[#c4c7c7]">
                {ct.caloriesBurn
                  ? `Estimated burn around ${ct.caloriesBurn} calories. Structured coaching, real progression, and clear scheduling.`
                  : "Structured coaching, real progression, and clear scheduling for members and drop-in athletes."}
              </p>
              <div className="mt-8 inline-flex items-center border-b border-[#ffb59e] pb-1 text-xs font-bold uppercase tracking-[0.22em] text-[#ffb59e] transition-all group-hover:tracking-[0.26em]">
                Explore class
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
