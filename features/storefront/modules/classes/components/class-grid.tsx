import Link from "next/link";
import { getClassTypes, type ClassTypeData } from "@/features/storefront/lib/data/classes";

function getDescriptionText(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return "";
  const document = (description as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  return document?.flatMap((node) => node.children || []).map((child) => child.text || "").join(" ").trim() || "";
}

const difficultyMap: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "all-levels": "All levels",
};

export default async function ClassGrid({ difficulty, duration, q }: { difficulty?: string; duration?: string; q?: string }) {
  const classTypes = await getClassTypes();
  const filtered = classTypes.filter((classType: ClassTypeData) => {
    const difficultyOk = !difficulty || difficulty === "all" || classType.difficulty === difficulty;
    const durationOk = !duration || duration === "all" || (duration === "75" ? classType.duration >= 75 : classType.duration === Number(duration));
    return difficultyOk && durationOk && (!q || `${classType.name} ${getDescriptionText(classType.description)}`.toLowerCase().includes(q.toLowerCase().trim()));
  });

  if (!filtered.length) {
    return (
      <div className="border border-[var(--sf-border)] bg-[var(--sf-surface)] px-6 py-14 text-sm text-[var(--sf-muted)]">
        No classes match the current filters. <Link className="sf-link" href="/classes">Clear filters</Link>
      </div>
    );
  }

  return <><p className="sf-muted mb-5">{filtered.length} class format{filtered.length === 1 ? "" : "s"}</p><div className="sf-format-grid">{filtered.map(classType => <article className="sf-format-card" key={classType.id}><div className="flex flex-wrap gap-2"><span className="sf-badge">{difficultyMap[classType.difficulty] ?? classType.difficulty}</span><span className="sf-badge">{classType.duration} min</span></div><h2>{classType.name}</h2><p>{getDescriptionText(classType.description) || "Ask the coaching team what to expect from this format."}</p>{classType.equipmentNeeded?.length ? <p><strong>Equipment</strong><br />{classType.equipmentNeeded.join(" · ")}</p> : null}<div className="sf-actions"><Link href={`/schedule?format=${encodeURIComponent(classType.id)}`} className="sf-btn-primary">Find a session</Link><Link href={`/classes/${classType.id}`} className="sf-link">What to expect →</Link></div></article>)}</div></>;
}
