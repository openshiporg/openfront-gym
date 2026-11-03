import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, ChartColumnIncreasing, Check, ChevronRight, Crown, Dumbbell, MapPin, Trophy, UsersRound } from "lucide-react";
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
import { difficultyLabel, documentText, initials } from "@/features/storefront/lib/presentation";
import { classTypePhoto, membershipPlanPhoto } from "@/features/storefront/lib/media";
import { SessionTime } from "@/features/storefront/modules/common/training";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";
import { HoursList } from "@/features/storefront/modules/layout/templates/footer";
import HomeDaySchedule, { type HomeSession } from "@/features/storefront/modules/classes/components/home-day-schedule";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: { absolute: getStorefrontBrandName(config) },
    description: config?.heroSubheadline || config?.description || UNCONFIGURED_STOREFRONT.description,
  };
}

const PLAN_ICONS = [Dumbbell, ChartColumnIncreasing, Crown];

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

/** The plan the design raises: the first unlimited plan, else the middle of three. */
function featuredIndex(tiers: MembershipTierData[]) {
  const unlimited = tiers.findIndex((tier) => tier.classCreditsPerMonth === -1);
  if (unlimited >= 0) return unlimited;
  return tiers.length >= 3 ? 1 : -1;
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
  // The published headline's last sentence takes the accent colour; a single sentence stays ink.
  const headline = (config?.heroHeadline?.replace(/\\n/g, "\n") || config?.tagline || brand).replace(/\s+/g, " ").trim();
  const sentences = headline.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [headline];
  const headlineLead = sentences.length > 1 ? sentences.slice(0, -1).join(" ") : headline;
  const headlineAccent = sentences.length > 1 ? sentences[sentences.length - 1] : null;
  const subline = config?.heroSubheadline || config?.description || null;
  const primaryCta = config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref
    ? { label: config.heroPrimaryCtaLabel, href: config.heroPrimaryCtaHref }
    : { label: "Book a class", href: "/schedule" };
  const secondaryCta = config?.heroSecondaryCtaLabel && config?.heroSecondaryCtaHref
    ? { label: config.heroSecondaryCtaLabel, href: config.heroSecondaryCtaHref }
    : { label: "Memberships", href: "/memberships" };
  const days = calendarDays(new Date(), zone, 7);
  const coachPhoto = new Map(coaches.map((coach) => [coach.id, coach.photo]));
  const sessionName = (session: (typeof sessions)[number]) => session.name || session.classType?.name || "Class";
  // Photos are mapped by class type (never random); a type without an asset keeps the dark card.
  const formatPhoto = new Map(formats.map((format) => [format.id, classTypePhoto(format.name)]));

  const byDay: Record<string, HomeSession[]> = {};
  for (const day of days) byDay[day.key] = [];
  for (const session of sessions) {
    const key = localDateKey(session.startsAt, zone);
    byDay[key]?.push({
      id: session.id,
      time: formatOccurrenceTime(session.startsAt, zone),
      startsAt: session.startsAt,
      name: sessionName(session),
      coach: session.instructor?.name?.split(/\s+/)[0] ?? null,
      classHref: session.classType ? `/classes/${session.classType.id}` : null,
      photo: (session.classType ? formatPhoto.get(session.classType.id) ?? classTypePhoto(session.classType.name) : null) ?? null,
      bookHref: bookingReturnPath(session.id),
      spots: session.availability.spotsRemaining,
    });
  }
  const firstOpenDay = days.find((day) => byDay[day.key].length)?.key ?? days[0].key;
  const phoneDays = days.map((day, index) => ({ key: day.key, label: day.label, day: day.key.slice(8).replace(/^0/, ""), full: day.full, today: index === 0 }));
  // Desktop strip: the first session of each day that has one, in day order.
  const strip = days.map((day, index) => {
    const first = sessions.find((session) => localDateKey(session.startsAt, zone) === day.key);
    return { day, index, first, count: byDay[day.key].length };
  }).filter((item) => item.first);

  const featured = featuredIndex(tiers);
  const stats = (config?.heroStats?.length ? config.heroStats.slice(0, 3).map((stat: any, index: number) => ({ value: stat.value, label: stat.label, caption: null as string | null, icon: [CalendarDays, Trophy, MapPin][index] }))
    : [
        { value: `${sessions.length}`, label: sessions.length === 1 ? "Session this week" : "Sessions this week", caption: "Coached and bookable online.", icon: CalendarDays },
        { value: `${formats.length}`, label: formats.length === 1 ? "Class type" : "Class types", caption: formats.slice(0, 3).map((format) => format.name).join(", ") || null, icon: Dumbbell },
        { value: `${coaches.length}`, label: coaches.length === 1 ? "Coach" : "Coaches", caption: coaches.length ? coaches.map((coach) => coach.user.name.split(/\s+/)[0]).join(", ") : null, icon: UsersRound },
      ]).filter((stat) => stat.value !== "0");
  const hours = publishedHours(config?.hours);

  return (
    <div className="sf-rg">
      <section className="sf-wrap sf-rg-hero" aria-labelledby="home-title">
        <div className="sf-rg-hero-copy">
          <h1 id="home-title" className="sf-rg-title">
            <span>{headlineLead}</span>
            {headlineAccent ? <> <em>{headlineAccent}</em></> : null}
          </h1>
          {subline ? <p className="sf-rg-sub">{subline}</p> : null}
          <div className="sf-rg-actions">
            <Link href={primaryCta.href} className="sf-btn" data-variant="accent">{primaryCta.label}</Link>
            <Link href={secondaryCta.href} className="sf-rg-textlink">{secondaryCta.label}<ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
        {config?.heroImageUrl ? (
          <div className="sf-rg-hero-media">
            <Image src={config.heroImageUrl} alt="" fill priority sizes="(max-width: 899px) 70vw, 460px" unoptimized />
          </div>
        ) : null}
      </section>

      {/* Desktop: the week as a strip of each day's first session. */}
      <section className="sf-wrap sf-rg-desk" aria-labelledby="home-week">
        <div className="sf-rg-week">
          <div className="sf-rg-head">
            <h2 id="home-week">Weekly Schedule</h2>
            <Link href="/schedule?view=week" className="sf-rg-more" data-tone="ink">View Full Schedule<ArrowRight aria-hidden="true" /></Link>
          </div>
          {sessions.length ? (
            <ol className="sf-rg-strip">
              {strip.map(({ day, index, first, count }) => {
                const photo = first?.instructor ? coachPhoto.get(first.instructor.id) : null;
                const coachName = first?.instructor?.name ?? null;
                return (
                  <li key={day.key} data-today={index === 0 || undefined}>
                    <Link href={`/schedule?date=${day.key}`} className="sf-rg-date" aria-label={`${day.full}, ${count} ${count === 1 ? "session" : "sessions"}`}>
                      <span>{index === 0 ? "Today" : day.label}</span>
                      <strong>{day.short}</strong>
                    </Link>
                    {first ? (
                      <div className="sf-rg-slot">
                        <span className="sf-rg-avatar" aria-hidden="true">
                          {photo ? <Image src={photo} alt="" width={96} height={96} unoptimized /> : initials(coachName)}
                        </span>
                        <div>
                          <SessionTime value={formatOccurrenceTime(first.startsAt, zone)} dateTime={first.startsAt} />
                          {coachName ? <span>{coachName.split(/\s+/)[0]}</span> : null}
                          {first.classType ? <Link href={`/classes/${first.classType.id}`}>{sessionName(first)}</Link> : <b>{sessionName(first)}</b>}
                        </div>
                        <Link href={bookingReturnPath(first.id)} className="sf-rg-pill">
                          {first.availability.spotsRemaining > 0 ? "Book" : "Waitlist"}<span className="sr-only"> {sessionName(first)}, {day.full}</span>
                        </Link>
                      </div>
                    ) : (
                      <p className="sf-rg-rest">No sessions</p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="sf-rg-rest">This week’s timetable isn’t published yet. <Link href="/classes">See the class formats</Link>.</p>
          )}
        </div>
      </section>

      {/* Phone: day picker and timeline. */}
      <div className="sf-wrap sf-rg-phone">
        <HomeDaySchedule days={phoneDays} sessions={byDay} initialKey={firstOpenDay} />
      </div>

      <section className="sf-wrap sf-rg-plans-section" aria-labelledby="home-plans">
        <div className="sf-rg-center">
          <h2 id="home-plans">Membership Plans</h2>
          <Link href="/memberships" className="sf-rg-more sf-rg-phone-inline">Compare plans<ChevronRight aria-hidden="true" /></Link>
          <p>{tiers.length ? `${tiers.length} ${tiers.length === 1 ? "plan" : "plans"}, billed in ${currency.toUpperCase()}.` : null} <Link href="/memberships">Compare every detail</Link></p>
        </div>
        {tiers.length ? (
          <div className="sf-rg-plans" data-count={Math.min(tiers.length, 3)}>
            {tiers.slice(0, 3).map((tier, index) => {
              const Icon = PLAN_ICONS[index % PLAN_ICONS.length];
              const description = documentText(tier.description);
              const includes = planIncludes(tier);
              const photo = membershipPlanPhoto(tier.name);
              return (
                <article key={tier.id} className="sf-rg-plan" data-featured={index === featured || undefined} data-photo={photo ? "" : undefined}>
                  {photo ? <Image className="sf-rg-plan-photo" src={photo} alt="" fill sizes="(max-width: 899px) 33vw, 360px" unoptimized /> : null}
                  {index === featured && tier.classCreditsPerMonth === -1 ? <span className="sf-rg-badge">Unlimited classes</span> : null}
                  <header>
                    <span className="sf-rg-plan-icon" aria-hidden="true"><Icon /></span>
                    <div>
                      <h3>{tier.name}</h3>
                      {description ? <p>{description}</p> : null}
                    </div>
                  </header>
                  <div className="sf-rg-price">
                    <p><strong>{formatMajorUnits(tier.monthlyPrice, currency)}</strong><span>/mo</span></p>
                    <small>{termLine(tier)}</small>
                  </div>
                  <ul>
                    {includes.map((line) => <li key={line}><Check aria-hidden="true" />{line}</li>)}
                  </ul>
                  <Link href={joinPath(tier.id)} className="sf-btn sf-rg-choose" data-variant="accent" data-block aria-label={`Choose ${tier.name}`}><span className="sf-rg-label-desk">Choose {tier.name}</span><span className="sf-rg-label-phone">Explore</span><ChevronRight aria-hidden="true" /></Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No plans published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />
        )}
        {tiers.length > 3 ? <p className="sf-rg-center"><Link href="/memberships" className="sf-rg-more">All {tiers.length} plans<ArrowRight aria-hidden="true" /></Link></p> : null}

        <Link href={primaryCta.href} className="sf-rg-join sf-rg-phone">
          <Trophy aria-hidden="true" />
          <span><strong>Not a member?</strong> {primaryCta.label}.</span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </section>

      {stats.length ? (
        <section className="sf-wrap" aria-label="At the club">
          <dl className="sf-rg-stats">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label}>
                  <dt><Icon aria-hidden="true" /><span><b>{stat.value}</b> {stat.label}</span></dt>
                  {stat.caption ? <dd>{stat.caption}</dd> : null}
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      {formats.length ? (
        <section className="sf-wrap sf-rg-section" aria-labelledby="home-classes">
          <div className="sf-rg-head">
            <h2 id="home-classes">Classes</h2>
            <Link href="/classes" className="sf-rg-more">All classes<ChevronRight aria-hidden="true" /></Link>
          </div>
          <div className="sf-scroller">
            {formats.slice(0, 6).map((format) => {
              const description = documentText(format.description);
              const level = difficultyLabel(format.difficulty);
              const photo = formatPhoto.get(format.id);
              return (
                <article key={format.id} className="sf-class-card" data-photo={photo ? "" : undefined}>
                  {photo ? <span className="sf-class-card-photo"><Image src={photo} alt="" fill sizes="(max-width: 899px) 80vw, 380px" unoptimized /></span> : null}
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
        </section>
      ) : null}

      {coaches.length ? (
        <section className="sf-wrap sf-rg-section" aria-labelledby="home-coaches">
          <div className="sf-rg-head">
            <h2 id="home-coaches">Coaches</h2>
            <Link href="/instructors" className="sf-rg-more">All coaches<ChevronRight aria-hidden="true" /></Link>
          </div>
          <ul className="sf-rg-coaches">
            {coaches.slice(0, 4).map((coach) => (
              <li key={coach.id}>
                <span className="sf-rg-avatar" data-size="lg" aria-hidden="true">
                  {coach.photo ? <Image src={coach.photo} alt="" width={128} height={128} unoptimized /> : initials(coach.user.name)}
                </span>
                <div>
                  <Link href={`/instructors/${coach.id}`}>{coach.user.name}</Link>
                  {coach.specialties?.length ? <span>{coach.specialties.join(", ")}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sf-wrap sf-rg-section" aria-labelledby="home-visit">
        <div className="sf-rg-visit">
          <div className="sf-stack">
            <h2 id="home-visit">Visit</h2>
            {config?.address ? <p className="sf-rg-address">{config.address}</p> : <p className="sf-text-2">Address not published</p>}
            <div className="sf-actions">
              {config?.address ? (
                <a className="sf-btn" data-variant="secondary" data-size="sm" href={mapLink(config.address)} target="_blank" rel="noreferrer">
                  Directions<ArrowUpRight aria-hidden="true" />
                </a>
              ) : null}
              {config?.phone ? <a className="sf-btn" data-variant="secondary" data-size="sm" href={`tel:${config.phone.replace(/[^\d+]/g, "")}`}>{config.phone}</a> : null}
              <Link className="sf-btn" data-variant="secondary" data-size="sm" href="/facilities">Facilities</Link>
            </div>
          </div>
          <div className="sf-stack" data-gap="sm">
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
