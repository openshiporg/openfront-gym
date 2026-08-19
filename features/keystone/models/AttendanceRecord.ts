import { list, graphql } from '@keystone-6/core';
import { allOperations, denyAll } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  checkbox,
  text,
  integer,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const AttendanceRecord = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, bookingId") },
  access: {
    operation: {
      query: isSignedIn,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadOwnAttendance,
      update: rules.canReadOwnAttendance,
      delete: rules.canReadOwnAttendance,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'classSchedule', 'attended', 'markedAt', 'lateArrival'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.attendanceRecords",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    booking: relationship({
      ref: 'ClassBooking',
      ui: {
        displayMode: 'select',
        description: 'Associated class booking',
      },
    }),

    classSchedule: relationship({
      ref: 'ClassSchedule',
      ui: {
        displayMode: 'select',
        description: 'Class that was attended',
      },
    }),

    member: relationship({
      ref: 'Member.attendanceRecords',
      ui: {
        displayMode: 'select',
        description: 'Member whose attendance is being tracked',
      },
    }),

    attended: checkbox({
      defaultValue: false,
      ui: {
        description: 'Did the member attend?',
      },
    }),

    markedAt: timestamp({
      ui: {
        description: 'When attendance was marked',
      },
    }),

    markedBy: relationship({
      ref: 'User',
      ui: {
        displayMode: 'select',
        description: 'Staff member who marked attendance',
      },
    }),

    noShowReason: text({
      ui: {
        displayMode: 'textarea',
        description: 'Reason for no-show (if applicable)',
      },
    }),

    lateArrival: checkbox({
      defaultValue: false,
      ui: {
        description: 'Was the member late?',
      },
    }),

    minutesLate: integer({
      ui: {
        description: 'How many minutes late (if lateArrival is true)',
      },
    }),

    // Virtual field for attendance rate per member
    // This would typically be calculated at the Member level, but included here as a reference
    memberAttendanceRate: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          if (!item.memberId) return 0;

          const sudoContext = context.sudo();

          // Get total attendance records for this member
          const totalRecords = await sudoContext.query.AttendanceRecord.count({
            where: { member: { id: { equals: item.memberId.toString() } } },
          });

          if (totalRecords === 0) return 0;

          // Get attended records
          const attendedRecords = await sudoContext.query.AttendanceRecord.count({
            where: {
              AND: [
                { member: { id: { equals: item.memberId.toString() } } },
                { attended: { equals: true } },
              ],
            },
          });

          return (attendedRecords / totalRecords) * 100;
        },
      }),
      ui: {
        description: 'Member attendance rate percentage',
      },
    }),

    ...trackingFields,
  },
  hooks: {
    async validateInput(args: any) {
      await validateTenantOwnership([
        { field: "booking", list: "classBooking" },
        { field: "classSchedule", list: "classSchedule", required: true },
        { field: "member", list: "member", required: true },
        { field: "markedBy", list: "user" },
      ])(args);
    },
    // Automatically create attendance records when class starts
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === 'create') {
        // Set markedAt to now if not provided
        if (!resolvedData.markedAt) {
          resolvedData.markedAt = new Date();
        }
      }
    },
  },
});
