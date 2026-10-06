import Link from "next/link";
import { Metadata } from "next";
import Image from "next/image";
import { Building2 } from "lucide-react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Explore the facility, studios, and amenities.",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return { title: `Facility — ${getStorefrontBrandName(config)}`, description: config?.facilityDescription || metadata.description };
}

export async function FacilitiesPage() {
  const config = await getStorefrontConfig();
  const facilities = config?.facilityHighlights?.length ? config.facilityHighlights : [];

  return (
    <div className="sf-page">
      <div className="sf-container">
        <header className="sf-page-header">
          <div><p className="sf-eyebrow">Facility</p><h1 className="sf-display mt-4 text-[var(--text-display-s)]">{config?.facilityHeadline || config?.name || "Facility"}</h1></div>
          {config?.facilityDescription ? <p className="max-w-md text-base leading-7 text-[var(--sf-muted)]">{config.facilityDescription}</p> : null}
        </header>

        <section className="sf-quick-grid mb-8" aria-label="Plan your visit"><div className="sf-quick-card"><h2>Find the club</h2><p>{config?.address || "Ask the club for arrival directions."}</p></div><div className="sf-quick-card"><h2>Choose your session</h2><p>Browse the timetable for dates, coaches and available spaces.</p><Link href="/schedule" className="sf-link mt-3 inline-flex">See the timetable →</Link></div><div className="sf-quick-card"><h2>Visiting for the first time?</h2><p>Ask about accessibility, facilities and what to bring before you arrive.</p><Link href="/contact" className="sf-link mt-3 inline-flex">Arrange your visit →</Link></div></section>
        {config?.heroImageUrl ? (
          <div className="relative overflow-hidden border border-[var(--sf-border)]">
            <Image src={config.heroImageUrl} alt={`${getStorefrontBrandName(config)} training facility`} width={1600} height={1000} priority sizes="100vw" className="max-h-[32rem] w-full object-cover" unoptimized />
          </div>
        ) : null}

        {facilities.length ? (
          <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-12 ${config?.heroImageUrl ? "mt-4" : ""}`}>
            {facilities.map((facility: { title: string; description: string; features?: string[] }, index: number) => (
              <article key={facility.title} className={`border border-[var(--sf-border)] bg-[var(--sf-surface)] p-7 sm:p-8 ${index % 5 === 0 ? "lg:col-span-7" : "lg:col-span-5"} ${index % 3 === 1 ? "sf-diagonal-field bg-[var(--sf-secondary)]" : ""}`}>
                <h2 className="text-xl font-bold tracking-[-0.035em]">{facility.title}</h2>
                <p className="mt-4 text-sm leading-6 text-[var(--sf-muted)]">{facility.description}</p>
                {facility.features?.length ? <p className="mt-6 text-xs leading-5 text-[var(--sf-muted)]">{facility.features.join(" / ")}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={`border border-[var(--sf-border)] bg-[var(--sf-surface)] p-8 sm:p-10 ${config?.heroImageUrl ? "mt-4" : ""}`}>
            <Building2 className="h-8 w-8 text-[var(--sf-primary)]" aria-hidden="true" />
            <h2 className="mt-7 text-2xl font-bold">No facility highlights are published.</h2>
          </div>
        )}

        {config?.hours && Object.keys(config.hours).length > 0 && <section className="sf-panel mt-6"><h2 className="text-2xl font-semibold">Opening hours</h2><p className="sf-muted mt-2">Facility opening hours. Membership access can depend on your plan.</p><dl className="sf-facts">{Object.entries(config.hours).map(([day, hours]) => <div key={day}><dt>{day}</dt><dd>{hours}</dd></div>)}</dl></section>}
        {config?.address || config?.phone ? (
          <section className="mt-4 grid gap-8 border border-[var(--sf-border)] bg-[var(--sf-surface-strong)] p-8 md:grid-cols-2">
            {config.address ? <div><p className="sf-label">Address</p><p className="mt-2 text-base">{config.address}</p></div> : null}
            {config.phone ? <div><p className="sf-label">Phone</p><a href={`tel:${config.phone}`} className="mt-2 block text-base underline decoration-[var(--sf-border-strong)] underline-offset-4">{config.phone}</a></div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
