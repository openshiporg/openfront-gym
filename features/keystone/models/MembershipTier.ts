import { list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  integer,
  float,
  checkbox,
  select,
  json,
  relationship,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn, permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

const validateMembershipTierTenant = validateTenantOwnership([]);

export async function validateMembershipTierInput(args: any) {
  await validateMembershipTierTenant(args);
  const value = (field: string) =>
    args.resolvedData[field] === undefined ? args.item?.[field] : args.resolvedData[field];
  const monthlyPrice = Number(value("monthlyPrice"));
  const annualPrice = Number(value("annualPrice"));
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(annualPrice) || annualPrice < 0) {
    args.addValidationError("Membership prices must be non-negative numbers");
  }
  const credits = Number(value("classCreditsPerMonth"));
  if (!Number.isInteger(credits) || credits < -1) {
    args.addValidationError("Class credits must be -1 for unlimited or a non-negative whole number");
  }
  const monthlyPriceId = String(value("stripeMonthlyPriceId") || "").trim();
  const annualPriceId = String(value("stripeAnnualPriceId") || "").trim();
  const productId = String(value("stripeProductId") || "").trim();
  if (monthlyPriceId && !/^price_[A-Za-z0-9]+$/.test(monthlyPriceId)) {
    args.addValidationError("Monthly Stripe Price ID is invalid");
  }
  if (annualPriceId && !/^price_[A-Za-z0-9]+$/.test(annualPriceId)) {
    args.addValidationError("Annual Stripe Price ID is invalid");
  }
  if (productId && !/^prod_[A-Za-z0-9]+$/.test(productId)) {
    args.addValidationError("Stripe Product ID is invalid");
  }
  if ((monthlyPriceId || annualPriceId) && !productId) {
    args.addValidationError("A Stripe Product ID is required with checkout Price IDs");
  }
}

export const MembershipTier = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateMembershipTierInput },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter },
  },
  ui: {
    listView: {
      initialColumns: ["name", "monthlyPrice", "annualPrice", "classCreditsPerMonth"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.membershipTiers",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Basic, Premium, Unlimited",
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    monthlyPrice: float({
      validation: { isRequired: true },
      ui: {
        description: "Monthly subscription price",
      },
    }),

    annualPrice: float({
      validation: { isRequired: true },
      ui: {
        description: "Annual subscription price (with discount)",
      },
    }),

    classCreditsPerMonth: integer({
      validation: { isRequired: true },
      defaultValue: 0,
      ui: {
        description: "Number of class credits per month (-1 for unlimited)",
      },
    }),

    accessHours: text({
      defaultValue: "limited",
      ui: {
        description: "e.g., '24/7' or 'limited' (6am-10pm)",
      },
    }),

    guestPasses: integer({
      defaultValue: 0,
      ui: {
        description: "Number of guest passes per month",
      },
    }),

    personalTrainingSessions: integer({
      defaultValue: 0,
      ui: {
        description: "Number of personal training sessions included",
      },
    }),

    freezeAllowed: checkbox({
      defaultValue: false,
      ui: {
        description: "Can member freeze their membership?",
      },
    }),

    contractLength: integer({
      defaultValue: 0,
      ui: {
        description: "Contract length in months (0 for month-to-month)",
      },
    }),

    // Stripe integration
    stripeMonthlyPriceId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for monthly billing",
      },
    }),

    stripeAnnualPriceId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for annual billing",
      },
    }),

    stripeProductId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Product ID",
      },
    }),

    // Additional fields from todo requirements
    price: integer({
      ui: {
        description: "Base price in cents (for backward compatibility)",
      },
    }),

    billingInterval: select({
      type: 'string',
      options: [
        { label: 'Monthly', value: 'monthly' },
        { label: 'Quarterly', value: 'quarterly' },
        { label: 'Annual', value: 'annual' },
      ],
      defaultValue: 'monthly',
      ui: {
        description: 'Default billing interval for this tier',
      },
    }),

    features: json({
      defaultValue: [],
      ui: {
        views: './fields/json-view',
        description: 'List of features included in this tier (stored as JSON array)',
      },
    }),

    maxClassBookings: integer({
      defaultValue: 0,
      ui: {
        description: 'Maximum number of concurrent class bookings allowed (0 = unlimited)',
      },
    }),

    hasGuestPrivileges: checkbox({
      defaultValue: false,
      ui: {
        description: 'Can members bring guests?',
      },
    }),

    accessHoursJson: json({
      defaultValue: { type: 'limited', hours: '6am-10pm' },
      ui: {
        views: './fields/json-view',
        description: 'Access hours configuration (stored as JSON)',
      },
    }),

    paymentSessions: relationship({
      ref: 'PaymentSession.membershipTier',
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
});
