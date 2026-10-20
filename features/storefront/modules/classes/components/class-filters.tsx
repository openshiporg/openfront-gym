import Link from "next/link";

const difficulties = [
  { id: "all", name: "All" },
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
    <div className="sf-row">
      <nav className="sf-seg" aria-label="Level">
        {difficulties.map((item) => {
          const active = selectedDifficulty === item.id || (!selectedDifficulty && item.id === "all");
          return <Link key={item.id} href={buildHref({ difficulty: item.id })} aria-current={active ? "page" : undefined} scroll={false}>{item.name}</Link>;
        })}
      </nav>
      <nav className="sf-seg" aria-label="Length">
        {durations.map((item) => {
          const active = selectedDuration === item.id || (!selectedDuration && item.id === "all");
          return <Link key={item.id} href={buildHref({ duration: item.id })} aria-current={active ? "page" : undefined} scroll={false}>{item.name}</Link>;
        })}
      </nav>
      {selectedDifficulty !== "all" || selectedDuration !== "all" ? (
        <Link href={q ? `/classes?q=${encodeURIComponent(q)}` : "/classes"} className="sf-btn" data-variant="ghost" data-size="sm" scroll={false}>Clear</Link>
      ) : null}
    </div>
  );
}
