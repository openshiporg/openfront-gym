import { list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  relationship,
  select,
  timestamp,
  integer,
  text,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions, rules } from "../access";
import { trackingFields } from "./trackingFields";
import { bookingLifecycleHooks } from "../mutations/gymLifecyclePolicy";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const ClassBooking = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, classInstanceId, memberId, activeBookingKey") },
  hooks: {
    async validateInput(args: any) {
      bookingLifecycleHooks.validateInput(args);
      await validateTenantOwnership([
        { field: "classInstance", list: "classInstance", required: true },
        { field: "member", list: "member", required: true },
      ])(args);
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      // Booking state, capacity, credits, and waitlists are controlled only by custom mutations.
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadOwnBooking,
      update: rules.canReadOwnBooking,
      delete: rules.canReadOwnBooking,
    },
  },
  ui: {
    listView: {
      initialColumns: ["classInstance", "member", "memberName", "status", "bookedAt"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.classBookings",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    // Link to specific class instance
    classInstance: relationship({
      ref: "ClassInstance.bookings",
      access: { update: denyAll },
      ui: {
        displayMode: "select",
        description: "The class instance being booked",
      },
    }),

    // Link to member
    member: relationship({
      ref: "Member.bookings",
      access: { update: denyAll },
      ui: {
        displayMode: "select",
        description: "The member who made the booking",
      },
    }),

    // Denormalized member info for quick access
    memberName: text({
      ui: {
        description: "Member's name at time of booking",
      },
    }),

    memberEmail: text({
      ui: {
        description: "Member's email at time of booking",
      },
    }),

    memberPhone: text({
      ui: {
        description: "Member's phone number",
      },
    }),

    notes: text({
      ui: {
        displayMode: "textarea",
        description: "Special notes or requests for this booking",
      },
    }),
    activeBookingKey: text({
      db: { isNullable: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),

    status: select({
      access: { update: denyAll },
      type: "string",
      options: [
        { label: "Confirmed", value: "confirmed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Waitlist", value: "waitlist" },
      ],
      defaultValue: "confirmed",
      validation: { isRequired: true },
    }),

    waitlistPosition: integer({
      access: { update: denyAll },
      ui: {
        description: "Position in waitlist (only applicable when status is 'waitlist')",
      },
    }),

    bookedAt: timestamp({
      access: { update: denyAll },
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
    }),

    cancelledAt: timestamp({
      access: { update: denyAll },
      ui: {
        description: "When the booking was cancelled",
      },
    }),

    ...trackingFields,
  },
});
