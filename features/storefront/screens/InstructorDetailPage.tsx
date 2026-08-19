import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Calendar, ChevronLeft, Clock, MapPin } from "lucide-react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getInstructorById } from "@/features/storefront/lib/data/instructors";
import { getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath } from "@/features/storefront/lib/return-path";

function getDocumentText(value: unknown, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return fallback;

  const document = (value as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  const text = document
    ?.flatMap((node) => node.children || [])
    .map((child) => child.text || "")
    .join(" ")
    .trim();

  return text || fallback;
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const [instructor, config] = await Promise.all([
    getInstructorById(params.id),
    getStorefrontConfig(),
  ]);
  const brand = getStorefrontBrandName(config);
  if (!instructor) return { title: `Instructor not found — ${brand}` };
  return {
    title: `${instructor.user.name} — Instructor — ${brand}`,
    description: getDocumentText(instructor.bio, `Coach ${instructor.user.name}.`),
  };
}

export async function InstructorDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [instructor, occurrences, config] = await Promise.all([
    getInstructorById(params.id),
    getUpcomingClassOccurrences({ days: 14, instructorId: params.id, limit: 8 }),
    getStorefrontConfig(),
  ]);
  if (!instructor) notFound();

  const bio = getDocumentText(instructor.bio, "");
  const specialties = Array.isArray(instructor.specialties) ? instructor.specialties : [];
  const firstName = instructor.user.name.split(" ")[0];
  const brand = getStorefrontBrandName(config);
  const timeZone = config?.timezone || "UTC";
  const location = config?.address || config?.locationName || "Main studio";

  const initials = instructor.user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sf-page">
      <div className="sf-container">
        <Link
          href="/instructors"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--sf-ink-muted)] transition hover:text-[var(--sf-accent)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Coaching team
        </Link>

        <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* Main */}
          <div className="min-w-0">
            {/* Header */}
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center bg-[var(--sf-paper-3)] text-5xl font-semibold text-[var(--sf-ink-faint)]">
                {instructor.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={instructor.photo}
                    alt={instructor.user.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="sf-eyebrow">Instructor</p>
                <h1 className="sf-display mt-2 text-5xl sm:text-6xl">{instructor.user.name}</h1>
                {bio ? (
                  <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--sf-ink-muted)]">{bio}</p>
                ) : (
                  <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--sf-ink-muted)]">
                    Coach {firstName} leads sessions on the {brand} floor.
                  </p>
                )}

                {specialties.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {specialties.map((specialty: string) => (
                      <span key={specialty} className="sf-tag">{specialty}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Weekly schedule */}
            <section className="mt-12 border-t border-[var(--sf-rule)] pt-10">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="sf-eyebrow mb-2">This week</p>
                  <h2 className="sf-display text-3xl sm:text-4xl">Sessions with {firstName}</h2>
                </div>
                <Link href="/schedule" className="sf-btn-ghost inline-flex items-center gap-2">
                  Full schedule <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {occurrences.length === 0 ? (
                <p className="border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] px-6 py-8 text-sm text-[var(--sf-ink-muted)]">
                  No dated sessions are listed for {firstName} right now. Check the full schedule for newly published occurrences.
                </p>
              ) : (
                <div className="divide-y divide-[var(--sf-rule)] border-y border-[var(--sf-rule)]">
                  {occurrences.map((occurrence) => (
                    <div
                      key={occurrence.id}
                      className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--sf-accent)]">
                          <Calendar className="h-4 w-4" />
                          {formatOccurrenceDate(occurrence.startsAt, timeZone)}
                        </div>
                        <p className="mt-1 font-medium">{occurrence.name || "Class"}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--sf-ink-muted)]">
                          <Clock className="h-3.5 w-3.5" />
                          {formatOccurrenceTime(occurrence.startsAt, timeZone)} · {occurrence.availability.spotsRemaining} spot{occurrence.availability.spotsRemaining === 1 ? "" : "s"} left
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--sf-ink-muted)]">
                          <MapPin className="h-3.5 w-3.5" /> {location}
                        </p>
                      </div>
                      <Link href={bookingReturnPath(occurrence.id)} className="sf-btn-secondary w-fit shrink-0">
                        {occurrence.availability.spotsRemaining > 0 ? "Reserve" : "Join waitlist"}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="sf-card-dark p-8">
              <p className="sf-eyebrow text-[oklch(72%_0.08_55)]">Train with {firstName}</p>
              <h2 className="sf-display mt-3 text-3xl italic text-white">Book a session</h2>
              <p className="mt-4 text-sm leading-relaxed text-[oklch(78%_0.01_85)]">
                {firstName}&apos;s classes are included with membership. Reserve a spot from the live schedule.
              </p>
              <Link
                href="/schedule"
                className="sf-btn mt-6 w-full border border-[oklch(94%_0.01_85)] bg-[oklch(94%_0.01_85)] text-[var(--sf-ink)] hover:bg-white"
              >
                View schedule
              </Link>
            </div>

            <div className="sf-card mt-4 p-6">
              <h3 className="sf-label">Not a member yet?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--sf-ink-muted)]">
                Membership unlocks booked classes and open floor access.
              </p>
              <Link href="/memberships" className="sf-btn-ghost mt-4 inline-flex">
                See membership plans
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
