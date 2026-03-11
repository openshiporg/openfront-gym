import { keystoneContext } from "@/features/keystone/context";

export type MembershipTierData = {
  id: string;
  name: string;
  description: any;
  monthlyPrice: number;
  annualPrice: number;
  classCreditsPerMonth: number;
  accessHours: string;
  guestPasses: number;
  personalTrainingSessions: number;
  freezeAllowed: boolean;
  contractLength: number;
};

export async function getMembershipTiers(): Promise<MembershipTierData[]> {
  const context = keystoneContext.sudo();

  const tiers = await context.query.MembershipTier.findMany({
    orderBy: [{ monthlyPrice: "asc" }],
    query: `
      id
      name
      description { document }
      monthlyPrice
      annualPrice
      classCreditsPerMonth
      accessHours
      guestPasses
      personalTrainingSessions
      freezeAllowed
      contractLength
    `,
  });

  return tiers as MembershipTierData[];
}

export async function getMembershipTierById(id: string): Promise<MembershipTierData | null> {
  const context = keystoneContext.sudo();

  const tier = await context.query.MembershipTier.findOne({
    where: { id },
    query: `
      id
      name
      description { document }
      monthlyPrice
      annualPrice
      classCreditsPerMonth
      accessHours
      guestPasses
      personalTrainingSessions
      freezeAllowed
      contractLength
    `,
  });

  return tier as MembershipTierData | null;
}
