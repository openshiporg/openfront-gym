import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";
import { trackingFields } from "./trackingFields";

/**
 * The exact request a person submitted from a dashboard or account form, recorded before it is
 * sent: who sent it, in which organization, for which operation and record, under which key, with
 * which values. A lost or failed response is retried from this record (never from the URL or the
 * browser), so the retry is the same request; only that person can read it back. Values are
 * cleared once the request is confirmed or discarded. Only the intent resolvers write it.
 */
export const StaffIntent = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  ui: { isHidden: true },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    actor: relationship({ ref: "User" }),
    workspace: text({ validation: { isRequired: true } }),
    operation: text({ validation: { isRequired: true } }),
    scope: text(),
    requestKey: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    // Submitted form values, exactly as sent; private to the actor and cleared on resolution.
    form: json({ defaultValue: {} }),
    status: select({
      type: "string",
      options: [
        { label: "Not confirmed", value: "pending" },
        { label: "Confirmed", value: "succeeded" },
        { label: "Discarded", value: "abandoned" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
    }),
    // What the operation returned when it was confirmed (ids only), for an exact replay.
    result: json({ defaultValue: {} }),
    lastError: text(),
    expiresAt: timestamp(),
    resolvedAt: timestamp(),
    ...trackingFields,
  },
});
