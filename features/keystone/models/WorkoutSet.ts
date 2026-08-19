import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  integer,
  text,
  float,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions, rules } from '../access';
import { trackingFields } from './trackingFields';
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const WorkoutSet = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, workoutLogId, exerciseId, setNumber") },
  hooks: { validateInput: validateTenantOwnership([
    { field: "workoutLog", list: "workoutLog", required: true },
    { field: "exercise", list: "exercise", required: true },
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: rules.canReadOwnWorkoutSet,
      update: rules.canReadOwnWorkoutSet,
      delete: rules.canReadOwnWorkoutSet,
    },
  },
  ui: {
    listView: {
      initialColumns: ['workoutLog', 'exercise', 'setNumber', 'reps', 'weight'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.workoutSets",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    workoutLog: relationship({
      ref: 'WorkoutLog.workoutSets',
      ui: {
        displayMode: 'select',
        description: 'Workout log this set belongs to',
      },
    }),

    exercise: relationship({
      ref: 'Exercise',
      ui: {
        displayMode: 'select',
        description: 'Exercise performed',
      },
    }),

    setNumber: integer({
      validation: { isRequired: true },
      ui: {
        description: 'Set number in the workout',
      },
    }),

    reps: integer({
      ui: {
        description: 'Number of repetitions',
      },
    }),

    weight: float({
      ui: {
        description: 'Weight used (in pounds or kg)',
      },
    }),

    duration: integer({
      ui: {
        description: 'Duration in seconds (for timed exercises)',
      },
    }),

    restTime: integer({
      ui: {
        description: 'Rest time after this set (in seconds)',
      },
    }),

    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Notes about this set (form, difficulty, etc.)',
      },
    }),

    ...trackingFields,
  },
});
