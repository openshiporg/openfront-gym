import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  return "";
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
  const difficulty = DIFFICULTY_LABEL[classType.difficulty] ?? (classType.difficulty || "Level not published");
  const equipment = Array.isArray(classType.equipmentNeeded) ? classType.equipmentNeeded : [];
  const timeZone = config?.timezone || "UTC";
  const location = "Session location not published · confirm with the club";

  return <div className="sf-page"><div className="sf-container">
    <Link href="/classes" className="sf-link">← All class formats</Link>
    <header className="sf-page-header mt-8"><div><p className="sf-eyebrow">{difficulty} · Typically {classType.duration} minutes</p><h1 className="sf-display mt-4">{classType.name}</h1></div><p className="sf-lead">{description || "Explore upcoming sessions or ask the coaching team what to expect from this format."}</p></header>
    <div className="sf-detail-grid"><section aria-labelledby="format-sessions"><div className="sf-section-heading"><h2 id="format-sessions">Choose your next session</h2></div><p className="sf-muted mb-5">Up to six upcoming sessions in the next 14 days. Times in {timeZone}.</p>
      {occurrences.length ? <div className="sf-session-list">{occurrences.map(occurrence => <article className="sf-detail-session" key={occurrence.id}><div><time className="text-xl font-semibold" dateTime={occurrence.startsAt}>{formatOccurrenceTime(occurrence.startsAt, timeZone)}</time><p className="sf-muted text-sm mt-1">{formatOccurrenceDate(occurrence.startsAt, timeZone)}</p>{occurrence.instructor ? <Link className="sf-link text-sm mt-3 inline-flex" href={`/instructors/${occurrence.instructor.id}`}>With {occurrence.instructor.name} →</Link> : <p className="sf-muted text-sm mt-3">Coach not published</p>}<p className="sf-muted text-xs mt-2">{location}</p></div><div className="space-y-3"><p className="sf-badge">{occurrence.availability.spotsRemaining > 0 ? `${occurrence.availability.spotsRemaining} spaces` : "Waitlist available"}</p><Link href={bookingReturnPath(occurrence.id)} className={occurrence.availability.spotsRemaining > 0 ? "sf-btn-primary" : "sf-btn-secondary"}>{occurrence.availability.spotsRemaining > 0 ? "Book session" : "Join waitlist"}</Link></div></article>)}</div> : <div className="sf-empty"><h3>No sessions published in this window</h3><p>Explore other class formats or ask the club when this class returns.</p><Link href="/schedule" className="sf-btn-secondary">Explore the timetable</Link></div>}
      <Link className="sf-link mt-6 inline-flex" href={`/schedule?format=${encodeURIComponent(classType.id)}`}>See this format in the full timetable →</Link>
    </section><aside className="space-y-5"><section className="sf-panel"><p className="sf-eyebrow">Before you arrive</p><h2 className="text-2xl font-semibold mt-3">Get ready for the session</h2><dl className="sf-facts"><div><dt>Level</dt><dd>{difficulty}</dd></div><div><dt>Typical class length</dt><dd>{classType.duration} minutes</dd></div><div><dt>Equipment listed for this format</dt><dd>{equipment.length ? equipment.join(" · ") : "Ask the club what to bring"}</dd></div></dl><p className="sf-muted text-sm">Confirm equipment, prerequisites and your session location with the club if you are visiting for the first time.</p><Link href="/contact" className="sf-link mt-4 inline-flex">Ask about this class →</Link></section><section className="sf-notice"><strong>Membership and class access</strong><p>Your plan must include eligible class access. Availability and credits for the session date are checked when you book.</p><Link href="/memberships" className="sf-link">Compare membership options →</Link></section><Link href="/policies" className="sf-link inline-flex">Booking and participation guidance →</Link></aside></div>
  </div></div>;
}
