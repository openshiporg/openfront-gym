import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";

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
  monthlyCheckoutAvailable: boolean;
  annualCheckoutAvailable: boolean;
};

const FIELDS = gql`
  fragment StorefrontMembershipTier on PublicGymMembershipTier {
    id name description monthlyPrice annualPrice classCreditsPerMonth accessHours
    guestPasses personalTrainingSessions freezeAllowed contractLength
    monthlyCheckoutAvailable annualCheckoutAvailable
  }
`;

export async function getMembershipTiers(_organizationId?: string | null): Promise<MembershipTierData[]> {
  const result = await gymClient.request<{ publicGymMembershipTiers: MembershipTierData[] }>(gql`
    ${FIELDS}
    query StorefrontMembershipTiers {
      publicGymMembershipTiers(limit: 100) { ...StorefrontMembershipTier }
    }
  `);
  return result.publicGymMembershipTiers;
}

export async function getMembershipTierById(id: string): Promise<MembershipTierData | null> {
  const result = await gymClient.request<{ publicGymMembershipTier: MembershipTierData | null }>(gql`
    ${FIELDS}
    query StorefrontMembershipTier($id: ID!) {
      publicGymMembershipTier(id: $id) { ...StorefrontMembershipTier }
    }
  `, { id });
  return result.publicGymMembershipTier;
}
