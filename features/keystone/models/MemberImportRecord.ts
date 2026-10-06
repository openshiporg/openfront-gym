import { list } from '@keystone-6/core';
import { denyAll } from '@keystone-6/core/access';
import { relationship, text, select, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { tenantFilter } from '../access/tenantPolicy';
import { trackingFields } from './trackingFields';
import { validateTenantOwnership, requiredRelationshipDb } from './tenantRelationships';

export const MemberImportRecord = list({
  access: { operation: { query: permissions.canManagePeople, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: tenantFilter } },
  hooks: { validateInput: validateTenantOwnership([{ field: 'member', list: 'member' }]) },
  fields: {
    organization: relationship({ ref: 'Organization', access: { update: denyAll }, db: { extendPrismaSchema: requiredRelationshipDb('organization') } }),
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    source: text({ validation: { isRequired: true } }),
    externalId: text({ validation: { isRequired: true } }),
    payloadHash: text({ validation: { isRequired: true } }),
    status: select({ options: ['processing', 'completed', 'failed'], defaultValue: 'processing' }),
    member: relationship({ ref: 'Member' }),
    lastError: text(),
    completedAt: timestamp(),
    ...trackingFields,
  },
});
