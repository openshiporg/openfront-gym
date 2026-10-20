import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { PUBLIC_PAGE_SIZE, collectPublicPages, publicCatalogPage } from "./pages";

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
  features: string[];
  monthlyCheckoutAvailable: boolean;
  annualCheckoutAvailable: boolean;
};

const FIELDS = gql`
  fragment StorefrontMembershipTier on PublicGymMembershipTier {
    id name description monthlyPrice annualPrice classCreditsPerMonth accessHours
    guestPasses personalTrainingSessions freezeAllowed contractLength features
    monthlyCheckoutAvailable annualCheckoutAvailable
  }
`;

/** This storefront's published plans (its own organization; the argument is ignored). */
export async function getMembershipTiers(_organizationId?: string | null): Promise<MembershipTierData[]> {
  const { items } = await collectPublicPages(async (skip) => (await gymClient.request<{ publicGymMembershipTiers: MembershipTierData[] }>(gql`
    ${FIELDS}
    query StorefrontMembershipTiers($skip: Int, $limit: Int) {
      publicGymMembershipTiers(limit: $limit, skip: $skip) { ...StorefrontMembershipTier }
    }
  `, { skip, limit: PUBLIC_PAGE_SIZE })).publicGymMembershipTiers);
  return items;
}

/** One page of published plans after `after` (keyset continuation, price order). */
export async function getMembershipTierPage(after?: string) {
  return publicCatalogPage(async (limit) => (await gymClient.request<{ publicGymMembershipTiers: MembershipTierData[] }>(gql`
    ${FIELDS}
    query StorefrontMembershipTierPage($limit: Int, $after: ID) {
      publicGymMembershipTiers(limit: $limit, after: $after) { ...StorefrontMembershipTier }
    }
  `, { limit, after: after || null })).publicGymMembershipTiers);
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
