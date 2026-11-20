import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { UNCONFIGURED_STOREFRONT, getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getClassTypes, getUpcomingClassOccurrences } from "@/features/storefront/lib/data/classes";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { getMembershipTiers, type MembershipTierData } from "@/features/storefront/lib/data/memberships";
import { formatMajorUnits } from "@/features/platform/lib/currency";
import { formatOccurrenceTime } from "@/features/storefront/lib/class-occurrence";
import { bookingReturnPath, joinPath } from "@/features/storefront/lib/return-path";
import { calendarDays, creditLabel, localDateKey } from "@/features/storefront/lib/discovery";
import { mapLink, publishedHours } from "@/features/storefront/lib/contact-config";
import { difficultyLabel, documentText } from "@/features/storefront/lib/presentation";
import { classTypePhoto } from "@/features/storefront/lib/media";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";
import { HoursList } from "@/features/storefront/modules/layout/templates/footer";
import HomeDaySchedule, { type HomeSession } from "@/features/storefront/modules/classes/components/home-day-schedule";
import { timeZoneLabel } from "@/lib/time-zone-label";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: { absolute: getStorefrontBrandName(config) },
    description: config?.heroSubheadline || config?.description || UNCONFIGURED_STOREFRONT.description,
  };
}

/** What a plan includes, built only from its published fields. */
function planIncludes(tier: MembershipTierData) {
  return [
    creditLabel(tier.classCreditsPerMonth),
    tier.accessHours ? `Access: ${tier.accessHours}` : null,
    tier.freezeAllowed ? "Membership freeze included" : null,
    tier.guestPasses > 0 ? `${tier.guestPasses} guest ${tier.guestPasses === 1 ? "pass" : "passes"} per month` : null,
    tier.personalTrainingSessions > 0 ? `${tier.personalTrainingSessions} personal training ${tier.personalTrainingSessions === 1 ? "session" : "sessions"}` : null,
    ...(tier.features ?? []),
  ].filter((line): line is string => Boolean(line));
}

function termLine(tier: MembershipTierData) {
  return tier.contractLength > 0 ? `${tier.contractLength}-month minimum term` : "No minimum term";
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
  const headline = (config?.heroHeadline?.replace(/\\n/g, "\n") || config?.tagline || brand).replace(/\s+/g, " ").trim();
  const subline = config?.heroSubheadline || config?.description || null;
  const primaryCta = config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref
    ? { label: config.heroPrimaryCtaLabel, href: config.heroPrimaryCtaHref }
    : { label: "Book a class", href: "/schedule" };
  const secondaryCta = config?.heroSecondaryCtaLabel && config?.heroSecondaryCtaHref
    ? { label: config.heroSecondaryCtaLabel, href: config.heroSecondaryCtaHref }
    : { label: "Memberships", href: "/memberships" };
  const days = calendarDays(new Date(), zone, 7);
  const sessionName = (session: (typeof sessions)[number]) => session.name || session.classType?.name || "Class";

  const byDay: Record<string, HomeSession[]> = {};
  for (const day of days) byDay[day.key] = [];
  for (const session of sessions) {
    const key = localDateKey(session.startsAt, zone);
    byDay[key]?.push({
      id: session.id,
      time: formatOccurrenceTime(session.startsAt, zone),
      startsAt: session.startsAt,
      name: sessionName(session),
      coach: session.instructor?.name ?? null,
      classHref: session.classType ? `/classes/${session.classType.id}` : null,
      bookHref: bookingReturnPath(session.id),
      spots: session.availability.spotsRemaining,
    });
  }
  const firstOpenDay = days.find((day) => byDay[day.key].length)?.key ?? days[0].key;
  const pickerDays = days.map((day, index) => ({ key: day.key, label: day.label, day: day.key.slice(8).replace(/^0/, ""), full: day.full, today: index === 0 }));
  const hours = publishedHours(config?.hours);
  const sites = config?.clubPhotos ?? [];

  return (
    <div className="sf-home">
      <section className="sf-wrap sf-home-hero" aria-labelledby="home-title">
        <div className="sf-home-hero-copy">
          <h1 id="home-title">{headline}</h1>
          {subline ? <p>{subline}</p> : null}
          <div className="sf-actions">
            <Link href={primaryCta.href} className="sf-btn" data-variant="accent">{primaryCta.label}</Link>
            <Link href={secondaryCta.href} className="sf-btn" data-variant="secondary">{secondaryCta.label}</Link>
          </div>
        </div>
        {config?.heroImageUrl ? (
          <figure className="sf-home-hero-photo">
            <Image src={config.heroImageUrl} alt={sites[0] ? `${sites[0].name}` : ""} fill priority sizes="(max-width: 899px) 100vw, 560px" unoptimized />
          </figure>
        ) : null}
      </section>

      <section className="sf-wrap sf-home-section" aria-labelledby="home-week">
        <div className="sf-home-head">
          <h2 id="home-week">This week</h2>
          <Link href="/schedule?view=week" className="sf-link">Full schedule</Link>
        </div>
        {sessions.length ? (
          <HomeDaySchedule days={pickerDays} sessions={byDay} initialKey={firstOpenDay} />
        ) : (
          <p className="sf-text-2">This week’s timetable isn’t published yet. <Link className="sf-link" href="/classes">See the classes</Link>.</p>
        )}
      </section>

      {formats.length ? (
        <section className="sf-wrap sf-home-section" aria-labelledby="home-classes">
          <div className="sf-home-head">
            <h2 id="home-classes">Classes</h2>
            <Link href="/classes" className="sf-link">All classes</Link>
          </div>
          <ul className="sf-home-classes">
            {formats.slice(0, 6).map((format) => {
              const description = documentText(format.description);
              const level = difficultyLabel(format.difficulty);
              const photo = classTypePhoto(format);
              return (
                <li key={format.id}>
                  {photo ? <span className="sf-home-photo"><Image src={photo} alt="" fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px" unoptimized /></span> : null}
                  <h3><Link href={`/classes/${format.id}`}>{format.name}</Link></h3>
                  <p className="sf-meta">{[level, `${format.duration} min`].filter(Boolean).join(" · ")}</p>
                  {description ? <p className="sf-text-2">{description}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="sf-wrap sf-home-section" aria-labelledby="home-plans">
        <div className="sf-home-head">
          <h2 id="home-plans">Memberships</h2>
          <Link href="/memberships" className="sf-link">Compare plans</Link>
        </div>
        {tiers.length ? (
          <ul className="sf-home-plans">
            {tiers.slice(0, 3).map((tier) => {
              const description = documentText(tier.description);
              return (
                <li key={tier.id}>
                  <h3>{tier.name}</h3>
                  <p className="sf-home-price"><strong>{formatMajorUnits(tier.monthlyPrice, currency)}</strong> a month</p>
                  <p className="sf-meta">{termLine(tier)}</p>
                  {description ? <p className="sf-text-2">{description}</p> : null}
                  <ul className="sf-home-includes">
                    {planIncludes(tier).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  <Link href={joinPath(tier.id)} className="sf-btn" data-variant="accent" aria-label={`Join with ${tier.name}`}>Join</Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No plans published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />
        )}
        {tiers.length > 3 ? <p><Link href="/memberships" className="sf-link">All {tiers.length} plans</Link></p> : null}
      </section>

      {coaches.length ? (
        <section className="sf-wrap sf-home-section" aria-labelledby="home-coaches">
          <div className="sf-home-head">
            <h2 id="home-coaches">Coaches</h2>
            <Link href="/instructors" className="sf-link">All coaches</Link>
          </div>
          <ul className="sf-home-coaches">
            {coaches.slice(0, 4).map((coach) => (
              <li key={coach.id}>
                {coach.photo ? <span className="sf-home-portrait"><Image src={coach.photo} alt="" fill sizes="(max-width: 639px) 50vw, 300px" unoptimized /></span> : null}
                <h3><Link href={`/instructors/${coach.id}`}>{coach.user.name}</Link></h3>
                {coach.specialties?.length ? <p className="sf-meta">{coach.specialties.join(", ")}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sf-wrap sf-home-section sf-home-visit" aria-labelledby="home-visit">
        <div className="sf-stack">
          <h2 id="home-visit">Visit</h2>
          {config?.address ? <p className="sf-home-address">{config.address}</p> : <p className="sf-text-2">Address not published</p>}
          <p className="sf-home-links">
            {config?.address ? <a className="sf-link" href={mapLink(config.address)} target="_blank" rel="noreferrer">Directions<ArrowUpRight aria-hidden="true" /></a> : null}
            {config?.phone ? <a className="sf-link" href={`tel:${config.phone.replace(/[^\d+]/g, "")}`}>{config.phone}</a> : null}
            <Link className="sf-link" href="/facilities">Facilities<ArrowRight aria-hidden="true" /></Link>
          </p>
          {sites.length > 1 ? (
            <ul className="sf-home-sites">
              {sites.slice(1, 3).map((site) => (
                <li key={site.id}>
                  <span className="sf-home-photo"><Image src={site.url} alt="" fill sizes="(max-width: 899px) 50vw, 280px" unoptimized /></span>
                  <strong>{site.name}</strong>
                  {site.address ? <span className="sf-meta">{site.address}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="sf-stack" data-gap="sm">
          <div className="sf-row" data-between>
            <h3 className="sf-h3">Hours</h3>
            <span className="sf-meta">{timeZoneLabel(zone)}</span>
          </div>
          {hours.length ? <HoursList hours={hours} timeZone={zone} /> : <p className="sf-text-2">Not published</p>}
        </div>
      </section>
    </div>
  );
}

