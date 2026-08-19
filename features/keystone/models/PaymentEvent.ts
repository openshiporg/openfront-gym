import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const PaymentEvent = list({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([paymentProviderId, providerEventId], map: "PaymentEvent_provider_event_key")\n}'
      );
    },
  },
  hooks: { validateInput: validateTenantOwnership([
    { field: "paymentProvider", list: "paymentProvider", required: true },
  ]) },
  access: {
    operation: {
      query: permissions.canManageAllRecords,
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
      initialColumns: ["providerEventId", "eventType", "status", "processedAt"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.paymentEvents",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    providerEventId: text({ validation: { isRequired: true } }),
    eventType: text({ validation: { isRequired: true } }),
    attempts: integer({ defaultValue: 0, access: { read: permissions.canManageAllRecords } }),
    lockedUntil: timestamp({ access: { read: permissions.canManageAllRecords } }),
    status: select({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "processing",
      validation: { isRequired: true },
    }),
    paymentProvider: relationship({ ref: "PaymentProvider.events" }),
    processedAt: timestamp(),
    lastError: text(),
    data: json({ defaultValue: {} }),
    ...trackingFields,
  },
});
