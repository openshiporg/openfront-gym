import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getClassTypes } from "@/features/storefront/lib/data/classes";

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Balanced",
  intermediate: "Intense",
  advanced: "Elite",
  "all-levels": "Mixed",
};

// All blue-indigo spectrum — no orange
const DIFFICULTY_ACCENT: Record<string, string> = {
  beginner:      "#818cf8", // indigo-400
  intermediate:  "#6366f1", // indigo-500
  advanced:      "#4f46e5", // indigo-600
  "all-levels":  "#a5b4fc", // indigo-300
};

export default async function FeaturedClasses() {
  const classTypes = await getClassTypes();
  const featured = classTypes.slice(0, 4);
  if (!featured.length) return null;

  return (
    <section className="bg-[#131313] py-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">

        {/* Section header */}
        <div className="mb-16 border-b border-white/10 pb-12">
          <p className="gym-eyebrow">Training catalog</p>
          <div className="mt-2 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <h2 className="gym-heading">
              Disciplines of<br />evolution
            </h2>
            <div className="flex flex-col items-start gap-4 md:items-end md:pb-2">
              <p className="gym-body max-w-xs md:text-right">
                Strength, conditioning, mobility, and coached formats from the live catalog.
              </p>
              <Link
                href="/classes"
                className="inline-flex items-center gap-2 bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90"
              >
                View all classes <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Class cards — flat even 2-col grid */}
        <div className="grid grid-cols-1 gap-px bg-white/[0.06] md:grid-cols-2">
          {featured.map((ct) => {
            const accent = DIFFICULTY_ACCENT[ct.difficulty] ?? "#818cf8";
            const label = DIFFICULTY_LABEL[ct.difficulty] ?? "Balanced";
            return (
              <Link
                key={ct.id}
                href={`/classes/${ct.id}`}
                className="group relative overflow-hidden bg-[#1c1b1b] p-8 transition-colors duration-200 hover:bg-[#252525]"
              >
                {/* Accent top bar */}
                <div
                  className="absolute inset-x-0 top-0 h-[3px] opacity-60 transition-opacity group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, ${accent}, transparent 70%)` }}
                />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: accent }}>
                      {label}
                    </p>
                    <h3 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
                      {ct.name}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black text-white">{ct.duration}</div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#c4c7c7]">min</div>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-[#c4c7c7]">
                  {ct.caloriesBurn
                    ? `~${ct.caloriesBurn} cal burn. Structured coaching, real progression, and clear scheduling.`
                    : "Structured coaching, real progression, and clear scheduling for members and drop-in athletes."}
                </p>

                <div
                  className="mt-8 inline-flex items-center gap-2 border-b pb-1 text-xs font-bold uppercase tracking-[0.22em] transition-all group-hover:gap-3"
                  style={{ borderColor: accent, color: accent }}
                >
                  Explore class <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
