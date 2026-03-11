import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  select,
  text,
  checkbox,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const PaymentMethod = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'type', 'brand', 'last4', 'isDefault'],
    },
  },
  fields: {
    member: relationship({
      ref: 'Member',
      ui: {
        displayMode: 'select',
        description: 'Member who owns this payment method',
      },
    }),

    type: select({
      type: 'string',
      options: [
        { label: 'Card', value: 'card' },
        { label: 'Bank Account', value: 'bank' },
      ],
      defaultValue: 'card',
      validation: { isRequired: true },
      ui: {
        description: 'Payment method type',
      },
    }),

    last4: text({
      validation: { isRequired: true },
      ui: {
        description: 'Last 4 digits of card/account number',
      },
    }),

    brand: text({
      ui: {
        description: 'Card brand (Visa, Mastercard, etc.) or bank name',
      },
    }),

    isDefault: checkbox({
      defaultValue: false,
      ui: {
        description: 'Is this the default payment method?',
      },
    }),

    // Stripe integration - required because PaymentMethod records are only created from Stripe
    stripePaymentMethodId: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: {
        description: 'Stripe Payment Method ID',
      },
    }),

    expiryMonth: text({
      ui: {
        description: 'Card expiry month (for cards)',
      },
    }),

    expiryYear: text({
      ui: {
        description: 'Card expiry year (for cards)',
      },
    }),

    subscriptions: relationship({
      ref: 'Subscription.paymentMethod',
      many: true,
      ui: {
        description: 'Subscriptions using this payment method',
      },
    }),

    ...trackingFields,
  },
});
