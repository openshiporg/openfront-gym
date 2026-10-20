import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { mapLink, publicSupportEmail, publishedHours } from "@/features/storefront/lib/contact-config";
import { isClubToday, orderedHours } from "@/features/storefront/lib/presentation";
import Wordmark, { wordmarkBrand } from "../components/wordmark";
import ThemeSwitch from "../components/theme-switch";

const trainLinks = [
  { label: "Schedule", href: "/schedule" },
  { label: "Classes", href: "/classes" },
  { label: "Coaches", href: "/instructors" },
  { label: "Memberships", href: "/memberships" },
];

const clubLinks = [
  { label: "Facilities", href: "/facilities" },
  { label: "Contact", href: "/contact" },
  { label: "Policies", href: "/policies" },
  { label: "Account", href: "/account" },
];

const DAY_LABEL: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function dayLabel(day: string) {
  return DAY_LABEL[day.trim().toLowerCase().slice(0, 3)] ?? day;
}

/** Published opening hours in calendar order; today's row carries the status dot on its line. */
export function HoursList({ hours, timeZone, short = false }: { hours: Array<[string, string]>; timeZone: string; short?: boolean }) {
  return (
    <dl className="sf-hours">
      {orderedHours(hours).map(([day, value]) => {
        const today = isClubToday(day, timeZone);
        return (
          <div key={day} data-today={today || undefined}>
            <dt>{short ? dayLabel(day).slice(0, 3) : dayLabel(day)}{today ? <span className="sr-only"> (today)</span> : null}</dt>
            <dd>{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function Footer({
  config,
}: {
  config?: {
    name?: string | null;
    tagline?: string | null;
    logoIcon?: string | null;
    logoColor?: string | null;
    description?: string | null;
    footerTagline?: string | null;
    copyrightName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    timezone?: string | null;
    hours?: Record<string, unknown> | null;
  } | null;
}) {
  const brandName = getStorefrontBrandName(config);
  const footerTagline = config?.footerTagline?.trim() || null;
  const copyrightName = config?.copyrightName?.trim() || brandName;
  const supportEmail = publicSupportEmail(config?.email);
  const hours = publishedHours(config?.hours);
  const timeZone = config?.timezone || "UTC";

  return (
    <footer className="sf-footer sf-on-night">
      <div className="sf-wrap">
        <div className="sf-footer-grid">
          <div className="sf-footer-brand">
            <div><Wordmark brand={wordmarkBrand(config)} /></div>
            {footerTagline ? <p>{footerTagline}</p> : null}
          </div>

          <div className="sf-footer-cols">
            <nav className="sf-footer-col" aria-labelledby="footer-train">
              <h2 id="footer-train">Train</h2>
              {trainLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
            </nav>
            <nav className="sf-footer-col" aria-labelledby="footer-club">
              <h2 id="footer-club">Club</h2>
              {clubLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
            </nav>
            <div className="sf-footer-col">
              <h2>Visit</h2>
              {config?.address ? <p>{config.address}</p> : null}
              {config?.address ? <a href={mapLink(config.address)} target="_blank" rel="noreferrer">Directions<span className="sr-only"> (opens Google Maps)</span></a> : null}
              {config?.phone ? <a href={`tel:${config.phone.replace(/[^\d+]/g, "")}`}>{config.phone}</a> : null}
              {supportEmail ? <a href={`mailto:${supportEmail}`} className="sf-break">{supportEmail}</a> : null}
              <Link href="/contact">Send a message</Link>
            </div>
            <div className="sf-footer-col">
              <h2>Hours</h2>
              {hours.length ? <HoursList hours={hours} timeZone={timeZone} short /> : <p>Not published</p>}
            </div>
          </div>
        </div>

        <div className="sf-footer-bottom">
          <p>© {new Date().getFullYear()} {copyrightName}</p>
          <ThemeSwitch night />
        </div>
      </div>
    </footer>
  );
}
