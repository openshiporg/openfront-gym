import { Metadata } from "next";
import ClassGrid from "@/features/storefront/modules/classes/components/class-grid";
import ClassFilters from "@/features/storefront/modules/classes/components/class-filters";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Classes — ${getStorefrontBrandName(config)}`,
    description: "Browse coached class formats and move into the live schedule to reserve a spot.",
  };
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
    <div className="sf-page">
      <div className="sf-container">
        <header className="sf-page-header">
          <div>
            <p className="sf-eyebrow mb-3">Training menu</p>
            <h1 className="sf-display text-5xl sm:text-6xl">
              Choose the class
              <br />
              <span className="italic">that fits today</span>
            </h1>
          </div>
          <p className="sf-lead max-w-md">
            Filter by intensity or duration, then move into the live schedule to reserve a spot.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ClassFilters selectedDifficulty={difficulty} selectedDuration={duration} />
          <ClassGrid difficulty={difficulty} duration={duration} />
        </div>
      </div>
    </div>
  );
}
