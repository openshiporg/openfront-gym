import { list } from '@keystone-6/core';
import { allOperations, denyAll } from '@keystone-6/core/access';
import {
  text,
  checkbox,
  relationship,
} from '@keystone-6/core/fields';

import { isSignedIn, permissions } from '../access';
import { tenantFilter, tenantItemAccess } from '../access/tenantPolicy';
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from './tenantRelationships';

const tenantItem = (args: any) => tenantItemAccess(args);
import { trackingFields } from './trackingFields';

export const Location = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: { query: tenantFilter },
    item: { update: tenantItem, delete: tenantItem },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'address', 'isActive'],
    },
  },
  fields: {
    organization: relationship({
      ref: 'Organization.locations',
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb('organization') },
      ui: { description: 'Tenant organization for this location' },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: 'Location name (e.g., Downtown Gym, West Side Branch)',
      },
    }),

    address: text({
      ui: {
        displayMode: 'textarea',
        description: 'Physical address of the location',
      },
    }),

    phone: text({
      ui: {
        description: 'Location phone number',
      },
    }),

    isActive: checkbox({
      defaultValue: true,
      ui: {
        description: 'Is this location currently active?',
      },
    }),

    resources: relationship({
      ref: 'GymResource.location', many: true,
      access: { create: denyAll, update: denyAll },
    }),
    trainerAvailability: relationship({
      ref: 'TrainerAvailability.location', many: true,
      access: { create: denyAll, update: denyAll },
    }),
    trainerAppointments: relationship({
      ref: 'TrainerAppointment.location', many: true,
      access: { create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
});
