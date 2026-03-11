import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import { getBillingStats } from "../queries/billing";
import {
  checkClassAvailability,
  bookClass,
  checkIn,
  promoteFromWaitlist,
  kioskCheckIn,
} from "./classBooking";
import {
  createMembershipWithStripe,
  createStripeSetupIntent,
  cancelMembership,
  freezeMembership,
  unfreezeMembership,
  changeMembershipTier,
  getStripeBillingPortal,
} from "./stripeSubscription";

const graphql = String.raw;

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      type Query {
        redirectToInit: Boolean
        checkClassAvailability(classInstanceId: ID!): ClassAvailabilityResult!
        getBillingStats: BillingStats!
      }

      type Mutation {
        bookClass(classInstanceId: ID!, memberId: ID!): BookClassResult!
        checkIn(memberId: ID!, bookingId: ID, classInstanceId: ID): CheckInResult!
        promoteFromWaitlist(classInstanceId: ID!): PromoteResult!
        kioskCheckIn(memberId: String, pin: String): KioskCheckInResult!

        # Stripe subscription mutations
        createMembershipWithStripe(
          email: String!
          name: String!
          password: String!
          tierId: ID!
          billingCycle: String!
          paymentMethodId: String
        ): CreateMembershipResult!

        createStripeSetupIntent(userId: ID!): SetupIntentResult!

        cancelMembership(membershipId: ID!, reason: String): MembershipActionResult!

        freezeMembership(
          membershipId: ID!
          startDate: String!
          endDate: String!
        ): MembershipActionResult!

        unfreezeMembership(membershipId: ID!): MembershipActionResult!

        changeMembershipTier(
          membershipId: ID!
          newTierId: ID!
        ): MembershipActionResult!

        getStripeBillingPortal(userId: ID!, returnUrl: String!): BillingPortalResult!
      }

      type ClassAvailabilityResult {
        available: Boolean!
        spotsRemaining: Int!
        waitlistPosition: Int
        reason: String
      }

      type BookClassResult {
        booking: ClassBooking
        creditsRemaining: Int!
      }

      type CheckInResult {
        success: Boolean!
        booking: ClassBooking
        message: String!
        creditsRemaining: Int
      }

      type PromoteResult {
        promoted: Boolean!
        booking: ClassBooking
        message: String!
      }

      type KioskMemberInfo {
        id: String!
        name: String!
        email: String!
        membership: KioskMembershipInfo
      }

      type KioskMembershipInfo {
        id: String!
        status: String!
        tier: KioskTierInfo
        classCreditsRemaining: Int
      }

      type KioskTierInfo {
        name: String!
      }

      type KioskCheckInResult {
        success: Boolean!
        message: String!
        member: KioskMemberInfo
        attendanceId: String
      }

      # Stripe subscription types
      type CreateMembershipResult {
        membership: Membership
        user: User
        subscriptionId: String!
        clientSecret: String
        subscriptionStatus: String!
      }

      type SetupIntentResult {
        clientSecret: String!
        setupIntentId: String!
      }

      type MembershipActionResult {
        membership: Membership
        message: String!
      }

      type BillingPortalResult {
        url: String!
      }

      type BillingStats {
        totalRevenue: Float!
        monthlyRevenue: Float!
        activeSubscriptions: Int!
        activeMemberships: Int!
        pastDueCount: Int!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        checkClassAvailability,
        getBillingStats,
      },
      Mutation: {
        bookClass,
        checkIn,
        promoteFromWaitlist,
        kioskCheckIn,
        createMembershipWithStripe,
        createStripeSetupIntent,
        cancelMembership,
        freezeMembership,
        unfreezeMembership,
        changeMembershipTier,
        getStripeBillingPortal,
      },
    },
  });
}
