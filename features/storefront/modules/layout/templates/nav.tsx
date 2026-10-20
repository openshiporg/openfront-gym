import AuthNav from "../components/auth-nav";
import NavClient, { PrimaryNav } from "../components/NavClient";
import Wordmark, { wordmarkBrand } from "../components/wordmark";

export default function Nav({
  user,
  config,
}: {
  user?: any;
  config?: {
    name?: string | null;
    tagline?: string | null;
    logoIcon?: string | null;
    logoColor?: string | null;
    brandHue?: number | null;
    heroPrimaryCtaLabel?: string | null;
    heroPrimaryCtaHref?: string | null;
    heroSecondaryCtaLabel?: string | null;
    heroSecondaryCtaHref?: string | null;
  } | null;
}) {
  const brand = wordmarkBrand(config);
  const primaryCta = config?.heroPrimaryCtaLabel && config?.heroPrimaryCtaHref ? { label: config.heroPrimaryCtaLabel, href: config.heroPrimaryCtaHref } : null;
  const secondaryCta = config?.heroSecondaryCtaLabel && config?.heroSecondaryCtaHref ? { label: config.heroSecondaryCtaLabel, href: config.heroSecondaryCtaHref } : null;
  return (
    <header className="sf-header">
      <div className="sf-wrap sf-header-bar">
        <Wordmark brand={brand} />
        <PrimaryNav />
        <div className="sf-header-end">
          <AuthNav user={user} joinCta={primaryCta} />
          <NavClient user={user} brand={brand} primaryCta={primaryCta} secondaryCta={secondaryCta} />
        </div>
      </div>
    </header>
  );
}
