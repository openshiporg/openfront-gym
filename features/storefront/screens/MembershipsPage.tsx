import MembershipTiers from "@/features/storefront/modules/memberships/components/membership-tiers";
import { Metadata } from "next";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink, Banner } from "@/features/storefront/modules/common/ui";
import { contactPath } from "@/features/storefront/lib/contact-config";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Memberships",
    description: "Membership plans with price, class allowance, access hours and terms.",
  };
}

export async function MembershipsPage({ searchParams }: { searchParams?: Promise<{ after?: string | string[] }> } = {}) {
  const resolved = searchParams ? await searchParams : undefined;
  const after = typeof resolved?.after === "string" ? resolved.after.slice(0, 100) : undefined;
  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Memberships" aside={<ArrowLink href={contactPath("membership", "/memberships")} size="sm">Membership questions</ArrowLink>} />
        <div className="sf-stack" data-gap="lg">
          <MembershipTiers after={after} />
          <Banner
            title="Drop-ins and trial visits"
            action={<ArrowLink href={contactPath("trial", "/memberships")} size="sm">Ask about a visit</ArrowLink>}
          >
            Day passes aren’t sold online. The front desk arranges drop-in and trial visits.
          </Banner>
        </div>
      </div>
    </div>
  );
}
