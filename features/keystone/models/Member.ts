import { list, graphql } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  text,
  relationship,
  select,
  timestamp,
  json,
  image,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';

export const Member = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople,
    },
  },
  ui: {
    hideDelete: args => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ['name', 'email', 'membershipTier', 'status', 'joinDate'],
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        // canEditOtherPeople can edit other people
        if (session?.data.role?.canEditOtherPeople) return 'edit';

        // Members can edit their own profile
        if (session?.data.member?.id === item?.id) return 'edit';

        // else, default all fields to read mode
        return 'read';
      },
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      ui: {
        description: 'Full name of the member',
      },
    }),

    email: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
      ui: {
        description: 'Member email address',
      },
    }),

    phone: text({
      ui: {
        description: 'Primary phone number',
      },
    }),

    dateOfBirth: timestamp({
      ui: {
        description: 'Date of birth for age verification and birthday promotions',
      },
    }),

    joinDate: timestamp({
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'Date member joined the gym',
      },
    }),

    membershipTier: relationship({
      ref: 'MembershipTier',
      ui: {
        displayMode: 'select',
        description: 'Current membership plan',
      },
    }),

    emergencyContactName: text({
      ui: {
        description: 'Emergency contact full name',
      },
    }),

    emergencyContactPhone: text({
      ui: {
        description: 'Emergency contact phone number',
      },
    }),

    healthNotes: json({
      ui: {
        views: './fields/json-view',
        description: 'Medical conditions, injuries, or health considerations (stored as JSON)',
      },
      defaultValue: { conditions: [], injuries: [], notes: '' },
    }),

    profilePhoto: image({
      storage: 'my_images',
    }),

    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
      ui: {
        description: 'Member account status',
      },
    }),

    // Relationship to User for authentication
    user: relationship({
      ref: 'User',
      ui: {
        description: 'Linked user account for authentication',
      },
    }),

    // Relationships to other entities
    bookings: relationship({
      ref: 'ClassBooking.member',
      many: true,
      ui: {
        description: 'Class bookings made by this member',
      },
    }),

    // NOTE: Uncomment these as the models are created
    checkIns: relationship({
      ref: 'CheckIn.member',
      many: true,
      ui: {
        description: 'Check-in history',
      },
    }),

    payments: relationship({
      ref: 'GymPayment.member',
      many: true,
      ui: {
        description: 'Payment history',
      },
    }),

    workoutLogs: relationship({
      ref: 'WorkoutLog.member',
      many: true,
      ui: {
        description: 'Workout tracking history',
      },
    }),

    subscriptions: relationship({
      ref: 'Subscription.member',
      many: true,
      ui: {
        description: 'Subscription billing history',
      },
    }),

    waitlistEntries: relationship({
      ref: 'Waitlist.member',
      many: true,
      ui: {
        description: 'Waitlist entries for full classes',
      },
    }),

    attendanceRecords: relationship({
      ref: 'AttendanceRecord.member',
      many: true,
      ui: {
        description: 'Class attendance tracking',
      },
    }),

    lifetimeValue: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const payments = await sudoContext.query.GymPayment.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            query: 'amount status',
          });

          return payments
            .filter((p: any) => p.status === 'completed' || p.status === 'succeeded')
            .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) / 100;
        },
      }),
      ui: { description: 'Total lifetime payments in dollars' },
    }),

    membershipLengthDays: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const joinDate = item.joinDate as Date | null;
          if (!joinDate) return 0;
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - new Date(joinDate).getTime());
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        },
      }),
      ui: { description: 'Days since member joined' },
    }),

    attendanceRate: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.id.toString() } } },
          });

          if (totalRecords === 0) return 0;

          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.id.toString() } } },
                { attended: { equals: true } },
              ],
            },
          });

          return Math.round((attendedRecords / totalRecords) * 100);
        },
      }),
      ui: { description: 'Class attendance rate percentage' },
    }),

    lastCheckIn: virtual({
      field: graphql.field({
        type: graphql.DateTime,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const checkIns = await sudoContext.query.CheckIn.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            orderBy: { checkInTime: 'desc' },
            take: 1,
            query: 'checkInTime',
          });

          return checkIns[0]?.checkInTime || null;
        },
      }),
      ui: { description: 'Last gym check-in timestamp' },
    }),

    currentMembershipTier: virtual({
      field: graphql.field({
        type: graphql.object<{ id: string; name: string }>()({
          name: 'MemberCurrentTier',
          fields: {
            id: graphql.field({
              type: graphql.ID,
              resolve: (source) => source.id,
            }),
            name: graphql.field({
              type: graphql.String,
              resolve: (source) => source.name,
            }),
          },
        }),
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const member = await sudoContext.query.Member.findOne({
            where: { id: item.id.toString() },
            query: 'membershipTier { id name }',
          });
          return (member?.membershipTier as { id: string; name: string } | null) || null;
        },
      }),
      ui: {
        description: 'Current membership tier details',
        query: `{
          id
          name
        }`,
      },
    }),

    ...trackingFields,
  },
});
