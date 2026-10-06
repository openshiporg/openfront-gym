import Link from "next/link";

const difficulties = [
  { id: "all", name: "All formats" },
  { id: "beginner", name: "Beginner" },
  { id: "intermediate", name: "Intermediate" },
  { id: "advanced", name: "Advanced" },
  { id: "all-levels", name: "All levels" },
];

const durations = [
  { id: "all", name: "Any length" },
  { id: "30", name: "30 min" },
  { id: "45", name: "45 min" },
  { id: "60", name: "60 min" },
  { id: "75", name: "75+ min" },
];

export default function ClassFilters({
  selectedDifficulty = "all",
  selectedDuration = "all",
  q,
}: {
  selectedDifficulty?: string;
  selectedDuration?: string;
  q?: string;
}) {
  const buildHref = (next: { difficulty?: string; duration?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const difficulty = next.difficulty ?? selectedDifficulty;
    const duration = next.duration ?? selectedDuration;
    if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
    if (duration && duration !== "all") params.set("duration", duration);
    const search = params.toString();
    return search ? `/classes?${search}` : "/classes";
  };

  return (
    <div className="grid gap-3 border-y border-[var(--sf-border)] py-5">
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter classes by difficulty">
        {difficulties.map((item) => {
          const active = selectedDifficulty === item.id || (!selectedDifficulty && item.id === "all");
          return (
            <Link
              key={item.id}
              href={buildHref({ difficulty: item.id })}
              aria-current={active ? "page" : undefined}
              className={`sf-btn shrink-0 px-4 ${active ? "border-[var(--sf-foreground)] bg-[var(--sf-foreground)] text-[var(--sf-background)]" : "border-[var(--sf-border)] bg-[var(--sf-surface)] text-[var(--sf-muted)] hover:border-[var(--sf-border-strong)] hover:text-[var(--sf-foreground)]"}`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter classes by duration">
        {durations.map((item) => {
          const active = selectedDuration === item.id || (!selectedDuration && item.id === "all");
          return (
            <Link
              key={item.id}
              href={buildHref({ duration: item.id })}
              aria-current={active ? "page" : undefined}
              className={`sf-btn shrink-0 px-4 ${active ? "border-[var(--sf-foreground)] bg-[var(--sf-foreground)] text-[var(--sf-background)]" : "border-[var(--sf-border)] bg-[var(--sf-surface)] text-[var(--sf-muted)] hover:border-[var(--sf-border-strong)] hover:text-[var(--sf-foreground)]"}`}
            >
              {item.name}
            </Link>
          );
        })}
        {selectedDifficulty !== "all" || selectedDuration !== "all" ? (
          <Link href="/classes" className="sf-btn-ghost ml-2 shrink-0">Clear filters</Link>
        ) : null}
      </nav>
    </div>
  );
}
