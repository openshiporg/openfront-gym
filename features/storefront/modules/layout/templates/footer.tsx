import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";

const links = [
  { label: "Classes", href: "/classes" },
  { label: "Schedule", href: "/schedule" },
  { label: "Membership", href: "/memberships" },
  { label: "Coaches", href: "/instructors" },
  { label: "Facility", href: "/facilities" },
  { label: "Contact", href: "/contact" },
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
  } | null;
}) {
  const brandName = getStorefrontBrandName(config);
  const footerTagline = config?.footerTagline?.trim() || null;
  const copyrightName = config?.copyrightName?.trim() || brandName;

  return (
    <footer className="border-t border-[var(--sf-rule)] bg-[var(--sf-ink)] text-[oklch(94%_0.01_85)]">
      <div className="sf-container py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
          <div>
            <div className="flex items-center gap-4">
              {config?.logoIcon ? (
                <span
                  className="h-11 w-11 shrink-0 [&>svg]:h-full [&>svg]:w-full"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: config.logoIcon }}
                />
              ) : null}
              <p className="sf-eyebrow text-[oklch(72%_0.08_55)]">{brandName}</p>
            </div>
            <p className="sf-display mt-6 text-4xl italic sm:text-5xl lg:text-6xl">
              {footerTagline || config?.tagline || brandName}
            </p>
            {config?.description ? (
              <p className="mt-8 max-w-lg text-sm leading-7 text-[oklch(78%_0.01_85)]">
                {config.description}
              </p>
            ) : null}
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="sf-eyebrow text-[oklch(72%_0.08_55)]">Visit</p>
              <div className="mt-4 space-y-2 text-sm leading-6 text-[oklch(82%_0.01_85)]">
                {config?.address ? <p>{config.address}</p> : null}
                {config?.phone ? <p>{config.phone}</p> : null}
                {config?.email ? <p>{config.email}</p> : null}
              </div>
            </div>
            <div>
              <p className="sf-eyebrow text-[oklch(72%_0.08_55)]">Explore</p>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[oklch(82%_0.01_85)] transition hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-[oklch(35%_0.02_55)] pt-6 text-xs text-[oklch(62%_0.01_85)] sm:flex-row">
          <p>
            © {new Date().getFullYear()} {copyrightName}
          </p>
          <Link href="/account" className="transition hover:text-white">
            Member sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
