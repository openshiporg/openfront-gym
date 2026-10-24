import Nav from "@/features/storefront/modules/layout/templates/nav";
import Footer from "@/features/storefront/modules/layout/templates/footer";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { brandPaletteCss } from "@/features/storefront/lib/brand-palette";
import { UNCONFIGURED_STOREFRONT } from "@/features/storefront/lib/brand";
import { resolveStorefrontBrand } from "@/features/keystone/lib/storefront-branding";

interface MainLayoutProps {
  children: React.ReactNode;
  user?: any;
}

export async function MainLayout({ children, user }: MainLayoutProps) {
  const config = await getStorefrontConfig();

  if (!config) {
    return (
      <div className="sf-root">
        <main className="sf-wrap sf-closed">
          <span className="sf-wordmark-mark" style={{ width: 44, height: 44 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: resolveStorefrontBrand(null).svg }} />
          <h1 className="sf-h1">{UNCONFIGURED_STOREFRONT.name}</h1>
          <p className="sf-lead">{UNCONFIGURED_STOREFRONT.description}</p>
        </main>
      </div>
    );
  }

  const same = (a?: string | null, b?: string | null) => Boolean(a && b) && a!.replace(/\s+/g, " ").trim().toLowerCase() === b!.replace(/\s+/g, " ").trim().toLowerCase();
  // The tagline already sits under the logo, so a banner repeating it is left out.
  const promo = same(config.promoBanner, config.tagline) ? null : config.promoBanner?.trim();

  return (
    <div className="sf-root">
      {/* Tenant accent, derived from the saved logo colour, is shared with portalled dialogs via :root. */}
      <style>{brandPaletteCss(resolveStorefrontBrand(config).themeHue)}</style>
      <a href="#main-content" className="sf-skip">Skip to content</a>
      {!config.salesOpen ? (
        <div className="sf-promo" role="note"><div className="sf-wrap">The club isn’t taking new bookings or memberships right now. You can still sign in, see your account and history, manage your membership, and contact the club.</div></div>
      ) : promo ? <div className="sf-promo" role="note"><div className="sf-wrap">{promo}</div></div> : null}
      <Nav user={user} config={config} />
      <main id="main-content" tabIndex={-1} className="sf-main">{children}</main>
      <Footer config={config} />
    </div>
  );
}
