import { list, graphql } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  checkbox,
  text,
  integer,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const AttendanceRecord = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'classSchedule', 'attended', 'markedAt', 'lateArrival'],
    },
  },
  fields: {
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
    // Automatically create attendance records when class starts
    async beforeOperation({ operation, resolvedData, context }) {
      if (operation === 'create') {
        // Set markedAt to now if not provided
        if (!resolvedData.markedAt) {
          resolvedData.markedAt = new Date();
        }

        // If attended is true and markedAt is set, ensure markedBy is set
        // (This would typically be set from session, but left as placeholder)
      }
    },
  },
});
