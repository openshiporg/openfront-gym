import Link from "next/link";
import { getClassTypes, type ClassTypeData } from "@/features/storefront/lib/data/classes";

function getDescriptionText(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return "";

  const document = (description as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  return (
    document
      ?.flatMap((node) => node.children || [])
      .map((child) => child.text || "")
      .join(" ")
      .trim() || ""
  );
}

const difficultyMap: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "all-levels": "All levels",
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
      <div className="border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-14 text-sm text-[var(--color-ink-muted)]">
        No classes match the current filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {filtered.map((classType) => (
        <article key={classType.id} className="group min-w-0 border border-[var(--color-rule)] bg-[var(--color-surface)] p-7 transition hover:border-[var(--color-accent)]/40">
          <div className="flex items-start justify-between gap-4">
            <p className="sf-label">{difficultyMap[classType.difficulty] ?? classType.difficulty}</p>
            <span className="text-sm text-[var(--color-ink-muted)]">{classType.duration} min</span>
          </div>

          <h3 className="sf-display mt-4 text-3xl text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
            {classType.name}
          </h3>

          {getDescriptionText(classType.description) ? (
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {getDescriptionText(classType.description)}
            </p>
          ) : null}

          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-[var(--color-rule)] pt-6 text-sm">
            <div>
              <dt className="sf-label">Estimated burn</dt>
              <dd className="mt-1 font-medium">{classType.caloriesBurn ? `~${classType.caloriesBurn} cal` : "—"}</dd>
            </div>
            <div>
              <dt className="sf-label">Equipment</dt>
              <dd className="mt-1 font-medium">
                {classType.equipmentNeeded?.length ? classType.equipmentNeeded.join(", ") : "Studio equipment"}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/classes/${classType.id}`} className="sf-btn-primary inline-flex px-5">
              View class
            </Link>
            <Link href="/schedule" className="sf-btn-outline inline-flex px-5">
              See schedule
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
