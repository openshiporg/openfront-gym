import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { requiredRelationshipDb } from "./tenantRelationships";

export const GymRefundAttempt = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(/\n}/, '\n  @@unique([organizationId, requestKey], map: "GymRefundAttempt_organization_request_key")\n}');
    },
  },
  fields: {
    organization: relationship({ ref: "Organization.refundAttempts", access: { update: denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    payment: relationship({ ref: "GymPayment.refundAttempts", access: { update: denyAll }, db: { extendPrismaSchema: requiredRelationshipDb("payment") } }),
    requestKey: text({ validation: { isRequired: true }, access: { read: denyAll, create: denyAll, update: denyAll } }),
    claimToken: text({ defaultValue: "", access: { read: denyAll, create: denyAll, update: denyAll } }),
    amount: integer({ validation: { isRequired: true }, access: { read: denyAll, create: denyAll, update: denyAll } }),
    startingRefundAmount: integer({ defaultValue: 0, validation: { isRequired: true }, access: { read: denyAll, create: denyAll, update: denyAll } }),
    status: select({ type: "string", options: [{ label: "Processing", value: "processing" }, { label: "Succeeded", value: "succeeded" }, { label: "Failed", value: "failed" }], defaultValue: "processing", access: { read: denyAll, create: denyAll, update: denyAll } }),
    providerRefundId: text({ defaultValue: "", access: { read: denyAll, create: denyAll, update: denyAll } }),
    lastError: text({ defaultValue: "", access: { read: denyAll, create: denyAll, update: denyAll } }),
    requestedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    completedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
  },
});
