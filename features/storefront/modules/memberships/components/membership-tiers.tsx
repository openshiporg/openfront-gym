import Link from "next/link"
import { Check, Star } from "lucide-react"
import { getMembershipTiers, type MembershipTierData } from "@/features/storefront/lib/data/memberships"

// Function to generate features list from tier data
function generateFeatures(tier: MembershipTierData): string[] {
  const features: string[] = [];

  // Class credits
  if (tier.classCreditsPerMonth === -1) {
    features.push("Unlimited class credits");
  } else if (tier.classCreditsPerMonth > 0) {
    features.push(`${tier.classCreditsPerMonth} class credits per month`);
  }

  // Access hours
  if (tier.accessHours === "24/7") {
    features.push("24/7 facility access");
  } else {
    features.push("Access to gym facilities");
  }

  // Personal training
  if (tier.personalTrainingSessions > 0) {
    features.push(`${tier.personalTrainingSessions} personal training session${tier.personalTrainingSessions > 1 ? 's' : ''}/month`);
  }

  // Guest passes
  if (tier.guestPasses === -1) {
    features.push("Unlimited guest passes");
  } else if (tier.guestPasses > 0) {
    features.push(`${tier.guestPasses} guest pass${tier.guestPasses > 1 ? 'es' : ''}/month`);
  }

  // Freeze allowed
  if (tier.freezeAllowed) {
    features.push("Membership freeze option");
  }

  // Contract flexibility
  if (tier.contractLength === 0) {
    features.push("No contract - cancel anytime");
  }

  // Always include these basic features
  features.push("Locker room access");
  features.push("Online class booking");
  features.push("Mobile app access");
  features.push("Progress tracking");

  return features;
}

export default async function MembershipTiers() {
  const tiers = await getMembershipTiers();

  // If no tiers in database, show placeholder
  if (tiers.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">
          Membership plans coming soon. Please check back later!
        </p>
      </div>
    );
  }

  // Determine which tier to highlight (middle tier or most expensive under $100)
  const tierData = tiers.map((tier, index) => ({
    ...tier,
    features: generateFeatures(tier),
    highlighted: index === Math.floor(tiers.length / 2), // Highlight middle tier
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
      {tierData.map((tier) => (
        <div
          key={tier.id}
          className={`relative bg-card border-2 rounded-2xl p-8 transition-all ${
            tier.highlighted
              ? "border-primary shadow-2xl scale-105 z-10"
              : "border-border hover:border-primary/50 hover:shadow-lg"
          }`}
        >
          {tier.highlighted && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1 shadow-lg">
                <Star className="w-3 h-3 fill-current" />
                Most Popular
              </span>
            </div>
          )}

          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-3">{tier.name}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {tier.classCreditsPerMonth === -1 ? "For the dedicated athlete" :
               tier.classCreditsPerMonth >= 10 ? "Our most popular plan" :
               "Perfect for getting started"}
            </p>
            <div className="mb-3">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-sm font-medium">$</span>
                <span className="text-5xl font-bold">{tier.monthlyPrice}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            <div className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold">
              Save ${Math.round(tier.monthlyPrice * 12 - tier.annualPrice)} with annual
            </div>
          </div>

          <ul className="space-y-4 mb-8">
            {tier.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" strokeWidth={3} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Link
            href={`/memberships/signup?tier=${tier.id}`}
            className={`w-full py-3.5 rounded-lg text-sm font-bold inline-flex items-center justify-center transition-all ${
              tier.highlighted
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                : "border-2 border-primary/20 bg-background hover:bg-primary hover:text-primary-foreground"
            }`}
          >
            Get Started
          </Link>
        </div>
      ))}
    </div>
  )
}
