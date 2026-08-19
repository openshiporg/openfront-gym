import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronLeft, Clock, Flame, Dumbbell, MapPin } from "lucide-react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getClassTypeById, getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath } from "@/features/storefront/lib/return-path";

function getDescriptionText(description: unknown): string {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return "";

  const document = (description as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  const text = document
    ?.flatMap((node) => node.children || [])
    .map((child) => child.text || "")
    .join(" ")
    .trim();

  if (text) return text;

  return JSON.stringify(description)
    .replace(/document|children|text|type|paragraph|\{|\}|\[|\]|\"|:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Foundations",
  intermediate: "Progressive",
  advanced: "Performance",
  "all-levels": "All levels",
};

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const [classType, config] = await Promise.all([
    getClassTypeById(params.id),
    getStorefrontConfig(),
  ]);
  const brand = getStorefrontBrandName(config);
  if (!classType) return { title: `Class not found — ${brand}` };
  return {
    title: `${classType.name} — ${brand}`,
    description: getDescriptionText(classType.description) || `Coached ${classType.name} sessions.`,
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

  const description = getDescriptionText(classType.description);
  const difficulty = DIFFICULTY_LABEL[classType.difficulty] ?? "All levels";
  const equipment = Array.isArray(classType.equipmentNeeded) ? classType.equipmentNeeded : [];
  const brand = getStorefrontBrandName(config);
  const timeZone = config?.timezone || "UTC";
  const location = config?.address || config?.locationName || "Main studio";

  return (
    <div className="sf-page">
      <div className="sf-container">
        <Link
          href="/classes"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--sf-ink-muted)] transition hover:text-[var(--sf-accent)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Training catalog
        </Link>

        <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* Main */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="sf-tag border-[var(--sf-accent)] text-[var(--sf-accent)]">{difficulty}</span>
              {classType.duration ? <span className="sf-tag">{classType.duration} min</span> : null}
              {classType.caloriesBurn ? (
                <span className="sf-tag inline-flex items-center gap-1.5">
                  <Flame className="h-3 w-3" /> {classType.caloriesBurn} cal
                </span>
              ) : null}
            </div>

            <h1 className="sf-display mt-6 text-5xl sm:text-6xl">{classType.name}</h1>

            {description ? (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--sf-ink-muted)]">{description}</p>
            ) : (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--sf-ink-muted)]">
                Coached {classType.name.toLowerCase()} sessions on the {brand} floor.
              </p>
            )}

            {/* Spec row */}
            <div className="mt-12 grid grid-cols-2 gap-px border border-[var(--sf-rule)] bg-[var(--sf-rule)] sm:grid-cols-3">
              <div className="flex flex-col items-center justify-center gap-2 bg-[var(--sf-paper)] py-8">
                <Clock className="h-5 w-5 text-[var(--sf-accent)]" />
                <p className="sf-display text-3xl">{classType.duration || "—"}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--sf-ink-muted)]">minutes</p>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 bg-[var(--sf-paper)] py-8">
                <Flame className="h-5 w-5 text-[var(--sf-accent)]" />
                <p className="sf-display text-3xl">{classType.caloriesBurn ?? "—"}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--sf-ink-muted)]">calories</p>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 bg-[var(--sf-paper)] py-8 sm:col-span-1 col-span-2">
                <Dumbbell className="h-5 w-5 text-[var(--sf-accent)]" />
                <p className="sf-display text-3xl">{equipment.length || "—"}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--sf-ink-muted)]">equipment</p>
              </div>
            </div>

            {/* Equipment */}
            {equipment.length > 0 ? (
              <section className="mt-12">
                <p className="sf-eyebrow mb-4">Equipment needed</p>
                <div className="flex flex-wrap gap-2">
                  {equipment.map((item: string) => (
                    <span key={item} className="sf-tag">{item}</span>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Booking pointer */}
            <section className="mt-12 border-t border-[var(--sf-rule)] pt-10">
              <p className="sf-eyebrow mb-3">Book this format</p>
              <h2 className="sf-display text-3xl sm:text-4xl">Choose a dated session</h2>
              <p className="mt-4 max-w-xl sf-lead">
                Capacity below belongs to a specific class occurrence, not the recurring template.
              </p>
              {occurrences.length ? (
                <div className="mt-8 divide-y divide-[var(--sf-rule)] border-y border-[var(--sf-rule)]">
                  {occurrences.map((occurrence) => (
                    <div key={occurrence.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <CalendarDays className="h-4 w-4 text-[var(--sf-accent)]" />
                          {formatOccurrenceDate(occurrence.startsAt, timeZone)} · {formatOccurrenceTime(occurrence.startsAt, timeZone)}
                        </p>
                        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--sf-ink-muted)]">
                          <MapPin className="h-3.5 w-3.5" /> {location} · {occurrence.availability.spotsRemaining} spot{occurrence.availability.spotsRemaining === 1 ? "" : "s"} left
                        </p>
                      </div>
                      <Link href={bookingReturnPath(occurrence.id)} className="sf-btn-secondary w-fit">
                        {occurrence.availability.spotsRemaining > 0 ? "Book" : "Join waitlist"}
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-8 border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] px-5 py-5 text-sm text-[var(--sf-ink-muted)]">
                  No upcoming dated occurrence is currently published for this format.
                </p>
              )}
              <Link href="/schedule" className="sf-btn-primary mt-8 inline-flex items-center gap-2">
                Open full schedule <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="sf-card p-8">
              <p className="sf-eyebrow">Ready when you are</p>
              <h2 className="sf-display mt-3 text-3xl italic">Train with us</h2>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sf-ink-muted)]">
                Classes are included with membership. Start a membership or jump straight into the schedule.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/schedule" className="sf-btn-primary w-full">View schedule</Link>
                <Link href="/memberships" className="sf-btn-secondary w-full">See memberships</Link>
              </div>
            </div>

            <div className="sf-card mt-4 p-6">
              <h3 className="sf-label">Questions about this class?</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--sf-ink-muted)]">
                The front desk can confirm prerequisites, room, and availability.
              </p>
              <Link href="/contact" className="sf-btn-ghost mt-4 inline-flex">
                Contact the desk
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
