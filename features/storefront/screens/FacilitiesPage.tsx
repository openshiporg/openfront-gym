import Link from "next/link";
import { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, Building2 } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { publishedHours } from "@/features/storefront/lib/contact-config";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";
import { HoursList } from "@/features/storefront/modules/layout/templates/footer";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return { title: "Facilities", description: config?.facilityDescription || undefined };
}

type Highlight = { title: string; description?: string; features?: string[] };

export async function FacilitiesPage() {
  const config = await getStorefrontConfig();
  const facilities = (Array.isArray(config?.facilityHighlights) ? config.facilityHighlights : [])
    .filter((item): item is Highlight => typeof item?.title === "string" && item.title.trim() !== "");
  const hours = publishedHours(config?.hours);
  const timeZone = config?.timezone || "UTC";

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title={config?.facilityHeadline || "Facilities"} lead={config?.facilityDescription || undefined} />

        {config?.heroImageUrl ? (
          <figure className="sf-photo sf-rise-2">
            <Image src={config.heroImageUrl} alt="" fill priority sizes="(max-width: 1279px) 100vw, 1240px" unoptimized />
          </figure>
        ) : null}

        <section className="sf-section" aria-labelledby="facility-spaces">
          <h2 id="facility-spaces" className="sf-h2" style={{ marginBottom: 20 }}>Spaces</h2>
          {facilities.length ? (
            <div className="sf-features">
              {facilities.map((facility) => (
                <article key={facility.title}>
                  <h3>{facility.title}</h3>
                  {facility.description ? <p>{facility.description}</p> : <span />}
                  {facility.features?.length ? (
                    <ul className="sf-list-plain" aria-label={`${facility.title} features`}>
                      {facility.features.map((feature) => <li key={feature} className="sf-tag">{feature}</li>)}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Building2 aria-hidden="true" />} title="No spaces published" action={<ArrowLink href="/contact">Contact</ArrowLink>} />
          )}
        </section>

        <section className="sf-section" aria-labelledby="facility-visit">
          <h2 id="facility-visit" className="sf-h2" style={{ marginBottom: 20 }}>Visit</h2>
          <div className="sf-split">
            <div className="sf-stack">
              {config?.address ? <p className="sf-h3">{config.address}</p> : <p className="sf-text-2">Address not published</p>}
              {config?.phone ? <a className="sf-link" href={`tel:${config.phone}`}>{config.phone}</a> : null}
              <div className="sf-actions">
                {config?.address ? (
                  <a className="sf-btn" data-variant="secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.address)}`} target="_blank" rel="noreferrer">
                    Directions<ArrowUpRight aria-hidden="true" />
                  </a>
                ) : null}
                <Link href="/contact" className="sf-btn" data-variant="ghost">Contact</Link>
                <Link href="/policies" className="sf-btn" data-variant="ghost">Policies</Link>
              </div>
            </div>
            <div className="sf-panel">
              <div className="sf-row" data-between>
                <h3 className="sf-h3">Hours</h3>
                <span className="sf-meta">{timeZone}</span>
              </div>
              {hours.length ? <HoursList hours={hours} timeZone={timeZone} /> : <p className="sf-text-2">Not published</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
