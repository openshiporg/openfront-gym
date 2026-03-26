import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  select,
  checkbox,
  text,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const CheckIn = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'checkInTime', 'checkOutTime', 'method', 'membershipValidated'],
    },
  },
  fields: {
    member: relationship({
      ref: 'Member.checkIns',
      ui: {
        displayMode: 'select',
        description: 'Member checking in',
      },
    }),

    checkInTime: timestamp({
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'Check-in timestamp',
      },
    }),

    checkOutTime: timestamp({
      ui: {
        description: 'Check-out timestamp (optional)',
      },
    }),

    location: relationship({
      ref: 'Location',
      ui: {
        displayMode: 'select',
        description: 'Gym location where check-in occurred',
      },
    }),

    method: select({
      type: 'string',
      options: [
        { label: 'QR Code', value: 'qr_code' },
        { label: 'RFID', value: 'rfid' },
        { label: 'Manual', value: 'manual' },
        { label: 'App', value: 'app' },
      ],
      defaultValue: 'app',
      validation: { isRequired: true },
      ui: {
        description: 'Check-in method used',
      },
    }),

    isGuest: checkbox({
      defaultValue: false,
      ui: {
        description: 'Is this a guest check-in?',
      },
    }),

    guestName: text({
      ui: {
        description: 'Guest name (if isGuest is true)',
      },
    }),

    membershipValidated: checkbox({
      defaultValue: false,
      ui: {
        description: 'Has membership status been validated?',
      },
    }),

    validationNotes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Notes from validation (e.g., membership expired, special access)',
      },
    }),

    ...trackingFields,
  },
  hooks: {
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === 'create' && resolvedData.member) {
        const sudoContext = context.sudo();

        const member = await sudoContext.query.Member.findOne({
          where: { id: resolvedData.member.connect.id },
          query: `
            id
            status
            user {
              id
              membership {
                id
                status
              }
            }
            subscriptions(where: { status: { equals: "active" } }) {
              id
              status
            }
          `,
        });

        if (!member) {
          throw new Error('Member not found');
        }

        if (member.status !== 'active') {
          throw new Error(`Cannot check in: Member status is ${member.status}`);
        }

        const hasActiveMembership = member.user?.membership?.status === 'active';
        const hasActiveSubscription = !!member.subscriptions?.length;

        if (!hasActiveMembership && !hasActiveSubscription) {
          throw new Error('Cannot check in: No active membership or subscription found');
        }

        resolvedData.membershipValidated = true;
      }
    },
  },
});
