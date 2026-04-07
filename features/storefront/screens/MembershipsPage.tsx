import MembershipTiers from "@/features/storefront/modules/memberships/components/membership-tiers";
import MembershipFAQ from "@/features/storefront/modules/memberships/components/membership-faq";
import { Metadata } from "next";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: config?.name ? `Membership Plans — ${config.name}` : "Membership Plans",
    description: config?.description || "Flexible plans for every fitness goal.",
  };
}

export async function MembershipsPage() {
  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden border border-white/10 bg-[#0e0e0e] px-8 py-16 sm:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,181,158,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(125,244,255,0.12),transparent_32%)]" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Engineered access</p>
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.08em] text-white sm:text-7xl">
                Membership
                <br />
                architecture
              </h1>
            </div>
            <p className="max-w-md border-l-2 border-[#818cf8] pl-6 text-base leading-relaxed text-[#c4c7c7]">
              Every plan includes facility access. Class access, recovery depth, and coaching benefits scale with the tier you choose.
            </p>
          </div>
        </section>

        <div className="mt-16">
          <MembershipTiers />
        </div>

        <div className="mt-16 bg-[#1c1b1b] px-8 py-12">
          <MembershipFAQ />
        </div>
      </div>
    </div>
  );
}
