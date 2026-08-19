import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import {
  integer,
  relationship,
  select,
  timestamp,
  text,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const Subscription = list({
  access: {
    operation: {
      query: isSignedIn,
      // Subscription state is synchronized from the payment provider.
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'membershipTier', 'status', 'startDate', 'nextBillingDate'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.subscriptions",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
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
      access: { create: denyAll, update: denyAll },
      ui: {
        description: 'Payment history for this subscription',
      },
    }),

    // Stripe integration - required because Subscription records are only created from Stripe webhooks
    stripeSubscriptionId: text({
      access: { read: permissions.canManageAllRecords },
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: {
        description: 'Stripe Subscription ID for automatic billing',
      },
    }),

    stripeCustomerId: text({
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: 'Stripe Customer ID',
      },
    }),

    // Signed Stripe subscription events are reconciled under a subscription
    // lock. These internal fields are the durable event high-water mark.
    providerEventCreated: integer({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    providerEventId: text({
      defaultValue: '',
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "member", list: "member", required: true },
      { field: "membershipTier", list: "membershipTier", required: true },
      { field: "paymentMethod", list: "paymentMethod" },
    ]),
    // Automatic billing remains adapter-owned; this hook only enforces tenancy.
  },
});
