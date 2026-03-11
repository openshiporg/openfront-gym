import { list, graphql } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  integer,
  select,
  virtual,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const Waitlist = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'classSchedule', 'position', 'status', 'addedAt'],
    },
  },
  fields: {
    member: relationship({
      ref: 'Member.waitlistEntries',
      ui: {
        displayMode: 'select',
        description: 'Member on the waitlist',
      },
    }),

    classSchedule: relationship({
      ref: 'ClassSchedule',
      ui: {
        displayMode: 'select',
        description: 'Class the member is waiting for',
      },
    }),

    position: integer({
      ui: {
        description: 'Position in the waitlist (auto-calculated based on addedAt)',
        itemView: { fieldMode: 'read' },
        createView: { fieldMode: 'hidden' },
      },
    }),

    addedAt: timestamp({
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'When the member joined the waitlist',
      },
    }),

    notifiedAt: timestamp({
      ui: {
        description: 'When the member was notified of an available spot',
      },
    }),

    status: select({
      type: 'string',
      options: [
        { label: 'Waiting', value: 'waiting' },
        { label: 'Notified', value: 'notified' },
        { label: 'Converted', value: 'converted' },
        { label: 'Expired', value: 'expired' },
      ],
      defaultValue: 'waiting',
      validation: { isRequired: true },
      ui: {
        description: 'Waitlist entry status',
      },
    }),

    expiresAt: timestamp({
      ui: {
        description: 'When the notification expires (typically 2 hours after notification)',
      },
    }),

    // Virtual field to calculate estimated wait time
    estimatedWaitTime: virtual({
      field: graphql.field({
        type: graphql.String,
        async resolve(item, args, context) {
          // This is a placeholder - actual implementation would calculate
          // based on class frequency and historical conversion rates
          const position = item.position as number | null;
          if (position && position > 0) {
            const estimatedDays = Math.ceil(position / 2); // Rough estimate
            return `~${estimatedDays} ${estimatedDays === 1 ? 'day' : 'days'}`;
          }
          return 'Unknown';
        },
      }),
      ui: {
        description: 'Estimated wait time based on position',
      },
    }),

    ...trackingFields,
  },
  hooks: {
    // Calculate position automatically based on addedAt timestamp
    async beforeOperation({ operation, resolvedData, context, item }) {
      if (operation === 'create' && resolvedData.classSchedule) {
        // Use sudo context to query waitlist
        const sudoContext = context.sudo();

        // Check for duplicate waitlist entry
        const existingEntry = await sudoContext.query.Waitlist.findMany({
          where: {
            AND: [
              { member: { id: { equals: resolvedData.member.connect.id } } },
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { in: ['waiting', 'notified'] } },
            ],
          },
          query: 'id',
        });

        if (existingEntry && existingEntry.length > 0) {
          throw new Error('Member is already on the waitlist for this class');
        }

        // Calculate position based on existing waitlist entries
        const waitlistCount = await sudoContext.query.Waitlist.count({
          where: {
            AND: [
              { classSchedule: { id: { equals: resolvedData.classSchedule.connect.id } } },
              { status: { equals: 'waiting' } },
            ],
          },
        });

        resolvedData.position = waitlistCount + 1;
      }

      // Update positions when status changes
      if (operation === 'update' && item && resolvedData.status) {
        if (
          (item.status === 'waiting' || item.status === 'notified') &&
          (resolvedData.status === 'converted' || resolvedData.status === 'expired')
        ) {
          // Member is leaving the waitlist - recalculate positions
          const sudoContext = context.sudo();

          const classScheduleId = (item as any).classScheduleId?.toString();
          const currentPosition = (item as any).position;
          const allWaitingEntries = await sudoContext.query.Waitlist.findMany({
            where: {
              AND: [
                { classSchedule: { id: { equals: classScheduleId } } },
                { status: { equals: 'waiting' } },
                { position: { gt: currentPosition } },
              ],
            },
            orderBy: { position: 'asc' },
            query: 'id position',
          });

          // Update positions for entries after this one
          for (const entry of allWaitingEntries) {
            await sudoContext.query.Waitlist.updateOne({
              where: { id: entry.id },
              data: { position: entry.position - 1 },
            });
          }
        }
      }
    },
  },
});
