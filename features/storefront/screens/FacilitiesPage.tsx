import { Metadata } from "next";
import { Dumbbell, Users, Wifi, Droplet, Clock, MapPin } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Explore the facility, studios, and amenities configured for the gym.",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: config?.name ? `Facilities - ${config.name}` : metadata.title,
    description: config?.facilityDescription || metadata.description,
  };
}

const ICONS = [Dumbbell, Users, Clock, Droplet, Wifi, MapPin];

export async function FacilitiesPage() {
  const config = await getStorefrontConfig();
  const facilities = config?.facilityHighlights?.length
    ? config.facilityHighlights
    : [
        {
          title: "Weight training floor",
          description: "Heavy iron, racks, platforms, and enough load to support real strength work.",
          features: ["Power racks", "Olympic platforms", "Free weights", "Cable stations"],
        },
      ];

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">Built environment</p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              {config?.facilityHeadline || "Facility systems"}
            </h1>
          </div>
          <p className="max-w-md border-l-2 border-[#ffb59e] pl-6 text-base leading-relaxed text-[#c4c7c7]">
            {config?.facilityDescription || "Training, coaching, recovery, and member access all live in one coordinated environment."}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {facilities.map((facility: any, index: number) => {
            const Icon = ICONS[index % ICONS.length];
            return (
              <article key={facility.title} className={`${index % 2 === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"} p-8`}>
                <Icon className="h-8 w-8 text-[#ffb59e]" />
                <h2 className="mt-6 font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.04em] text-white">
                  {facility.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-[#c4c7c7]">{facility.description}</p>
                <ul className="mt-6 space-y-2 text-xs uppercase tracking-[0.16em] text-[#e5e2e1]">
                  {(facility.features || []).map((feature: string) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <section className="mt-16 bg-[#0e0e0e] p-10">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.05em] text-white">
            Member environment
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Access windows</p>
              <p className="mt-2 text-sm leading-relaxed text-[#e5e2e1]">Hours, tier access, and staffed support are configured during onboarding and surfaced across the storefront.</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Operational upkeep</p>
              <p className="mt-2 text-sm leading-relaxed text-[#e5e2e1]">Studios, locker rooms, and shared spaces are maintained around active schedule windows and member flow.</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">Coaching support</p>
              <p className="mt-2 text-sm leading-relaxed text-[#e5e2e1]">The environment supports both self-directed training and coached programming without splitting the experience.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
