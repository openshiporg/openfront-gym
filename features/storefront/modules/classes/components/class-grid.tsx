import Link from "next/link";
import { ArrowUpRight, SearchX } from "lucide-react";
import { getClassTypePage } from "@/features/storefront/lib/data/classes";
import { difficultyLabel, documentText, humanizeLabel } from "@/features/storefront/lib/presentation";
import { EmptyState } from "@/features/storefront/modules/common/ui";

/** Class formats filtered by the server (name search, level, length), one page at a time. */
export default async function ClassGrid({ difficulty, duration, q, after }: { difficulty?: string; duration?: string; q?: string; after?: string }) {
  const page = await getClassTypePage({ q, difficulty, duration, after });
  const filtered = page.items;
  const filteredView = Boolean(q || (difficulty && difficulty !== "all") || (duration && duration !== "all"));
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
  if (duration && duration !== "all") params.set("duration", duration);
  const firstHref = params.toString() ? `/classes?${params}` : "/classes";
  const moreHref = page.nextAfter ? `/classes?${new URLSearchParams([...params, ["after", page.nextAfter]])}` : null;

  if (!filtered.length) {
    return (
      <EmptyState
        headingLevel={2}
        icon={<SearchX aria-hidden="true" />}
        title={after ? "No more classes" : filteredView ? "No classes match" : "No classes published"}
        action={after ? <Link className="sf-btn" data-variant="secondary" data-size="sm" href={firstHref}>First classes</Link> : filteredView ? <Link className="sf-btn" data-variant="secondary" data-size="sm" href="/classes">Clear filters</Link> : null}
      />
    );
  }

  return (
    <>
      <p className="sf-meta" role="status" style={{ marginBottom: 14 }}>
        {after || moreHref ? `Showing ${filtered.length} ${filtered.length === 1 ? "class" : "classes"}` : `${filtered.length} ${filtered.length === 1 ? "class" : "classes"}`}
      </p>
      <div className="sf-grid" data-cols="3">
        {filtered.map((classType) => {
          const description = documentText(classType.description);
          const equipment = (classType.equipmentNeeded || []).filter(Boolean);
          const level = difficultyLabel(classType.difficulty);
          return (
            <article className="sf-class-card" key={classType.id}>
              <ArrowUpRight className="sf-arrow-mark" aria-hidden="true" />
              <h2 className="sf-h3"><Link href={`/classes/${classType.id}`}>{classType.name}</Link></h2>
              <div className="sf-list-plain">
                {level ? <span className="sf-tag">{level}</span> : null}
                <span className="sf-tag">{classType.duration} min</span>
              </div>
              {description ? <p>{description}</p> : null}
              {equipment.length ? <p className="sf-meta">Bring: {equipment.map(humanizeLabel).join(", ")}</p> : null}
              <footer>
                <Link href={`/schedule?format=${encodeURIComponent(classType.id)}`} className="sf-btn" data-variant="secondary" data-size="sm">Sessions</Link>
              </footer>
            </article>
          );
        })}
      </div>
      {after || moreHref ? (
        <nav className="sf-row" data-between aria-label="Class pages" style={{ marginTop: 24 }}>
          {after ? <Link className="sf-link" href={firstHref}>First classes</Link> : <span />}
          {moreHref ? <Link className="sf-link" href={moreHref}>More classes</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
