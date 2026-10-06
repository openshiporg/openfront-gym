import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarX, Medal } from "lucide-react";
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
  return document?.flatMap((node) => node.children || []).map((child) => child.text || "").join(" ").trim() || fallback;
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const [instructor, config] = await Promise.all([getInstructorById(params.id), getStorefrontConfig()]);
  const brand = getStorefrontBrandName(config);
  if (!instructor) return { title: `Instructor not found — ${brand}` };
  return { title: `${instructor.user.name} — Instructor — ${brand}`, description: getDocumentText(instructor.bio, `Coach ${instructor.user.name}.`) };
}

export async function InstructorDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [instructor, occurrences, config] = await Promise.all([
    getInstructorById(params.id),
    getUpcomingClassOccurrences({ days: 14, instructorId: params.id, limit: 8 }),
    getStorefrontConfig(),
  ]);
  if (!instructor) notFound();

  const bio = getDocumentText(instructor.bio);
  const specialties = Array.isArray(instructor.specialties) ? instructor.specialties : [];
  const certifications = Array.isArray(instructor.certifications) ? instructor.certifications : [];
  const firstName = instructor.user.name.split(" ")[0];
  const timeZone = config?.timezone || "UTC";

  return (
    <>
      <section className="border-b border-[var(--sf-border)]">
        <div className="sf-container py-8 lg:py-12">
          <Link href="/instructors" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--sf-muted)] transition-colors hover:text-[var(--sf-foreground)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All coaches</Link>
          <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,0.88fr)_minmax(21rem,0.54fr)] lg:items-end lg:gap-14">
            <div><p className="sf-eyebrow">Coach profile</p><h1 className="sf-display mt-5 max-w-[15ch] text-5xl sm:text-6xl lg:text-7xl">{instructor.user.name}</h1>{bio ? <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--sf-muted)] sm:text-lg">{bio}</p> : <p className="mt-7 text-base text-[var(--sf-muted)]">A public biography has not been published for this coach.</p>}<div className="sf-actions"><a href="#coach-sessions" className="sf-btn-primary">Train with {firstName} ↓</a><Link href="/contact" className="sf-btn-secondary">Ask about personal training</Link></div>{specialties.length ? <div className="mt-7 flex flex-wrap gap-2">{specialties.map((specialty) => <span key={specialty} className="sf-tag bg-[var(--sf-surface)]">{specialty}</span>)}</div> : null}</div>
            <div className="relative min-h-64 overflow-hidden border border-[var(--sf-border)] bg-[var(--sf-surface-strong)] sm:min-h-[24rem]">{instructor.photo ? <Image src={instructor.photo} alt={`${instructor.user.name} coaching portrait`} width={900} height={1100} priority sizes="(max-width: 1024px) 100vw, 38vw" className="absolute inset-0 h-full w-full object-cover grayscale-[25%]" unoptimized /> : null}</div>
          </div>
        </div>
      </section>

      {certifications.length ? <section className="border-b border-[var(--sf-border)] bg-[var(--sf-surface)]"><div className="sf-container flex flex-col gap-4 py-7 sm:flex-row sm:items-center sm:gap-8"><div className="flex items-center gap-3 text-sm font-semibold"><Medal className="h-5 w-5 text-[var(--sf-primary)]" aria-hidden="true" />Published certifications</div><p className="text-sm text-[var(--sf-muted)]">{certifications.join(" / ")}</p></div></section> : null}

      <section className="py-16 lg:py-24">
        <div className="sf-container grid gap-10 lg:grid-cols-[minmax(15rem,0.42fr)_minmax(0,1fr)] lg:gap-16">
          <div><h2 className="sf-display text-4xl sm:text-5xl"id="coach-sessions">Upcoming with {firstName}</h2><p className="mt-5 max-w-md leading-7 text-[var(--sf-muted)]">{timeZone}. See up to eight upcoming sessions in the next 14 days. All times are shown in the club’s timezone.</p><div className="mt-8 flex flex-wrap gap-3"><Link href={`/schedule?coach=${encodeURIComponent(instructor.id)}`} className="sf-btn-secondary">All sessions with {firstName}</Link><Link href="/memberships" className="sf-btn-ghost">Memberships</Link><Link href="/contact" className="sf-btn-ghost">Contact</Link></div></div>
          {occurrences.length ? (
            <div className="border-t border-[var(--sf-border)]">{occurrences.map((occurrence) => <article key={occurrence.id} className="grid gap-5 border-b border-[var(--sf-border)] py-6 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"><div><p className="font-bold tabular-nums text-[var(--sf-primary)]">{formatOccurrenceTime(occurrence.startsAt, timeZone)}</p><p className="mt-1 text-xs text-[var(--sf-muted)]">{formatOccurrenceDate(occurrence.startsAt, timeZone)}</p></div><div><h3 className="font-semibold">{occurrence.name || occurrence.classType?.name || "Class"}</h3><p className="mt-1 text-sm text-[var(--sf-muted)]">{occurrence.classType?.name || "Class format not published"}</p></div><div className="sm:text-right"><p className="text-sm font-semibold">{occurrence.availability.spotsRemaining > 0 ? `${occurrence.availability.spotsRemaining} spots open` : "Waitlist"}</p><Link href={bookingReturnPath(occurrence.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--sf-primary)] underline underline-offset-4">{occurrence.availability.spotsRemaining > 0 ? "Reserve" : "Join waitlist"}<ArrowRight className="h-3 w-3" aria-hidden="true" /></Link></div></article>)}</div>
          ) : (
            <div className="border border-[var(--sf-border)] bg-[var(--sf-surface)] p-8 sm:p-10"><CalendarX className="h-8 w-8 text-[var(--sf-primary)]" aria-hidden="true" /><h2 className="mt-7 text-xl font-bold">No dated sessions are listed.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-[var(--sf-muted)]">No upcoming sessions are published for this coach in the next 14 days. Ask the club about their next classes.</p></div>
          )}
        </div>
      </section>
    </>
  );
}
