import Link from "next/link";

const difficulties = [
  { id: "all", name: "All levels" },
  { id: "beginner", name: "Balanced" },
  { id: "intermediate", name: "Intense" },
  { id: "advanced", name: "Elite" },
  { id: "all-levels", name: "Mixed" },
];

const durations = [
  { id: "all", name: "Any duration" },
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
    <aside className="space-y-10">
      <div>
        <h3 className="mb-6 text-xs font-bold uppercase tracking-[0.28em] text-[#c4c7c7]">Difficulty</h3>
        <div className="space-y-3">
          {difficulties.map((item) => {
            const active = selectedDifficulty === item.id || (!selectedDifficulty && item.id === "all");
            return (
              <Link key={item.id} href={buildHref({ difficulty: item.id })} className="flex items-center gap-3">
                <span className={`h-4 w-4 border transition-colors ${active ? "border-[#ffb59e] bg-[#ffb59e]" : "border-[#8e9192]"}`} />
                <span className={`text-sm uppercase tracking-[0.14em] ${active ? "text-[#ffb59e]" : "text-[#e5e2e1]"}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-6 text-xs font-bold uppercase tracking-[0.28em] text-[#c4c7c7]">Duration</h3>
        <div className="grid grid-cols-2 gap-2">
          {durations.map((item) => {
            const active = selectedDuration === item.id || (!selectedDuration && item.id === "all");
            return (
              <Link
                key={item.id}
                href={buildHref({ duration: item.id })}
                className={`px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.22em] transition-colors ${
                  active ? "bg-[#ffb59e] text-[#3a0b00]" : "bg-[#353535] text-[#e5e2e1] hover:bg-[#393939]"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>

      <Link href="/classes" className="inline-flex items-center gap-2 border-b border-[#ffb59e] pb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb59e]">
        Reset all filters
      </Link>
    </aside>
  );
}
