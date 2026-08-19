import type { CSSProperties } from "react";
import Nav from "@/features/storefront/modules/layout/templates/nav";
import Footer from "@/features/storefront/modules/layout/templates/footer";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

interface MainLayoutProps {
  children: React.ReactNode;
  user?: any;
}

export async function MainLayout({ children, user }: MainLayoutProps) {
  const config = await getStorefrontConfig();

  if (!config) {
    return (
      <div className="sf-root flex min-h-screen items-center justify-center bg-[var(--sf-paper)] px-6 text-[var(--sf-ink)]">
        <main className="max-w-lg border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-8 sm:p-10">
          <p className="sf-eyebrow">Storefront unavailable</p>
          <h1 className="sf-display mt-4 text-4xl">This gym has not published its storefront.</h1>
          <p className="mt-5 text-sm leading-7 text-[var(--sf-ink-muted)]">
            An operator must complete Gym Settings before public identity, navigation, plans, or booking links are shown.
          </p>
        </main>
      </div>
    );
  }

  const themeStyle = {
    "--sf-accent": `hsl(${config.brandHue} 58% 40%)`,
    "--sf-accent-deep": `hsl(${config.brandHue} 62% 29%)`,
    "--sf-focus": `hsl(${config.brandHue} 58% 34%)`,
  } as CSSProperties;

  return (
    <div
      className="sf-root flex min-h-screen flex-col bg-[var(--sf-paper)] text-[var(--sf-ink)] selection:bg-[var(--sf-accent)] selection:text-[var(--sf-accent-on)]"
      style={themeStyle}
    >
      <Nav user={user} config={config} />
      <main className="flex-1">{children}</main>
      <Footer config={config} />
    </div>
  );
}
