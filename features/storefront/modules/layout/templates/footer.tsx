import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { publicSupportEmail, publishedHours } from "@/features/storefront/lib/contact-config";

const links = [
  { label: "Classes", href: "/classes" },
  { label: "Schedule", href: "/schedule" },
  { label: "Memberships", href: "/memberships" },
  { label: "Coaches", href: "/instructors" },
  { label: "Facility", href: "/facilities" },
  { label: "Contact", href: "/contact" },
  { label: "Policies", href: "/policies" },
];

export default function Footer({
  config,
}: {
  config?: {
    name?: string | null;
    tagline?: string | null;
    logoIcon?: string | null;
    description?: string | null;
    footerTagline?: string | null;
    copyrightName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    hours?: Record<string, string> | null;
  } | null;
}) {
  const brandName = getStorefrontBrandName(config);
  const footerTagline = config?.footerTagline?.trim() || config?.tagline?.trim() || null;
  const copyrightName = config?.copyrightName?.trim() || brandName;
  const supportEmail = publicSupportEmail(config?.email);
  const hours = publishedHours(config?.hours);

  return (
    <footer className="border-t border-[var(--sf-border)] bg-[var(--sf-surface)]">
      <div className="sf-container grid gap-12 py-14 md:grid-cols-2 lg:grid-cols-[1.25fr_0.8fr_0.9fr] lg:py-18">
        <div>
          <Link href="/" className="text-xl font-bold tracking-[-0.04em]">{brandName}</Link>
          {footerTagline ? (
            <p className="mt-4 max-w-md text-sm leading-6 text-[var(--sf-muted)]">{footerTagline}</p>
          ) : null}
          <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm" aria-label="Footer navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="underline decoration-[var(--sf-border-strong)] underline-offset-4 hover:decoration-[var(--sf-foreground)]">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Visit</h2>
          <div className="mt-4 space-y-3 text-sm leading-6">
            {config?.address ? <p>{config.address}</p> : <p className="text-[var(--sf-muted)]">Address not published</p>}
            {config?.phone ? <a href={`tel:${config.phone}`} className="block hover:underline">{config.phone}</a> : null}
            {supportEmail ? <a href={`mailto:${supportEmail}`} className="block break-all hover:underline">{supportEmail}</a> : null}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Hours</h2>
          {hours.length ? (
            <dl className="mt-4 grid gap-2 text-sm">
              {hours.map(([day, value]) => (
                <div key={day} className="grid grid-cols-[5.25rem_1fr] gap-3">
                  <dt className="capitalize text-[var(--sf-muted)]">{day.slice(0, 3)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-[var(--sf-muted)]">Hours not published</p>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--sf-border)]">
        <div className="sf-container flex flex-col gap-2 py-5 text-xs text-[var(--sf-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {copyrightName}</p>
          <Link href="/account" className="hover:text-[var(--sf-foreground)]">Member account</Link>
        </div>
      </div>
    </footer>
  );
}
