import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX } from "lucide-react";
import { getInstructorById } from "@/features/storefront/lib/data/instructors";
import { getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { difficultyLabel, documentText, firstName as firstNameOf, initials } from "@/features/storefront/lib/presentation";
import { Crumb } from "@/features/storefront/modules/common/page-head";
import { BookSessionLink, SessionRow } from "@/features/storefront/modules/common/session-row";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const instructor = await getInstructorById(params.id);
  if (!instructor) return { title: "Coach not found" };
  return { title: instructor.user.name, description: documentText(instructor.bio) || undefined };
}

export async function InstructorDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [instructor, occurrences, config] = await Promise.all([
    getInstructorById(params.id),
    getUpcomingClassOccurrences({ days: 14, instructorId: params.id, limit: 8 }),
    getStorefrontConfig(),
  ]);
  if (!instructor) notFound();

  const bio = documentText(instructor.bio);
  const specialties = Array.isArray(instructor.specialties) ? instructor.specialties : [];
  const certifications = Array.isArray(instructor.certifications) ? instructor.certifications : [];
  const firstName = firstNameOf(instructor.user.name, "this coach");
  const timeZone = config?.timezone || "UTC";

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <Crumb href="/instructors">Coaches</Crumb>
        <header className="sf-profile sf-rise">
          <div className="sf-stack">
            <h1 className="sf-h1">{instructor.user.name}</h1>
            {specialties.length ? <div className="sf-list-plain">{specialties.map((specialty) => <span key={specialty} className="sf-tag">{specialty}</span>)}</div> : null}
            {bio ? <p className="sf-lead">{bio}</p> : null}
            {certifications.length ? (
              <dl className="sf-facts" data-plain>
                <div><dt>Certifications</dt><dd>{certifications.join(", ")}</dd></div>
              </dl>
            ) : null}
            <div className="sf-actions">
              <Link href={`/schedule?coach=${encodeURIComponent(instructor.id)}`} className="sf-btn" data-variant="accent">Sessions with {firstName}</Link>
              <Link href="/contact" className="sf-btn" data-variant="secondary">Contact</Link>
            </div>
          </div>
          <div className="sf-portrait">
            {instructor.photo ? <Image src={instructor.photo} alt={instructor.user.name} width={900} height={1125} priority sizes="(max-width: 899px) 100vw, 34vw" unoptimized /> : <span className="sf-monogram" aria-hidden="true">{initials(instructor.user.name)}</span>}
          </div>
        </header>

        <section className="sf-section" aria-labelledby="coach-sessions">
          <div className="sf-section-head">
            <h2 id="coach-sessions" className="sf-h2">Upcoming with {firstName}</h2>
            <span className="sf-meta">Times in {timeZone}</span>
          </div>
          {occurrences.length ? (
            <div className="sf-sessions">
              {occurrences.map((occurrence) => {
                const name = occurrence.name || occurrence.classType?.name || "Class";
                const level = difficultyLabel(occurrence.classType?.difficulty);
                return (
                  <SessionRow
                    key={occurrence.id}
                    time={formatOccurrenceTime(occurrence.startsAt, timeZone)}
                    startsAt={occurrence.startsAt}
                    caption={formatOccurrenceDate(occurrence.startsAt, timeZone).replace(/, \d{4}$/, "").replace(/^(\w{3})\w*/, "$1")}
                    title={name}
                    titleHref={occurrence.classType ? `/classes/${occurrence.classType.id}` : undefined}
                    meta={<>
                      {occurrence.classType?.duration ? <span>{occurrence.classType.duration} min</span> : null}
                      {level ? <span>{level}</span> : null}
                    </>}
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
        </section>
      </div>
    </div>
  );
}
