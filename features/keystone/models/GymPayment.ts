import { list, graphql } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  select,
  timestamp,
  integer,
  text,
  json,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const GymPayment = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'amount', 'status', 'paymentDate', 'subscription'],
    },
  },
  fields: {
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

    amount: integer({
      validation: { isRequired: true },
      ui: {
        description: 'Payment amount in cents',
      },
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
      defaultValue: {},
      ui: {
        views: './fields/json-view',
        description: 'Additional payment data from Stripe/PayPal (stored as JSON)',
      },
    }),

    // Stripe integration fields
    stripePaymentIntentId: text({
      ui: {
        description: 'Stripe Payment Intent ID',
      },
    }),

    stripeChargeId: text({
      ui: {
        description: 'Stripe Charge ID',
      },
    }),

    stripeInvoiceId: text({
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

    // Virtual field for payment link to Stripe Dashboard
    paymentLink: virtual({
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

    ...trackingFields,
  },
});
