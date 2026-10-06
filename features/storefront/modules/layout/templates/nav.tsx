import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import AuthNav from "../components/auth-nav";
import KineticMark from "../components/kinetic-mark";
import NavClient from "../components/NavClient";

export default function Nav({
  user,
  config,
}: {
  user?: any;
  config?: {
    name?: string | null;
    tagline?: string | null;
    logoIcon?: string | null;
    brandHue?: number | null;
    heroPrimaryCtaLabel?: string | null;
    heroPrimaryCtaHref?: string | null;
    heroSecondaryCtaLabel?: string | null;
    heroSecondaryCtaHref?: string | null;
  } | null;
}) {
  const brandName = getStorefrontBrandName(config);
  const usesKineticLockup = brandName.trim().toLowerCase() === "kinetic performance club";
  return (
    <header className="sf-site-header">
      <div className="sf-container sf-site-header-inner">
        <Link
          href="/"
          className="sf-wordmark"
          data-kinetic-lockup={usesKineticLockup || undefined}
          aria-label={`${brandName} home`}
        >
          {config?.logoIcon ? (
            <span
              className="sf-wordmark-logo [&>svg]:h-full [&>svg]:w-full"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: config.logoIcon }}
            />
          ) : (
            <span className="sf-wordmark-mark" aria-hidden="true"><KineticMark /></span>
          )}
          <span className="sf-wordmark-copy">
            <strong>{usesKineticLockup ? "Kinetic" : brandName}</strong>
            {usesKineticLockup ? <span>Performance Club</span> : config?.tagline ? <span>{config.tagline}</span> : null}
          </span>
        </Link>

        <div className="sf-site-navigation">
          <NavClient
            user={user}
            primaryCta={config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref ? {
              label: config.heroPrimaryCtaLabel,
              href: config.heroPrimaryCtaHref,
            } : null}
            secondaryCta={config?.heroSecondaryCtaLabel && config?.heroSecondaryCtaHref ? {
              label: config.heroSecondaryCtaLabel,
              href: config.heroSecondaryCtaHref,
            } : null}
          />
          <AuthNav
            user={user}
            joinCta={config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref ? {
              label: config.heroPrimaryCtaLabel,
              href: config.heroPrimaryCtaHref,
            } : null}
          />
        </div>
      </div>
    </header>
  );
}
