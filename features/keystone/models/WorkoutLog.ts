import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  timestamp,
  text,
  integer,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const WorkoutLog = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['member', 'title', 'date', 'duration'],
    },
  },
  fields: {
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
      ui: {
        description: 'Sets performed in this workout',
      },
    }),

    ...trackingFields,
  },
});
