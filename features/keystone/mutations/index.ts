import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import { getBillingStats, getBillingWorkspace } from "../queries/billing";
import { getMemberCheckInCode, getMemberProfile, updateMemberProfile } from "../queries/memberExperience";
import { getSchedulingWorkspace } from "../queries/scheduling";
import { getInstructorAccount, getRosterDetail, getRosterSessions } from "../queries/rosters";
import { getReportsDashboard } from "../queries/reports";
import {
  getPublicGymClassInstance,
  getPublicGymClassInstances,
  getPublicGymClassType,
  getPublicGymClassTypes,
  getPublicGymInstructor,
  getPublicGymInstructors,
  getPublicGymMembershipTier,
  getPublicGymMembershipTiers,
  getPublicGymSchedule,
  getPublicGymSchedules,
  getPublicGymSettings,
} from "../queries/publicGym";
import {
  checkClassAvailability,
  bookClass,
  promoteFromWaitlist,
} from "./classBooking";
import {
  createStripeSetupIntent,
  cancelMembership,
  freezeMembership,
  unfreezeMembership,
  changeMembershipTier,
  getStripeBillingPortal,
  markPaymentRecoveryContacted,
} from "./stripeSubscription";
import {
  initiateMembershipCheckout,
  completeMembershipCheckout,
  refundGymPayment,
} from "./paymentLifecycle";
import { upsertGymSettings } from "./gymSettingsLifecycle";
import {
  cancelClassBooking,
  cancelClassInstance,
  checkOutMember,
  markClassAttendance,
  recordMemberCheckIn,
} from "./gymLifecycleResolvers";
import { runDeterministicOnboarding } from "./deterministicOnboarding";
import { registerMember } from "./memberRegistration";
import { inviteMember } from "./memberInvitation";
import { setMemberAccountStatus } from "./memberAccount";
import { prepareInstructorAccount } from "./instructorAccount";
import { transitionOnboardingStatus } from "./onboardingStatus";
import {
  generateUpcomingClassInstances,
  updateClassInstanceCapacity,
  updateClassScheduleCapacity,
} from "./scheduling";
import {
  authorizeKioskSession,
  kioskRecordGuestCheckIn,
  kioskRecordMemberCheckIn,
  kioskSearchMembers,
} from "./kiosk";
import { bookDiscoveryClass, getDiscoveryClasses } from "./discovery";
import { submitContactForm } from "./contact";

const graphql = String.raw;

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      type Query {
        redirectToInit: Boolean
        checkClassAvailability(classInstanceId: ID!): ClassAvailabilityResult!
        getBillingStats: BillingStats!
        billingWorkspace: JSON!
        memberProfile: MemberProfileProjection!
        memberCheckInCode: MemberCheckInCode!
        schedulingWorkspace(start: DateTime!, end: DateTime!, userId: ID): JSON!
        instructorAccount: JSON
        rosterSessions: JSON!
        rosterDetail(classInstanceId: ID!): JSON
        reportsDashboard: JSON!
        kioskSearchMembers(query: String!, organizationId: ID!, credential: String!): [KioskSearchMember!]!
        discoveryClasses(
          credential: String!
          partner: String
          from: String
          to: String
          dayOfWeek: String
          locationId: ID
          locationName: String
          limit: Int
        ): JSON!

        publicGymSettings: PublicGymSettings
        publicGymClassTypes(limit: Int = 50): [PublicGymClassType!]!
        publicGymClassType(id: ID!): PublicGymClassType
        publicGymSchedules(dayOfWeek: String, instructorId: ID, limit: Int = 50): [PublicGymSchedule!]!
        publicGymSchedule(id: ID!): PublicGymSchedule
        publicGymClassInstances(
          from: DateTime
          to: DateTime
          scheduleId: ID
          instructorId: ID
          limit: Int = 50
        ): [PublicGymClassInstance!]!
        publicGymClassInstance(id: ID!): PublicGymClassInstance
        publicGymInstructors(limit: Int = 50): [PublicGymInstructor!]!
        publicGymInstructor(id: ID!): PublicGymInstructor
        publicGymMembershipTiers(limit: Int = 50): [PublicGymMembershipTier!]!
        publicGymMembershipTier(id: ID!): PublicGymMembershipTier
      }

      type PublicGymSettings {
        id: ID!
        name: String!
        tagline: String
        logoIcon: String
        brandHue: Int!
        description: String
        address: String
        phone: String
        email: String
        currencyCode: String
        locale: String
        timezone: String
        countryCode: String
        hours: JSON
        heroEyebrow: String
        heroHeadline: String
        heroSubheadline: String
        heroImagePath: String
        heroPrimaryCtaLabel: String
        heroPrimaryCtaHref: String
        heroSecondaryCtaLabel: String
        heroSecondaryCtaHref: String
        promoBanner: String
        footerTagline: String
        copyrightName: String
        facilityHeadline: String
        facilityDescription: String
        facilityHighlights: JSON
        heroStats: JSON
        contactTopics: JSON
      }

      type PublicGymClassType {
        id: ID!
        name: String!
        description: String
        difficulty: String!
        duration: Int!
        caloriesBurn: Int
        equipmentNeeded: [String!]!
      }

      type PublicGymInstructor {
        id: ID!
        name: String!
        bio: String
        specialties: [String!]!
        certifications: [String!]!
        imagePath: String
      }

      type PublicGymSchedule {
        id: ID!
        name: String!
        description: String
        dayOfWeek: String!
        startTime: String!
        endTime: String!
        maxCapacity: Int!
        classType: PublicGymClassType
        instructor: PublicGymInstructor
      }

      type PublicGymAvailability {
        maxCapacity: Int!
        confirmedBookings: Int!
        waitlistCount: Int!
        spotsRemaining: Int!
        state: String!
      }

      type PublicGymClassInstance {
        id: ID!
        startsAt: String!
        schedule: PublicGymSchedule
        instructor: PublicGymInstructor
        availability: PublicGymAvailability!
      }

      type PublicGymMembershipTier {
        id: ID!
        name: String!
        description: String
        monthlyPrice: Float!
        annualPrice: Float!
        classCreditsPerMonth: Int!
        accessHours: String!
        guestPasses: Int!
        personalTrainingSessions: Int!
        freezeAllowed: Boolean!
        contractLength: Int!
        monthlyCheckoutAvailable: Boolean!
        annualCheckoutAvailable: Boolean!
      }

      type Mutation {
        bookClass(classInstanceId: ID!, memberId: ID!): BookClassResult!
        promoteFromWaitlist(classInstanceId: ID!): PromoteResult!
        cancelClassBooking(bookingId: ID!): BookingCancellationResult!
        cancelClassInstance(classInstanceId: ID!, reason: String!): ClassInstanceCancellationResult!
        markClassAttendance(
          bookingId: ID!
          outcome: String!
          minutesLate: Int
          notes: String
        ): AttendanceRecord!
        recordMemberCheckIn(memberId: ID!, locationId: ID, method: String!): CheckInTransitionResult!
        checkOutMember(checkInId: ID!): CheckInTransitionResult!
        upsertGymSettings(data: GymSettingsUpdateInput!): GymSettings!
        runDeterministicOnboarding(template: String!): OnboardingRunResult!
        registerMember(data: RegisterMemberInput!): User
        inviteMember(data: InviteMemberInput!): InviteMemberResult!
        setMemberAccountStatus(memberId: ID!, status: String!): Member!
        prepareInstructorAccount(instructorId: ID!, email: String!): InstructorAccountClaimResult!
        updateMemberProfile(data: MemberProfileUpdateInput!): MemberProfileProjection!
        transitionOnboardingStatus(status: String!): User!
        generateUpcomingClassInstances(weeks: Int!): SchedulingGenerationResult!
        updateClassScheduleCapacity(classScheduleId: ID!, maxCapacity: Int!): ClassSchedule!
        updateClassInstanceCapacity(classInstanceId: ID!, maxCapacity: Int): ClassInstance!
        authorizeKioskSession(credential: String!, organizationId: ID!): Boolean!
        kioskRecordMemberCheckIn(
          memberId: String
          qrCode: String
          locationId: String
          organizationId: ID!
          credential: String!
        ): KioskMemberCheckInResult!
        kioskRecordGuestCheckIn(
          name: String!
          phone: String
          hostMember: String
          idempotencyKey: String!
          organizationId: ID!
          credential: String!
        ): KioskGuestCheckInResult!
        submitContactForm(data: ContactFormInput!): Boolean!
        discoveryBookClass(
          credential: String!
          partner: String
          classInstanceId: ID!
          memberId: ID
          memberEmail: String
        ): JSON!
        # Stripe subscription mutations
        initiateMembershipCheckout(tierId: ID!, billingCycle: String!): MembershipCheckoutResult!
        completeMembershipCheckout(providerSessionId: String!): MembershipCheckoutCompletionResult!

        refundGymPayment(paymentId: ID!, amount: Int, reason: String, idempotencyKey: String!): GymPayment!

        createStripeSetupIntent(userId: ID!): SetupIntentResult!

        cancelMembership(membershipId: ID!, reason: String, idempotencyKey: String!): MembershipActionResult!

        freezeMembership(
          membershipId: ID!
          endDate: String!
          idempotencyKey: String!
        ): MembershipActionResult!

        unfreezeMembership(membershipId: ID!, idempotencyKey: String!): MembershipActionResult!

        changeMembershipTier(
          membershipId: ID!
          newTierId: ID!
          idempotencyKey: String!
        ): MembershipActionResult!

        markPaymentRecoveryContacted(membershipId: ID!): Membership!
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

      type PromoteResult {
        promoted: Boolean!
        booking: ClassBooking
        message: String!
      }

      type BookingCancellationResult {
        booking: ClassBooking!
        promoted: Boolean!
        message: String!
      }

      type CheckInTransitionResult {
        checkIn: CheckIn!
        reused: Boolean!
      }

      type ClassInstanceCancellationResult {
        classInstanceId: ID!
        cancelledBookings: Int!
        refundedCredits: Int!
        reused: Boolean!
      }

      type MemberProfileTier {
        id: ID!
        name: String!
        monthlyPrice: Float!
      }

      type MemberProfileProjection {
        id: ID!
        name: String!
        email: String!
        phone: String
        dateOfBirth: String
        joinDate: String!
        status: String!
        emergencyContactName: String
        emergencyContactPhone: String
        healthNotes: JSON
        profilePhotoUrl: String
        membershipTier: MemberProfileTier
        membershipLengthDays: Int!
        attendanceRate: Float!
        lastCheckIn: String
      }

      input MemberProfileUpdateInput {
        name: String
        email: String
        phone: String
        password: String
        dateOfBirth: String
        emergencyContactName: String
        emergencyContactPhone: String
        healthNotes: JSON
      }

      type MemberCheckInCode {
        qrDataUrl: String!
        expiresIn: Int!
      }

      input InviteMemberInput {
        name: String!
        email: String!
        phone: String
      }

      type InviteMemberResult {
        userId: ID!
        memberId: ID!
        email: String!
      }

      type InstructorAccountClaimResult {
        userId: ID!
        email: String!
      }

      type SchedulingGenerationResult {
        success: Boolean!
        createdCount: Int!
      }

      type KioskSearchMember {
        id: ID!
        name: String!
        email: String!
        phone: String!
        status: String!
        membershipTier: String
        membershipStatus: String
        classCreditsRemaining: Int
      }

      type KioskMemberCheckInResult {
        success: Boolean!
        error: String
        checkInId: ID
        memberName: String
        membershipTier: String
        checkInTime: String
        reused: Boolean
        classCreditsRemaining: Int
      }

      type KioskGuestCheckInResult {
        success: Boolean!
        checkInId: ID!
        guestName: String!
        checkInTime: String!
      }

      # Stripe subscription types
      type MembershipCheckoutCompletionResult {
        membershipId: String!
        paymentProviderId: ID!
        paymentSessionId: ID!
        subscriptionId: String!
        tierName: String!
        billingCycle: String!
      }

      type MembershipCheckoutResult {
        id: ID!
        status: String!
        checkoutUrl: String!
        reused: Boolean!
      }

      input ContactFormInput {
        firstName: String!
        lastName: String!
        email: String!
        phone: String
        topic: String
        message: String!
      }

      input RegisterMemberInput {
        email: String!
        password: String!
        name: String!
        phone: String
      }

      type OnboardingRunResult {
        success: Boolean!
        organizationId: ID!
        runId: ID!
        instanceCount: Int!
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
        currencyCode: String!
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
        billingWorkspace: getBillingWorkspace,
        memberProfile: getMemberProfile,
        memberCheckInCode: getMemberCheckInCode,
        schedulingWorkspace: getSchedulingWorkspace,
        instructorAccount: getInstructorAccount,
        rosterSessions: getRosterSessions,
        rosterDetail: getRosterDetail,
        reportsDashboard: getReportsDashboard,
        kioskSearchMembers,
        discoveryClasses: getDiscoveryClasses,
        publicGymSettings: getPublicGymSettings,
        publicGymClassTypes: getPublicGymClassTypes,
        publicGymClassType: getPublicGymClassType,
        publicGymSchedules: getPublicGymSchedules,
        publicGymSchedule: getPublicGymSchedule,
        publicGymClassInstances: getPublicGymClassInstances,
        publicGymClassInstance: getPublicGymClassInstance,
        publicGymInstructors: getPublicGymInstructors,
        publicGymInstructor: getPublicGymInstructor,
        publicGymMembershipTiers: getPublicGymMembershipTiers,
        publicGymMembershipTier: getPublicGymMembershipTier,
      },
      Mutation: {
        bookClass,
        promoteFromWaitlist,
        cancelClassBooking,
        cancelClassInstance,
        markClassAttendance,
        recordMemberCheckIn,
        checkOutMember,
        upsertGymSettings,
        runDeterministicOnboarding,
        registerMember,
        inviteMember,
        setMemberAccountStatus,
        prepareInstructorAccount,
        updateMemberProfile,
        transitionOnboardingStatus,
        generateUpcomingClassInstances,
        updateClassScheduleCapacity,
        updateClassInstanceCapacity,
        authorizeKioskSession,
        kioskRecordMemberCheckIn,
        kioskRecordGuestCheckIn,
        discoveryBookClass: bookDiscoveryClass,
        submitContactForm,
        initiateMembershipCheckout,
        completeMembershipCheckout,
        refundGymPayment,
        createStripeSetupIntent,
        cancelMembership,
        freezeMembership,
        unfreezeMembership,
        changeMembershipTier,
        markPaymentRecoveryContacted,
        getStripeBillingPortal,
      },
    },
  });
}
