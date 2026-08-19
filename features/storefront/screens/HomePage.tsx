import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UNCONFIGURED_STOREFRONT, getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getClassSchedules, getClassTypes, getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { formatOccurrenceDate, formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath } from "@/features/storefront/lib/return-path";

function getDescriptionText(description: unknown) {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description !== "object") return "";

  const document = (description as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  const documentText = document
    ?.flatMap((node) => node.children || [])
    .map((child) => child.text || "")
    .join(" ")
    .trim();

  if (documentText) return documentText;

  return JSON.stringify(description)
    .replace(/document|children|text|type|paragraph|\{|\}|\[|\]|\"|:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBioText(bio: unknown) {
  return getDescriptionText(bio);
}

function formatCredits(credits?: number) {
  if (credits === -1) return "Unlimited classes";
  if (!credits) return "Floor access";
  return `${credits} classes / month`;
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: getStorefrontBrandName(config),
    description:
      config?.heroSubheadline ||
      config?.description ||
      UNCONFIGURED_STOREFRONT.description,
  };
}

export async function HomePage() {
  const [config, classTypes, schedules, instructors, tiers, occurrences] = await Promise.all([
    getStorefrontConfig(),
    getClassTypes(),
    getClassSchedules(),
    getInstructors(),
    getMembershipTiers(),
    getUpcomingClassOccurrences({ days: 7, limit: 5 }),
  ]);

  const brandName = getStorefrontBrandName(config);
  const headline =
    config?.heroHeadline?.replace(/\\n/g, "\n") ||
    config?.tagline ||
    brandName;

  const headlineLines = headline.split("\n").filter(Boolean);
  const liveStats = [
    { value: String(classTypes.length), label: "Class formats" },
    { value: String(schedules.length), label: "Weekly sessions" },
    { value: String(instructors.length), label: "Coaches" },
  ];
  const configuredStats = Array.isArray(config?.heroStats)
    ? config.heroStats.filter(
        (stat): stat is { value: string; label: string } =>
          Boolean(stat && String(stat.value ?? "").trim() && String(stat.label ?? "").trim())
      )
    : [];
  const stats = configuredStats.length === 3 ? configuredStats : liveStats;

  const timeZone = config?.timezone || "UTC";
  const upcomingSchedules = occurrences.map((occurrence) => ({
    id: occurrence.id,
    name: occurrence.name,
    date: formatOccurrenceDate(occurrence.startsAt, timeZone),
    time: formatOccurrenceTime(occurrence.startsAt, timeZone),
    instructor: occurrence.instructor?.name,
    spots: occurrence.availability.spotsRemaining,
  }));

  return (
    <div className="bg-[var(--sf-paper)]">
      <section className="border-b border-[var(--sf-rule)]">
        <div className="sf-container grid gap-10 py-10 md:py-14 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-end lg:py-16">
          <div className="flex flex-col justify-end">
            {config?.heroEyebrow ? <p className="sf-eyebrow mb-6">{config.heroEyebrow}</p> : null}
            <h1 className="sf-hero-title">
              {headlineLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            {config?.heroSubheadline || config?.description ? (
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--sf-ink-muted)]">
                {config.heroSubheadline || config.description}
              </p>
            ) : null}
            {config?.heroPrimaryCtaLabel && config.heroPrimaryCtaHref || config?.heroSecondaryCtaLabel && config.heroSecondaryCtaHref ? (
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                {config?.heroPrimaryCtaLabel && config.heroPrimaryCtaHref ? (
                  <Link href={config.heroPrimaryCtaHref} className="sf-btn-primary px-8">
                    {config.heroPrimaryCtaLabel}
                  </Link>
                ) : null}
                {config?.heroSecondaryCtaLabel && config.heroSecondaryCtaHref ? (
                  <Link href={config.heroSecondaryCtaHref} className="sf-btn-secondary px-8">
                    {config.heroSecondaryCtaLabel}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 self-stretch">
            {config?.heroImageUrl ? (
              <div className="relative aspect-[4/3] min-h-64 overflow-hidden border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] lg:min-h-80">
                <Image
                  src={config.heroImageUrl}
                  alt={`${brandName} training floor`}
                  width={1200}
                  height={900}
                  priority
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
            ) : null}
            <dl className="sf-card-dark sf-stat-grid" aria-label="Gym overview">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd className="sf-display">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {classTypes.length > 0 ? (
        <section className="border-b border-[var(--sf-rule)] py-16 lg:py-24">
          <div className="sf-container">
            <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="sf-eyebrow mb-3">Class formats</p>
                <h2 className="sf-display text-4xl sm:text-5xl">What&apos;s on the floor</h2>
              </div>
              <Link href="/classes" className="sf-btn-ghost inline-flex items-center gap-2">
                Full catalog <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="divide-y divide-[var(--sf-rule)] border-y border-[var(--sf-rule)]">
              {classTypes.slice(0, 6).map((program, index) => (
                <article
                  key={program.id}
                  className="grid gap-4 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:py-8"
                >
                  <span className="sf-display text-2xl text-[var(--sf-ink-faint)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-2xl font-semibold tracking-tight">{program.name}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--sf-ink-muted)]">
                      {getDescriptionText(program.description) || "Coached group training."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {program.difficulty ? <span className="sf-tag">{program.difficulty}</span> : null}
                      {program.duration ? <span className="sf-tag">{program.duration} min</span> : null}
                    </div>
                  </div>
                  <Link href={`/classes/${program.id}`} className="sf-btn-secondary w-fit shrink-0">
                    View class
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tiers.length > 0 ? (
        <section className="bg-[var(--sf-paper-2)] py-16 lg:py-24">
          <div className="sf-container">
            <div className="mb-12 max-w-2xl">
              <p className="sf-eyebrow mb-3">Membership</p>
              <h2 className="sf-display text-4xl sm:text-5xl">Choose your access level</h2>
              <p className="mt-4 sf-lead">
                Pricing, class credits, access hours, and freeze terms stay visible before signup.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {tiers.map((tier) => (
                <article key={tier.id} className="sf-card flex flex-col p-8">
                  <h3 className="text-xl font-semibold">{tier.name}</h3>
                  <p className="sf-display mt-4 text-5xl">{formatMajorUnits(tier.monthlyPrice, config?.currencyCode || "USD")}</p>
                  <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">per month</p>
                  <p className="mt-6 flex-1 text-sm leading-7 text-[var(--sf-ink-muted)]">
                    {getDescriptionText(tier.description) || `${formatCredits(tier.classCreditsPerMonth)} · ${tier.accessHours || "member hours"}`}
                  </p>
                  <Link
                    href={`/join?tier=${tier.id}`}
                    className="sf-btn-secondary mt-8 w-full text-center"
                  >
                    Review {tier.name}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {instructors.length > 0 ? (
        <section className="border-b border-[var(--sf-rule)] py-16 lg:py-24">
          <div className="sf-container">
            <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
              <div>
                <p className="sf-eyebrow mb-3">Coaching team</p>
                <h2 className="sf-display text-4xl sm:text-5xl">Instructors with a specialty</h2>
              </div>
              <Link href="/instructors" className="sf-btn-ghost inline-flex items-center gap-2 lg:justify-self-end">
                Meet the team <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {instructors.slice(0, 3).map((coach) => (
                <Link key={coach.id} href={`/instructors/${coach.id}`} className="sf-card group p-6 transition hover:border-[var(--sf-ink)]">
                  <div className="relative flex h-48 items-end overflow-hidden bg-[var(--sf-paper-3)] p-4">
                    {coach.photo ? (
                      <Image
                        src={coach.photo}
                        alt={`${coach.user.name} coaching at ${brandName}`}
                        width={800}
                        height={800}
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <span className="sf-display text-6xl text-[var(--sf-ink-faint)] transition group-hover:text-[var(--sf-accent)]">
                        {coach.user.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{coach.user.name}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-7 text-[var(--sf-ink-muted)]">
                    {getBioText(coach.bio) || coach.specialties?.join(" · ")}
                  </p>
                  {coach.specialties?.length ? (
                    <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-[var(--sf-accent)]">
                      {coach.specialties.slice(0, 2).join(" · ")}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {occurrences.length > 0 ? (
        <section className="py-16 lg:py-24">
          <div className="sf-container grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="sf-eyebrow mb-3">This week</p>
              <h2 className="sf-display text-4xl sm:text-5xl">Sessions you can book now</h2>
              <p className="mt-4 max-w-md sf-lead">
                {occurrences.length} dated sessions are currently bookable. Pick a time, check live capacity, and reserve through the member flow.
              </p>
              <Link href="/schedule" className="sf-btn-primary mt-8 inline-flex">
                Open full schedule
              </Link>
            </div>

            <div className="divide-y divide-[var(--sf-rule)] border border-[var(--sf-rule)]">
              {upcomingSchedules.map((session) => (
                <div key={session.id} className="grid gap-2 px-5 py-5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                  <span className="text-sm font-semibold tabular-nums text-[var(--sf-accent)]">{session.time}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{session.name}</p>
                    <p className="text-sm text-[var(--sf-ink-muted)]">{session.date}</p>
                    <p className="text-sm text-[var(--sf-ink-muted)]">
                      {session.instructor ? `with ${session.instructor} · ` : ""}{session.spots > 0 ? `${session.spots} spots left` : "Waitlist only"}
                    </p>
                  </div>
                  <Link href={bookingReturnPath(session.id)} className="text-sm font-medium underline underline-offset-4">
                    {session.spots > 0 ? "Reserve" : "Waitlist"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {config?.footerTagline || config?.promoBanner || config?.heroPrimaryCtaLabel || config?.heroSecondaryCtaLabel ? (
        <section className="border-t border-[var(--sf-rule)] bg-[var(--sf-ink)] py-16 text-[oklch(94%_0.01_85)] lg:py-20">
          <div className="sf-container grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              {config?.promoBanner ? <p className="sf-eyebrow text-[oklch(72%_0.08_55)]">{config.promoBanner}</p> : null}
              <h2 className="sf-display mt-4 text-4xl italic sm:text-5xl">
                {config?.footerTagline || brandName}
              </h2>
              {config?.address ? <p className="mt-4 text-sm text-[oklch(78%_0.01_85)]">{config.address}</p> : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              {config?.heroPrimaryCtaLabel && config.heroPrimaryCtaHref ? (
                <Link href={config.heroPrimaryCtaHref} className="sf-btn border border-[oklch(94%_0.01_85)] bg-[oklch(94%_0.01_85)] text-[var(--sf-ink)] hover:bg-white">
                  {config.heroPrimaryCtaLabel}
                </Link>
              ) : null}
              {config?.heroSecondaryCtaLabel && config.heroSecondaryCtaHref ? (
                <Link href={config.heroSecondaryCtaHref} className="sf-btn border border-[oklch(55%_0.02_55)] text-[oklch(94%_0.01_85)] hover:bg-[oklch(30%_0.02_55)]">
                  {config.heroSecondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
