import { list, graphql } from '@keystone-6/core';
import { allOperations, denyAll } from '@keystone-6/core/access';
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
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const Member = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: { validateInput: validateTenantOwnership([
    { field: "user", list: "user" },
    { field: "membershipTier", list: "membershipTier" },
  ]) },
  access: {
    operation: {
      query: isSignedIn, create: permissions.canManagePeople, update: isSignedIn,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadOwnMember,
      update: rules.canReadOwnMember,
      delete: rules.canDeletePeople,
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
    organization: relationship({
      ref: 'Organization.members',
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb('organization') },
      ui: { description: 'Tenant organization for this member' },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: 'Full name of the member',
      },
    }),

    email: text({
      isIndexed: 'unique',
      access: { update: permissions.canManagePeople },
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
      access: { update: permissions.canManagePeople },
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'Date member joined the gym',
      },
    }),

    membershipTier: relationship({
      ref: 'MembershipTier',
      access: { update: denyAll },
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
      access: { update: denyAll },
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
      access: { update: denyAll },
      ui: {
        description: 'Linked user account for authentication',
      },
    }),

    // Relationships to other entities
    bookings: relationship({
      ref: 'ClassBooking.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Class bookings made by this member',
      },
    }),

    // Inverse collections are read-only. Their owning records are changed only
    // through tenant-checked lifecycle operations, never nested parent writes.
    checkIns: relationship({
      ref: 'CheckIn.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Check-in history',
      },
    }),

    payments: relationship({
      ref: 'GymPayment.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Payment history',
      },
    }),

    workoutLogs: relationship({
      ref: 'WorkoutLog.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Workout tracking history',
      },
    }),

    subscriptions: relationship({
      ref: 'Subscription.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Subscription billing history',
      },
    }),

    waitlistEntries: relationship({
      ref: 'Waitlist.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Waitlist entries for full classes',
      },
    }),

    trainerAppointments: relationship({
      ref: 'TrainerAppointment.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: { description: 'One-to-one trainer appointments' },
    }),

    attendanceRecords: relationship({
      ref: 'AttendanceRecord.member',
      access: { create: denyAll, update: denyAll },
      many: true,
      ui: {
        description: 'Class attendance tracking',
      },
    }),

    lifetimeValue: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const payments = await sudoContext.query.GymPayment.findMany({
            where: { member: { id: { equals: item.id.toString() } } },
            query: 'amount refundAmount currencyCode status',
          });

          const settled = payments.filter((payment: any) =>
            ['completed', 'succeeded', 'refunded'].includes(payment.status),
          );
          const currencies = new Set(settled.map((payment: any) => String(payment.currencyCode || 'USD').toUpperCase()));
          if (currencies.size > 1 || (currencies.size === 1 && !currencies.has('USD'))) return null;
          return settled.reduce(
            (sum: number, payment: any) => sum + Math.max((payment.amount || 0) - (payment.refundAmount || 0), 0),
            0,
          ) / 100;
        },
      }),
      ui: { description: 'Net settled lifetime payments in USD; unavailable for mixed/non-USD evidence' },
    }),

    membershipLengthDays: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const joinDate = item.joinDate as Date | null;
          if (!joinDate) return 0;
          const now = new Date();
          const diffTime = now.getTime() - new Date(joinDate).getTime();
          return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        },
      }),
      ui: { description: 'Days since member joined' },
    }),

    attendanceRate: virtual({
      access: { read: rules.canReadOwnMemberField },
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
      access: { read: rules.canReadOwnMemberField },
      field: graphql.field({
        type: graphql.DateTime,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const checkIns = await sudoContext.query.CheckIn.findMany({
            where: {
              member: { id: { equals: item.id.toString() } },
              isGuest: { equals: false },
            },
            orderBy: { checkInTime: 'desc' },
            take: 1,
            query: 'checkInTime',
          });

          const checkInTime = checkIns[0]?.checkInTime;
          return checkInTime ? new Date(checkInTime) : null;
        },
      }),
      ui: { description: 'Last gym check-in timestamp' },
    }),

    currentMembershipTier: virtual({
      access: { read: rules.canReadOwnMemberField },
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
            query: 'user { membership { tier { id name } } } membershipTier { id name }',
          });
          return (member?.user?.membership?.tier as { id: string; name: string } | null)
            || (member?.membershipTier as { id: string; name: string } | null)
            || null;
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
