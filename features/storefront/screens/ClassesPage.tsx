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
  searchParams?: Promise<{ difficulty?: string; duration?: string; q?: string }>;
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
              <span>that fits today</span>
            </h1>
          </div>
          <p className="sf-lead max-w-md">
            Find your kind of training. Explore the level, equipment and coaching before choosing a dated session.
          </p>
        </header>

        <div>
          <form action="/classes" className="sf-discovery-filters mb-5"><label>Search class formats<input name="q" type="search" defaultValue={resolved?.q} placeholder="Strength, yoga, conditioning…" /></label><input type="hidden" name="difficulty" value={difficulty} /><input type="hidden" name="duration" value={duration} /><button type="submit" className="sf-btn-primary">Search formats</button></form>
          <ClassFilters q={resolved?.q} selectedDifficulty={difficulty} selectedDuration={duration} />
          <div className="mt-8">
            <ClassGrid q={resolved?.q} difficulty={difficulty} duration={duration} />
          </div>
        </div>
      </div>
    </div>
  );
}
