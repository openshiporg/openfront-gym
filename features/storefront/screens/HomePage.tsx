import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarSearch } from "lucide-react";
import { UNCONFIGURED_STOREFRONT, getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getClassTypes, getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { getMembershipTiers } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath, joinPath } from "@/features/storefront/lib/return-path";
import { calendarDays, creditLabel, localDateKey } from "@/features/storefront/lib/discovery";
import { mapLink, publishedHours } from "@/features/storefront/lib/contact-config";
import { difficultyLabel, documentText, initials } from "@/features/storefront/lib/presentation";
import { BookSessionLink, SessionRow } from "@/features/storefront/modules/common/session-row";
import { ArrowLink, EmptyState, SectionHead } from "@/features/storefront/modules/common/ui";
import { HoursList } from "@/features/storefront/modules/layout/templates/footer";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: { absolute: getStorefrontBrandName(config) },
    description: config?.heroSubheadline || config?.description || UNCONFIGURED_STOREFRONT.description,
  };
}

export async function HomePage() {
  const [config, formats, coaches, tiers, sessions] = await Promise.all([
    getStorefrontConfig(),
    getClassTypes(),
    getInstructors(),
    getMembershipTiers(),
    getUpcomingClassOccurrences({ days: 7, limit: 100 }),
  ]);
  const brand = getStorefrontBrandName(config);
  const zone = config?.timezone || "UTC";
  const currency = config?.currencyCode || "USD";
  const headline = config?.heroHeadline?.replace(/\\n/g, "\n") || config?.tagline || brand;
  const subline = config?.heroSubheadline || config?.description || null;
  const primaryCta = config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref
    ? { label: config.heroPrimaryCtaLabel, href: config.heroPrimaryCtaHref }
    : { label: "Book a class", href: "/schedule" };
  const secondaryCta = config?.heroSecondaryCtaLabel && config?.heroSecondaryCtaHref
    ? { label: config.heroSecondaryCtaLabel, href: config.heroSecondaryCtaHref }
    : { label: "Memberships", href: "/memberships" };
  const days = calendarDays(new Date(), zone, 7);
  const dayCaption = (startsAt: string) => {
    const key = localDateKey(startsAt, zone);
    const index = days.findIndex((day) => day.key === key);
    return index === 0 ? "Today" : index === 1 ? "Tomorrow" : days[index]?.label ?? "";
  };
  const upNext = sessions.slice(0, 5);
  const week = days.map((day) => ({ ...day, sessions: sessions.filter((session) => localDateKey(session.startsAt, zone) === day.key) }));
  const hours = publishedHours(config?.hours);

  return (
    <div className="sf-wrap">
      <section className="sf-hero" aria-labelledby="home-title">
        <div className="sf-hero-media" data-plain={config?.heroImageUrl ? undefined : true}>
          {config?.heroImageUrl ? (
            <Image src={config.heroImageUrl} alt="" fill priority sizes="(max-width: 1099px) 100vw, 66vw" unoptimized />
          ) : null}
          <div className="sf-hero-copy">
            {config?.heroEyebrow ? <p className="sf-hero-sub" data-eyebrow>{config.heroEyebrow}</p> : null}
            <h1 id="home-title" className="sf-hero-title">{headline}</h1>
            {subline ? <p className="sf-hero-sub">{subline}</p> : null}
            <div className="sf-actions">
              <Link href={primaryCta.href} className="sf-btn" data-variant="accent" data-size="lg">{primaryCta.label}</Link>
              <Link href={secondaryCta.href} className="sf-btn" data-variant="outline-night" data-size="lg">{secondaryCta.label}</Link>
            </div>
          </div>
        </div>

        <section className="sf-upnext sf-rise-2" aria-labelledby="home-upnext">
          <div className="sf-upnext-head">
            <h2 id="home-upnext" className="sf-h3">Up next</h2>
            <ArrowLink href="/schedule" size="sm">Schedule</ArrowLink>
          </div>
          {upNext.length ? (
            <div className="sf-sessions">
              {upNext.map((session) => {
                const name = session.name || session.classType?.name || "Class";
                return (
                  <SessionRow
                    key={session.id}
                    time={formatOccurrenceTime(session.startsAt, zone)}
                    startsAt={session.startsAt}
                    caption={dayCaption(session.startsAt)}
                    title={name}
                    titleHref={session.classType ? `/classes/${session.classType.id}` : undefined}
                    meta={<>
                      {session.instructor ? <Link href={`/instructors/${session.instructor.id}`}>{session.instructor.name}</Link> : null}
                      {session.classType?.duration ? <span>{session.classType.duration} min</span> : null}
                    </>}
                    spots={session.availability.spotsRemaining}
                    capacity={session.availability.maxCapacity}
                    waitlist={session.availability.waitlistCount}
                    action={<BookSessionLink id={session.id} name={name} spots={session.availability.spotsRemaining} />}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<CalendarSearch aria-hidden="true" />} title="No sessions this week" action={<ArrowLink href="/classes">Browse classes</ArrowLink>}>
              This week’s timetable isn’t published yet. See the class formats, or ask the front desk what’s on.
            </EmptyState>
          )}
          <p className="sf-meta">Times in {zone}</p>
        </section>
      </section>

      <section className="sf-section" aria-labelledby="home-week">
        <SectionHead id="home-week" title="This week" href="/schedule?view=week" linkLabel="Week view" />
        <div className="sf-week">
          {week.map((day, index) => (
            <article key={day.key} className="sf-week-day" data-today={index === 0 || undefined} aria-label={day.full}>
              <Link href={`/schedule?date=${day.key}`}>
                <strong>{index === 0 ? "Today" : day.label}</strong>
                <span>{day.short}</span>
              </Link>
              {day.sessions.slice(0, 4).map((session) => (
                <Link key={session.id} href={bookingReturnPath(session.id)} className="sf-week-item">
                  <time dateTime={session.startsAt}>{formatOccurrenceTime(session.startsAt, zone)}</time>
                  <strong>{session.name || session.classType?.name || "Class"}</strong>
                </Link>
              ))}
              {day.sessions.length > 4 ? <p className="sf-week-more">{day.sessions.length - 4} more</p> : null}
              {!day.sessions.length ? <p className="sf-week-empty">No sessions</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="sf-section" aria-labelledby="home-classes">
        <SectionHead id="home-classes" title="Classes" href="/classes" linkLabel="All classes" />
        {formats.length ? (
          <div className="sf-scroller">
            {formats.slice(0, 6).map((format) => {
              const description = documentText(format.description);
              const level = difficultyLabel(format.difficulty);
              return (
                <article key={format.id} className="sf-class-card">
                  <ArrowUpRight className="sf-arrow-mark" aria-hidden="true" />
                  <h3><Link href={`/classes/${format.id}`}>{format.name}</Link></h3>
                  <div className="sf-list-plain">
                    {level ? <span className="sf-tag">{level}</span> : null}
                    <span className="sf-tag">{format.duration} min</span>
                  </div>
                  {description ? <p>{description}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No classes published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />
        )}
      </section>

      <section className="sf-section" aria-labelledby="home-plans">
        <SectionHead id="home-plans" title="Memberships" href="/memberships" linkLabel="Compare plans" />
        {tiers.length ? (
          <div className="sf-plans" data-count={tiers.length >= 3 ? "3" : undefined}>
            {tiers.slice(0, 3).map((tier) => (
              <article key={tier.id} className="sf-plan">
                <div className="sf-plan-head">
                  <h3>{tier.name}</h3>
                  {tier.accessHours ? <p className="sf-meta">Access: {tier.accessHours}</p> : null}
                </div>
                <p className="sf-price"><strong>{formatMajorUnits(tier.monthlyPrice, currency)}</strong><span>/ month</span></p>
                <dl className="sf-facts" data-plain>
                  <div><dt>Classes</dt><dd>{creditLabel(tier.classCreditsPerMonth)}</dd></div>
                  <div><dt>Freeze</dt><dd>{tier.freezeAllowed ? "Included" : "Not included"}</dd></div>
                </dl>
                <Link href={joinPath(tier.id)} className="sf-btn" data-variant="accent" data-block>Choose {tier.name}</Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No plans published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />
        )}
      </section>

      {coaches.length > 0 ? (
        <section className="sf-section" aria-labelledby="home-coaches">
          <SectionHead id="home-coaches" title="Coaches" href="/instructors" linkLabel="All coaches" />
          <div className="sf-grid" data-cols="coaches">
            {coaches.slice(0, 4).map((coach) => (
              <article key={coach.id} className="sf-coach">
                <div className="sf-coach-photo">
                  {coach.photo ? <Image src={coach.photo} alt={coach.user.name} width={600} height={750} sizes="(max-width: 899px) 50vw, 25vw" unoptimized /> : <span className="sf-monogram" aria-hidden="true">{initials(coach.user.name)}</span>}
                </div>
                <div className="sf-stack" data-gap="sm">
                  <h3><Link href={`/instructors/${coach.id}`}>{coach.user.name}</Link></h3>
                  {coach.specialties?.length ? <p>{coach.specialties.join(", ")}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sf-section" aria-labelledby="home-visit">
        <SectionHead id="home-visit" title="Visit" href="/facilities" linkLabel="Facilities" />
        <div className="sf-split">
          <div className="sf-stack">
            {config?.address ? <p className="sf-h2">{config.address}</p> : <p className="sf-text-2">Address not published</p>}
            <div className="sf-actions">
              {config?.address ? (
                <a className="sf-btn" data-variant="secondary" href={mapLink(config.address)} target="_blank" rel="noreferrer">
                  Directions<ArrowUpRight aria-hidden="true" />
                </a>
              ) : null}
              {config?.phone ? <a className="sf-btn" data-variant="secondary" href={`tel:${config.phone.replace(/[^\d+]/g, "")}`}>{config.phone}</a> : null}
              <Link className="sf-btn" data-variant="secondary" href="/contact">Contact</Link>
            </div>
          </div>
          <div className="sf-panel">
            <div className="sf-row" data-between>
              <h3 className="sf-h3">Hours</h3>
              <span className="sf-meta">{zone}</span>
            </div>
            {hours.length ? <HoursList hours={hours} timeZone={zone} /> : <p className="sf-text-2">Not published</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
