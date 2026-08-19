import MembershipTiers from "@/features/storefront/modules/memberships/components/membership-tiers";
import MembershipFAQ from "@/features/storefront/modules/memberships/components/membership-faq";
import { Metadata } from "next";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Membership — ${getStorefrontBrandName(config)}`,
    description: config?.description || "Flexible plans for every training goal.",
  };
}

export async function MembershipsPage() {
  const config = await getStorefrontConfig();

  return (
    <div className="sf-page">
      <div className="sf-container">
        <header className="sf-page-header">
          <div>
            <p className="sf-eyebrow mb-3">Membership</p>
            <h1 className="sf-display text-5xl sm:text-6xl">
              Facility access
              <br />
              <span className="italic text-[var(--sf-accent)]">with a class plan</span>
            </h1>
          </div>
          <p className="sf-lead max-w-md">
            {config?.description ||
              "Every plan keeps pricing, class credits, access hours, and freeze terms visible before signup."}
          </p>
        </header>

        <MembershipTiers />

        <div className="mt-16 border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-8 sm:p-10">
          <MembershipFAQ />
        </div>
      </div>
    </div>
  );
}
