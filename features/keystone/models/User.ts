import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, password, relationship, text, timestamp, select } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import type { Session } from '../access'
import { trackingFields } from './trackingFields'

export const User = list({
  access: {
    operation: {
      query: () => true,
      create: (args) => {
        // Allow public sign-ups if environment variable is set to true
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === 'true') {
          return true;
        }
        // Otherwise, require canManagePeople permission
        return permissions.canManagePeople(args);
      },
      update: isSignedIn,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManagePeople(args),
    hideDelete: args => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ['name', 'email', 'role', 'membership'],
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        // canEditOtherPeople can edit other people
        if (session?.data.role?.canEditOtherPeople) return 'edit'

        // edit themselves
        if (session?.itemId === item?.id) return 'edit'

        // else, default all fields to read mode
        return 'read'
      },
    },
  },
  fields: {
    name: text({
      validation: {
        isRequired: true,
      },
    }),
    email: text({
      isFilterable: false,
      isOrderable: false,
      isIndexed: 'unique',
      validation: {
        isRequired: true,
      },
    }),
    password: password({
      access: {
        read: denyAll,
        update: ({ session, item }) =>
          permissions.canManagePeople({ session }) || session?.itemId === item.id,
      },
      validation: { isRequired: true },
    }),
    role: relationship({
      ref: 'Role.assignedTo',
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople,
      },
      ui: {
        itemView: {
          fieldMode: args => (permissions.canManagePeople(args) ? 'edit' : 'read'),
        },
      },
    }),

    // Gym-specific relationships
    membership: relationship({
      ref: 'Membership.member',
      many: false,
    }),

    // NOTE: ClassBooking now references Member model instead of User
    // classBookings: relationship({
    //   ref: 'ClassBooking.member',
    //   many: true,
    // }),

    payments: relationship({
      ref: 'MembershipPayment.member',
      many: true,
    }),

    // Stripe integration
    stripeCustomerId: text({
      ui: {
        description: "Stripe Customer ID",
      },
    }),

    phone: text({
      ui: {
        description: "Member phone number",
      },
    }),

    emergencyContact: text({
      ui: {
        description: "Emergency contact name and phone",
      },
    }),

    onboardingStatus: select({
      type: 'string',
      options: [
        { label: 'Not Started', value: 'not_started' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dismissed', value: 'dismissed' },
      ],
      defaultValue: 'not_started',
      validation: { isRequired: true },
      ui: {
        description: 'Tracks dashboard onboarding state for this user',
      },
    }),

    ...trackingFields,
  },
});
