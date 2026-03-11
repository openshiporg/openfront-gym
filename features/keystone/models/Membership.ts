import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  relationship,
  select,
  timestamp,
  checkbox,
  integer,
  text,
} from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const Membership = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["member", "tier", "status", "billingCycle", "nextBillingDate"],
    },
  },
  fields: {
    member: relationship({
      ref: "User.membership",
      ui: {
        displayMode: "select",
      },
    }),

    tier: relationship({
      ref: "MembershipTier",
      ui: {
        displayMode: "select",
      },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Frozen", value: "frozen" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Expired", value: "expired" },
        { label: "Past Due", value: "past-due" },
      ],
      defaultValue: "active",
      validation: { isRequired: true },
    }),

    startDate: timestamp({
      validation: { isRequired: true },
    }),

    billingCycle: select({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" },
      ],
      defaultValue: "monthly",
      validation: { isRequired: true },
    }),

    nextBillingDate: timestamp(),

    autoRenew: checkbox({
      defaultValue: true,
    }),

    classCreditsRemaining: integer({
      defaultValue: 0,
      ui: {
        description: "Remaining class credits for current billing period",
      },
    }),

    freezeStartDate: timestamp({
      ui: {
        description: "Start date of membership freeze",
      },
    }),

    freezeEndDate: timestamp({
      ui: {
        description: "End date of membership freeze",
      },
    }),

    payments: relationship({
      ref: 'MembershipPayment.membership',
      many: true,
      ui: {
        description: "Payment history for this membership",
      },
    }),

    // Stripe integration - only set when membership is linked to Stripe subscription
    stripeSubscriptionId: text({
      isIndexed: 'unique',
      db: { isNullable: true },
      ui: {
        description: "Stripe Subscription ID (only for Stripe-billed memberships)",
      },
    }),

    cancelReason: text({
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation",
      },
    }),

    cancelledAt: timestamp({
      ui: {
        description: "When the membership was cancelled",
      },
    }),

    ...trackingFields,
  },
});
