import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
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

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const MembershipTier = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "monthlyPrice", "annualPrice", "classCreditsPerMonth"],
    },
  },
  fields: {
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
      ui: {
        description: "Stripe Price ID for monthly billing",
      },
    }),

    stripeAnnualPriceId: text({
      ui: {
        description: "Stripe Price ID for annual billing",
      },
    }),

    stripeProductId: text({
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

    ...trackingFields,
  },
});
