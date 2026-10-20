import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX } from "lucide-react";
import { getClassTypeById, getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { difficultyLabel, documentText, humanizeLabel } from "@/features/storefront/lib/presentation";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { BookSessionLink, SessionRow } from "@/features/storefront/modules/common/session-row";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const classType = await getClassTypeById(params.id);
  if (!classType) return { title: "Class not found" };
  return {
    title: classType.name,
    description: documentText(classType.description) || undefined,
  };
}

export async function ClassDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [classType, config, occurrences] = await Promise.all([
    getClassTypeById(params.id),
    getStorefrontConfig(),
    getUpcomingClassOccurrences({ days: 14, classTypeId: params.id, limit: 6 }),
  ]);
  if (!classType) notFound();

  const description = documentText(classType.description);
  const level = difficultyLabel(classType.difficulty);
  const equipment = Array.isArray(classType.equipmentNeeded) ? classType.equipmentNeeded.filter(Boolean) : [];
  const timeZone = config?.timezone || "UTC";

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead
          crumb={{ href: "/classes", label: "Classes" }}
          title={classType.name}
          lead={description || undefined}
        />

        <div className="sf-detail">
          <section aria-labelledby="class-sessions" className="sf-stack">
            <div className="sf-section-head" style={{ marginBottom: 0 }}>
              <h2 id="class-sessions" className="sf-h2">Upcoming</h2>
              <span className="sf-meta">Times in {timeZone}</span>
            </div>
            {occurrences.length ? (
              <div className="sf-sessions">
                {occurrences.map(occurrence => {
                  const name = occurrence.name || classType.name;
                  return (
                    <SessionRow
                      key={occurrence.id}
                      time={formatOccurrenceTime(occurrence.startsAt, timeZone)}
                      startsAt={occurrence.startsAt}
                      caption={formatOccurrenceDate(occurrence.startsAt, timeZone).replace(/, \d{4}$/, "").replace(/^(\w{3})\w*/, "$1")}
                      title={name}
                      meta={occurrence.instructor ? <Link href={`/instructors/${occurrence.instructor.id}`}>{occurrence.instructor.name}</Link> : <span>Coach not published</span>}
                      spots={occurrence.availability.spotsRemaining}
                      capacity={occurrence.availability.maxCapacity}
                      waitlist={occurrence.availability.waitlistCount}
                      action={<BookSessionLink id={occurrence.id} name={name} spots={occurrence.availability.spotsRemaining} />}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<CalendarX aria-hidden="true" />} title="No sessions in the next 14 days" action={<ArrowLink href="/schedule">Schedule</ArrowLink>} />
            )}
            <div><ArrowLink href={`/schedule?format=${encodeURIComponent(classType.id)}`}>All {classType.name} sessions</ArrowLink></div>
          </section>

          <aside className="sf-detail-aside sf-card" aria-label="Class details">
            <dl className="sf-facts" data-plain>
              <div><dt>Level</dt><dd>{level || "Not published"}</dd></div>
              <div><dt>Length</dt><dd>{classType.duration} min</dd></div>
              <div><dt>Equipment</dt><dd>{equipment.length ? equipment.map(humanizeLabel).join(", ") : "None listed"}</dd></div>
            </dl>
            <div className="sf-actions">
              <Link href="/memberships" className="sf-btn" data-variant="secondary" data-size="sm">Memberships</Link>
              <Link href="/contact" className="sf-btn" data-variant="ghost" data-size="sm">Contact</Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
