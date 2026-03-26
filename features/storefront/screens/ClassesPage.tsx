import { Metadata } from "next";
import ClassGrid from "@/features/storefront/modules/classes/components/class-grid";
import ClassFilters from "@/features/storefront/modules/classes/components/class-filters";

export const metadata: Metadata = {
  title: "Classes - Openfront Gym",
  description: "Browse and book fitness classes. Yoga, Spin, HIIT, Strength Training and more.",
};

export async function generateMetadata(): Promise<Metadata> {
  return metadata;
}

export async function ClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ difficulty?: string; duration?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const difficulty = resolved?.difficulty ?? "all";
  const duration = resolved?.duration ?? "all";

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">Performance architecture</p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              The training
              <br />
              catalog
            </h1>
          </div>
          <p className="max-w-md border-l-2 border-[#ffb59e] pl-6 text-base leading-relaxed text-[#c4c7c7]">
            Filter by intensity or duration to find the next class in your progression stack.
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-[280px_1fr]">
          <ClassFilters selectedDifficulty={difficulty} selectedDuration={duration} />
          <ClassGrid difficulty={difficulty} duration={duration} />
        </div>
      </div>
    </div>
  );
}
