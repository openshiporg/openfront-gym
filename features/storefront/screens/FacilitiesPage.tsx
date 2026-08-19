import { Metadata } from "next";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Explore the facility, studios, and amenities.",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Facility — ${getStorefrontBrandName(config)}`,
    description: config?.facilityDescription || metadata.description,
  };
}

export async function FacilitiesPage() {
  const config = await getStorefrontConfig();
  const facilities = config?.facilityHighlights?.length ? config.facilityHighlights : [];

  return (
    <div className="sf-page px-5 pb-24 pt-12 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="sf-page-header border-b border-[var(--color-rule)] pb-12">
          <div>
            <p className="sf-eyebrow">Facility</p>
            <h1 className="sf-display mt-4 text-[var(--text-display-s)]">
              {config?.facilityHeadline || config?.name || "Facility"}
            </h1>
          </div>
          {config?.facilityDescription ? (
            <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)]">
              {config.facilityDescription}
            </p>
          ) : null}
        </header>

        {facilities.length ? (
          <div className="mt-14 divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
            {facilities.map((facility: { title: string; description: string; features?: string[] }) => (
              <article key={facility.title} className="grid gap-6 py-10 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)]">
                <h2 className="text-2xl font-semibold text-[var(--color-ink)]">{facility.title}</h2>
                <div>
                  <p className="text-base leading-relaxed text-[var(--color-ink-muted)]">{facility.description}</p>
                  {(facility.features || []).length > 0 ? (
                    <ul className="mt-6 flex flex-wrap gap-2">
                      {(facility.features || []).map((feature: string) => (
                        <li key={feature} className="gym-tag">
                          {feature}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-14 border-y border-[var(--color-rule)] py-10 text-sm text-[var(--color-ink-muted)]">
            Facility details have not been published.
          </p>
        )}

        {config?.address || config?.phone ? (
          <section className="mt-16 grid gap-8 border border-[var(--color-rule)] bg-[var(--color-surface)] p-8 md:grid-cols-2">
            {config?.address ? (
              <div>
                <p className="sf-label">Address</p>
                <p className="mt-2 text-base">{config.address}</p>
              </div>
            ) : null}
            {config?.phone ? (
              <div>
                <p className="sf-label">Phone</p>
                <p className="mt-2 text-base">{config.phone}</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
