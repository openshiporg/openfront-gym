import { list } from '@keystone-6/core';
import { relationship, text, json, timestamp, checkbox, integer } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { tenantFilter } from '../access/tenantPolicy';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb } from './tenantRelationships';

// Evidence is changed only by the tenant-checked domain operations, never raw CRUD.
const access = {
  operation: { query: permissions.canManageAllRecords, create: () => false, update: () => false, delete: () => false },
  filter: { query: tenantFilter },
};
const organization = () => relationship({ ref: 'Organization', db: { extendPrismaSchema: requiredRelationshipDb('organization') } });
export const OperationalNotice = list({ access, fields: {
  organization: organization(), member: relationship({ ref: 'Member' }),
  key: text({ isIndexed: 'unique' }), kind: text(), message: text(),
  status: text({ defaultValue: 'pending' }), attempts: integer({ defaultValue: 0 }),
  lastError: text(), resolvedAt: timestamp(), history: json({ defaultValue: [] }), ...trackingFields,
} });
export const ParticipationPolicy = list({ access, fields: {
  organization: organization(), version: text(), documentReference: text(),
  enforceWaiver: checkbox({ defaultValue: true }), adultOnly: checkbox({ defaultValue: true }),
  healthPurpose: text(), retentionDays: integer({ defaultValue: 365 }),
  publishedBy: text(), ...trackingFields,
} });
export const ParticipationEvidence = list({ access, fields: {
  organization: organization(), member: relationship({ ref: 'Member' }),
  policy: relationship({ ref: 'ParticipationPolicy' }), key: text({ isIndexed: 'unique' }), requestHash: text(),
  documentReference: text(), verifiedBy: text(), acceptedAt: timestamp(), expiresAt: timestamp(),
  revokedAt: timestamp(), revocationReason: text(), healthConsent: checkbox({ defaultValue: false }),
  ...trackingFields,
} });
export const OperationsCase = list({ access, fields: {
  organization: organization(), member: relationship({ ref: 'Member' }),
  key: text({ isIndexed: 'unique' }), requestHash: text(), kind: text(), reference: text(), locationId: text(),
  summary: text(), status: text({ defaultValue: 'open' }), assignedTo: text(),
  history: json({ defaultValue: [] }), openedBy: text(), closedAt: timestamp(), ...trackingFields,
} });
export const IntegrationCredential = list({ access, fields: {
  organization: organization(), label: text(), digest: text({ isIndexed: 'unique', access: { read: () => false } }),
  scopes: json({ defaultValue: [] }), partner: text(), revokedAt: timestamp(), expiresAt: timestamp(),
  createdBy: text(), ...trackingFields,
} });
