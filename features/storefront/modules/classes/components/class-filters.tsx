import Link from "next/link";

const difficulties = [
  { id: "all", name: "All levels" },
  { id: "beginner", name: "Beginner" },
  { id: "intermediate", name: "Intermediate" },
  { id: "advanced", name: "Advanced" },
  { id: "all-levels", name: "Mixed" },
];

const durations = [
  { id: "all", name: "Any" },
  { id: "30", name: "30 min" },
  { id: "45", name: "45 min" },
  { id: "60", name: "60 min" },
  { id: "75", name: "75+ min" },
];

export default function ClassFilters({
  selectedDifficulty = "all",
  selectedDuration = "all",
}: {
  selectedDifficulty?: string;
  selectedDuration?: string;
}) {
  const buildHref = (next: { difficulty?: string; duration?: string }) => {
    const params = new URLSearchParams();
    const difficulty = next.difficulty ?? selectedDifficulty;
    const duration = next.duration ?? selectedDuration;

    if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
    if (duration && duration !== "all") params.set("duration", duration);

    const search = params.toString();
    return search ? `/classes?${search}` : "/classes";
  };

  return (
    <aside className="space-y-10 lg:sticky lg:top-24 lg:self-start">
      <div>
        <h3 className="sf-label mb-4">Difficulty</h3>
        <div className="space-y-2">
          {difficulties.map((item) => {
            const active = selectedDifficulty === item.id || (!selectedDifficulty && item.id === "all");
            return (
              <Link
                key={item.id}
                href={buildHref({ difficulty: item.id })}
                className={`block border px-3 py-2 text-sm transition ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-ink)]"
                    : "border-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-rule)] hover:bg-[var(--color-paper-2)]"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="sf-label mb-4">Duration</h3>
        <div className="flex flex-wrap gap-2">
          {durations.map((item) => {
            const active = selectedDuration === item.id || (!selectedDuration && item.id === "all");
            return (
              <Link
                key={item.id}
                href={buildHref({ duration: item.id })}
                className={`px-3 py-2 text-xs font-medium transition ${
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-on)]"
                    : "border border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink)]"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>

      <Link href="/classes" className="inline-block text-sm font-medium text-[var(--color-accent)] hover:underline">
        Reset filters
      </Link>
    </aside>
  );
}
