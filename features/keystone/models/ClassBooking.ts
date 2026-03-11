import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  relationship,
  select,
  timestamp,
  integer,
  text,
} from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const ClassBooking = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["classInstance", "member", "memberName", "status", "bookedAt"],
    },
  },
  fields: {
    // Link to specific class instance
    classInstance: relationship({
      ref: "ClassInstance.bookings",
      ui: {
        displayMode: "select",
        description: "The class instance being booked",
      },
    }),

    // Link to member
    member: relationship({
      ref: "Member.bookings",
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

    status: select({
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
      ui: {
        description: "Position in waitlist (only applicable when status is 'waitlist')",
      },
    }),

    bookedAt: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
    }),

    cancelledAt: timestamp({
      ui: {
        description: "When the booking was cancelled",
      },
    }),

    ...trackingFields,
  },
});
