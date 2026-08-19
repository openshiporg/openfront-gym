import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  text,
  select,
  json,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions } from '../access';
import { tenantFilter } from '../access/tenantPolicy';
import { trackingFields } from './trackingFields';
import { relationship } from '@keystone-6/core/fields';
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

export const Exercise = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'category', 'equipment'],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.exercises",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: 'Exercise name (e.g., Bench Press, Squats)',
      },
    }),

    category: select({
      type: 'string',
      options: [
        { label: 'Strength', value: 'strength' },
        { label: 'Cardio', value: 'cardio' },
        { label: 'Flexibility', value: 'flexibility' },
        { label: 'Balance', value: 'balance' },
        { label: 'Functional', value: 'functional' },
      ],
      validation: { isRequired: true },
      ui: {
        description: 'Exercise category',
      },
    }),

    muscleGroup: json({
      defaultValue: [],
      ui: {
        views: './fields/json-view',
        description: 'Target muscle groups (stored as JSON array)',
      },
    }),

    equipment: text({
      ui: {
        description: 'Equipment needed (e.g., Barbell, Dumbbells, None)',
      },
    }),

    description: text({
      ui: {
        displayMode: 'textarea',
        description: 'Exercise description and proper form instructions',
      },
    }),

    videoUrl: text({
      ui: {
        description: 'URL to demonstration video',
      },
    }),

    difficulty: select({
      type: 'string',
      options: [
        { label: 'Beginner', value: 'beginner' },
        { label: 'Intermediate', value: 'intermediate' },
        { label: 'Advanced', value: 'advanced' },
      ],
      defaultValue: 'beginner',
      ui: {
        description: 'Exercise difficulty level',
      },
    }),

    ...trackingFields,
  },
});
