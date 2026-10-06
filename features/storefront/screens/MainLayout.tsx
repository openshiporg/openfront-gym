import type { CSSProperties } from "react";
import Nav from "@/features/storefront/modules/layout/templates/nav";
import Footer from "@/features/storefront/modules/layout/templates/footer";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

import ContextNav from "../modules/layout/components/context-nav";

interface MainLayoutProps {
  children: React.ReactNode;
  user?: any;
}

export async function MainLayout({ children, user }: MainLayoutProps) {
  const config = await getStorefrontConfig();

  if (!config) {
    return (
      <div className="sf-root flex min-h-[100dvh] items-center px-6">
        <main className="sf-container grid gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,0.55fr)] lg:items-center lg:gap-20">
          <div className="max-w-3xl">
            <p className="sf-eyebrow">Storefront unavailable</p>
            <h1 className="sf-display mt-5 text-5xl sm:text-6xl lg:text-7xl">The club’s website is not available yet.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[var(--sf-muted)] sm:text-lg">
              Please check back for classes, memberships and details about visiting the club.
            </p>
          </div>
          <aside className="sf-diagonal-field border border-[var(--sf-border)] bg-[var(--sf-surface)] p-7 lg:p-9">
            <h2 className="text-lg font-semibold">Planning a visit?</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--sf-muted)]">
              Contact the club directly for current opening hours and membership information.
            </p>
          </aside>
        </main>
      </div>
    );
  }

  const brandHue = Number.isFinite(config.brandHue)
    ? Math.min(359, Math.max(0, Math.round(Number(config.brandHue))))
    : 262;
  const themeStyle = {
    "--brand-hue": String(brandHue),
  } as CSSProperties;

  return (
    <div className="sf-root flex min-h-[100dvh] flex-col" style={themeStyle}>
      <a href="#main-content" className="sf-skip-link">Skip to content</a>
      <Nav user={user} config={config} />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1"><ContextNav />{children}</main>
      <Footer config={config} />
    </div>
  );
}
