import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  relationship,
  integer,
  text,
  float,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const WorkoutSet = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['workoutLog', 'exercise', 'setNumber', 'reps', 'weight'],
    },
  },
  fields: {
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
