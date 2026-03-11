import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  select,
  timestamp,
  text,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const Subscription = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'membershipTier', 'status', 'startDate', 'nextBillingDate'],
    },
  },
  fields: {
    member: relationship({
      ref: 'Member.subscriptions',
      ui: {
        displayMode: 'select',
        description: 'Member who owns this subscription',
      },
    }),

    membershipTier: relationship({
      ref: 'MembershipTier',
      ui: {
        displayMode: 'select',
        description: 'Membership tier for this subscription',
      },
    }),

    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Past Due', value: 'past_due' },
        { label: 'Paused', value: 'paused' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
      ui: {
        description: 'Current subscription status',
      },
    }),

    startDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: 'now' },
      ui: {
        description: 'Subscription start date',
      },
    }),

    nextBillingDate: timestamp({
      ui: {
        description: 'Next scheduled billing date',
      },
    }),

    cancelledAt: timestamp({
      ui: {
        description: 'Date subscription was cancelled',
      },
    }),

    pausedAt: timestamp({
      ui: {
        description: 'Date subscription was paused',
      },
    }),

    paymentMethod: relationship({
      ref: 'PaymentMethod.subscriptions',
      ui: {
        displayMode: 'select',
        description: 'Payment method used for billing',
      },
    }),

    billingHistory: relationship({
      ref: 'GymPayment.subscription',
      many: true,
      ui: {
        description: 'Payment history for this subscription',
      },
    }),

    // Stripe integration - required because Subscription records are only created from Stripe webhooks
    stripeSubscriptionId: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: {
        description: 'Stripe Subscription ID for automatic billing',
      },
    }),

    stripeCustomerId: text({
      ui: {
        description: 'Stripe Customer ID',
      },
    }),

    ...trackingFields,
  },
  hooks: {
    // TODO: Add beforeOperation hook for automatic billing logic
    // This will be implemented when integrating with Stripe webhooks
  },
});
