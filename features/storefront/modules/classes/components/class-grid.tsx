import Link from "next/link";
import { getClassTypes, type ClassTypeData } from "@/features/storefront/lib/data/classes";

function getDescriptionText(description: any): string {
  if (!description?.document?.[0]?.children?.[0]?.text) {
    return "Structured training built for real progression.";
  }
  return description.document[0].children[0].text;
}

const difficultyMap: Record<string, string> = {
  beginner: "Balanced",
  intermediate: "Intense",
  advanced: "Elite",
  "all-levels": "Mixed",
};

export default async function ClassGrid({
  difficulty,
  duration,
}: {
  difficulty?: string;
  duration?: string;
}) {
  const classTypes = await getClassTypes();

  const filtered = classTypes.filter((classType: ClassTypeData) => {
    const difficultyOk = !difficulty || difficulty === "all" || classType.difficulty === difficulty;
    const durationOk =
      !duration ||
      duration === "all" ||
      (duration === "75" ? classType.duration >= 75 : classType.duration === Number(duration));
    return difficultyOk && durationOk;
  });

  if (!filtered.length) {
    return (
      <div className="bg-[#1c1b1b] px-6 py-14 text-sm uppercase tracking-[0.14em] text-[#c4c7c7]">
        No classes match the current filter set.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {filtered.map((classType, index) => (
        <article
          key={classType.id}
          className={`group relative overflow-hidden ${index % 2 === 1 ? "md:mt-12" : ""} ${
            index % 2 === 0 ? "bg-[#1c1b1b]" : "border border-white/10 bg-[#0e0e0e]"
          }`}
        >
          <div className="absolute right-0 top-0 bg-[#818cf8] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
            {difficultyMap[classType.difficulty] ?? "Balanced"}
          </div>
          <div className="p-8">
            <h3 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
              {classType.name}
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[#c4c7c7]">
              {getDescriptionText(classType.description)}
            </p>

            <div className="mt-8 grid grid-cols-2 gap-y-5 border-t border-white/10 pt-8">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Duration</span>
                <span className="mt-1 block font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase text-white">
                  {classType.duration} min
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Estimated burn</span>
                <span className="mt-1 block font-[family-name:var(--font-space-grotesk)] text-xl font-bold uppercase text-[#a5b4fc]">
                  {classType.caloriesBurn ? `~${classType.caloriesBurn}` : "—"}
                </span>
              </div>
              <div className="col-span-2">
                <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Equipment</span>
                <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[#e5e2e1]">
                  {classType.equipmentNeeded?.length ? classType.equipmentNeeded.join(", ") : "Bodyweight / studio equipment"}
                </span>
              </div>
            </div>

            <Link
              href="/schedule"
              className="mt-8 inline-flex bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition-transform active:scale-95"
            >
              See schedule
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
