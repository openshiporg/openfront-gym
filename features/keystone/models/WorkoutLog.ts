import { list } from '@keystone-6/core';
import { allOperations, denyAll } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  text,
  integer,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const WorkoutLog = list({
  hooks: { validateInput: validateTenantOwnership([
    { field: "member", list: "member", required: true },
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: rules.canReadOwnMemberResource,
      update: rules.canReadOwnMemberResource,
      delete: rules.canReadOwnMemberResource,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'title', 'date', 'duration'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.workoutLogs",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    member: relationship({
      ref: 'Member.workoutLogs',
      ui: {
        displayMode: 'select',
        description: 'Member who performed this workout',
      },
    }),

    date: timestamp({
      defaultValue: { kind: 'now' },
      validation: { isRequired: true },
      ui: {
        description: 'Workout date',
      },
    }),

    title: text({
      ui: {
        description: 'Workout title (e.g., Chest Day, Full Body)',
      },
    }),

    duration: integer({
      ui: {
        description: 'Workout duration in minutes',
      },
    }),

    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Workout notes and observations',
      },
    }),

    workoutSets: relationship({
      ref: 'WorkoutSet.workoutLog',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: {
        description: 'Sets performed in this workout',
      },
    }),

    ...trackingFields,
  },
});
