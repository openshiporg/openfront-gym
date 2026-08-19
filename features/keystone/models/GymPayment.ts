import { list, graphql } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import {
  relationship,
  select,
  timestamp,
  integer,
  text,
  json,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { paymentEvidenceHooks } from './paymentEvidence';
import { requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const GymPayment = list({
  hooks: {
    async validateInput(args: any) {
      paymentEvidenceHooks('GymPayment').validateInput(args);
      await validateTenantOwnership([
        { field: "member", list: "member", required: true },
        { field: "subscription", list: "subscription" },
        { field: "paymentProvider", list: "paymentProvider" },
        { field: "paymentSession", list: "paymentSession" },
      ])(args);
    },
    validateDelete: paymentEvidenceHooks('GymPayment').validateDelete,
  },
  access: {
    operation: {
      query: isSignedIn,
      // Payment records are provider/webhook-controlled; refunds use the guarded custom mutation.
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
      initialColumns: ['member', 'amount', 'status', 'paymentDate', 'subscription'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.gymPayments",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    member: relationship({
      ref: 'Member.payments',
      ui: {
        displayMode: 'select',
        description: 'Member who made the payment',
      },
    }),

    subscription: relationship({
      ref: 'Subscription.billingHistory',
      ui: {
        displayMode: 'select',
        description: 'Associated subscription (if recurring payment)',
      },
    }),

    paymentProvider: relationship({
      ref: 'PaymentProvider.payments',
      access: { read: permissions.canManageAllRecords },
    }),

    paymentSession: relationship({
      ref: 'PaymentSession.payments',
      access: { read: permissions.canManageAllRecords },
    }),

    amount: integer({
      validation: { isRequired: true },
      ui: {
        description: 'Payment amount in the currency minor unit',
      },
    }),

    currencyCode: text({
      validation: { isRequired: true },
      defaultValue: 'USD',
      ui: { description: 'ISO 4217 currency code' },
    }),

    status: select({
      type: 'string',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
        { label: 'Refunded', value: 'refunded' },
      ],
      defaultValue: 'pending',
      validation: { isRequired: true },
      ui: {
        description: 'Payment status',
      },
    }),

    paymentDate: timestamp({
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'Date payment was processed',
      },
    }),

    metadata: json({
      access: { read: permissions.canManageAllRecords },
      defaultValue: {},
      ui: {
        views: './fields/json-view',
        description: 'Additional payment data from Stripe/PayPal (stored as JSON)',
      },
    }),

    // Stripe integration fields
    stripePaymentIntentId: text({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: 'Stripe Payment Intent ID',
      },
    }),

    stripeChargeId: text({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      ui: {
        description: 'Stripe Charge ID',
      },
    }),

    stripeInvoiceId: text({
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
      isIndexed: 'unique',
      ui: {
        description: 'Stripe Invoice ID',
      },
    }),

    receiptNumber: text({
      isIndexed: true,
      ui: {
        description: 'Receipt number for this payment',
      },
    }),

    description: text({
      ui: {
        displayMode: 'textarea',
        description: 'Payment description',
      },
    }),

    refundedAt: timestamp({
      ui: {
        description: 'Date payment was refunded',
      },
    }),

    refundAmount: integer({
      ui: {
        description: 'Refund amount in cents',
      },
    }),

    refundReason: text({
      ui: {
        description: 'Operator-supplied reason for the refund',
      },
    }),

    refundLockUntil: timestamp({ access: { read: permissions.canManageAllRecords } }),
    refundLockToken: text({ access: { read: permissions.canManageAllRecords } }),

    // Virtual field for payment link to Stripe Dashboard
    paymentLink: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          if (item.stripePaymentIntentId) {
            return `https://dashboard.stripe.com/payments/${item.stripePaymentIntentId}`;
          }
          return null;
        },
      }),
      ui: {
        description: 'Link to payment in Stripe Dashboard',
      },
    }),

    refundAttempts: relationship({
      ref: "GymRefundAttempt.payment",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    ...trackingFields,
  },
});
