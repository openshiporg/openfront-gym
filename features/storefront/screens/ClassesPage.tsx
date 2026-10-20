import { Metadata } from "next";
import { Search } from "lucide-react";
import ClassGrid from "@/features/storefront/modules/classes/components/class-grid";
import ClassFilters from "@/features/storefront/modules/classes/components/class-filters";
import { PageHead } from "@/features/storefront/modules/common/page-head";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Classes",
    description: "Class formats by level and length, each linked to its dated sessions.",
  };
}

export async function ClassesPage({
  searchParams,
}: {
  searchParams?: Promise<{ difficulty?: string; duration?: string; q?: string; after?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const difficulty = resolved?.difficulty ?? "all";
  const duration = resolved?.duration ?? "all";

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Classes" />

        <div className="sf-stack">
          <form action="/classes" role="search" className="sf-row" data-gap="sm">
            <label className="sf-search" style={{ flex: "1 1 16rem" }}>
              <span className="sr-only">Search classes</span>
              <Search aria-hidden="true" />
              <input name="q" type="search" defaultValue={resolved?.q} placeholder="Search classes" className="sf-input" />
            </label>
            <input type="hidden" name="difficulty" value={difficulty} />
            <input type="hidden" name="duration" value={duration} />
            <button type="submit" className="sf-btn">Search</button>
          </form>
          <ClassFilters q={resolved?.q} selectedDifficulty={difficulty} selectedDuration={duration} />
        </div>

        <div style={{ marginTop: 28 }}>
          <ClassGrid q={typeof resolved?.q === "string" ? resolved.q : undefined} difficulty={difficulty} duration={duration} after={typeof resolved?.after === "string" ? resolved.after.slice(0, 100) : undefined} />
        </div>
      </div>
    </div>
  );
}
