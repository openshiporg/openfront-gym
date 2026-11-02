import { graphql, list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  relationship,
  select,
  timestamp,
  checkbox,
  integer,
  text,
  json,
  virtual,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions, rules } from "../access";
import { trackingFields } from "./trackingFields";
import { creditsLabel } from "../../../lib/list-labels";
import { membershipLifecycleHooks } from "../mutations/gymLifecyclePolicy";
import { requiredRelationshipDb, validateTenantOwnership, restrictDeleteDb } from "./tenantRelationships";

export const Membership = list({
  hooks: {
    async validateInput(args: any) {
      membershipLifecycleHooks.validateInput(args);
      await validateTenantOwnership([
        { field: "member", list: "user", required: true },
        { field: "tier", list: "membershipTier", required: true },
      ])(args);
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      // Membership state and credits are changed by checkout/webhook workflows only.
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadOwnMembership,
      update: rules.canReadOwnMembership,
      delete: rules.canReadOwnMembership,
    },
  },
  ui: {
    listView: {
      initialColumns: ["member", "tier", "status", "billingCycle", "nextBillingDate"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.memberships",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    member: relationship({
      ref: "User.membership",
      access: { update: denyAll },
      db: { extendPrismaSchema: restrictDeleteDb },
      ui: {
        displayMode: "select",
      },
    }),

    tier: relationship({
      ref: "MembershipTier",
      access: { update: denyAll },
      ui: {
        displayMode: "select",
      },
    }),

    status: select({
      access: { update: denyAll },
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
      access: { update: denyAll },
      validation: { isRequired: true },
    }),

    billingCycle: select({
      access: { update: denyAll },
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" },
      ],
      defaultValue: "monthly",
      validation: { isRequired: true },
    }),

    agreementSnapshot: json({ defaultValue: {}, access: { update: denyAll } }),
    agreementHistory: json({ defaultValue: [], access: { update: denyAll } }),
    creditPeriodStart: timestamp({ access: { update: denyAll } }),
    creditPeriodEnd: timestamp({ access: { update: denyAll } }),
    billingEventAt: timestamp({ access: { update: denyAll } }),
    recoveryHistory: json({ defaultValue: [], access: { read: permissions.canManageAllRecords, update: denyAll } }),

    nextBillingDate: timestamp({ access: { update: denyAll } }),

    autoRenew: checkbox({
      access: { update: denyAll },
      defaultValue: true,
    }),

    classCreditsRemaining: integer({
      access: { update: denyAll },
      defaultValue: 0,
      ui: {
        description: "Remaining class credits for current billing period (-1 for unlimited)",
        // The readable "Class credits left" field is shown instead of the raw sentinel.
        itemView: { fieldMode: "hidden" },
      },
    }),

    // Readable balance for lists and the item page: the -1 sentinel reads as "Unlimited".
    classCreditsLeft: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve: (item: any) => creditsLabel(item.classCreditsRemaining),
      }),
      label: "Class credits left",
      ui: { createView: { fieldMode: "hidden" } },
    }),

    freezeStartDate: timestamp({
      access: { update: denyAll },
      ui: {
        description: "Start date of membership freeze",
      },
    }),

    freezeEndDate: timestamp({
      access: { update: denyAll },
      ui: {
        description: "End date of membership freeze",
      },
    }),

    payments: relationship({
      ref: 'MembershipPayment.membership',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: {
        description: "Payment history for this membership",
      },
    }),

    // Stripe integration - only set when membership is linked to Stripe subscription
    stripeSubscriptionId: text({
      access: {
        read: isSignedIn,
        create: permissions.canManageAllRecords,
        update: denyAll,
      },
      isIndexed: 'unique',
      db: { isNullable: true },
      ui: {
        description: "Stripe Subscription ID (only for Stripe-billed memberships)",
      },
    }),

    cancelReason: text({
      access: { update: denyAll },
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation",
      },
    }),

    cancelledAt: timestamp({
      access: { update: denyAll },
      ui: {
        description: "When the membership was cancelled",
      },
    }),

    billingAttempts: relationship({
      ref: "MembershipBillingAttempt.membership",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    // Monotonic membership-wide fence for all provider billing operations.
    // Durable attempt rows carry the matching generation; no generated CRUD
    // path may observe or mutate this internal coordination value.
    billingGeneration: integer({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
});
