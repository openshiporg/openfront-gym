import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { requiredRelationshipDb } from "./tenantRelationships";

export const MembershipBillingAttempt = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, membershipId, operation, idempotencyKey], map: "MembershipBillingAttempt_scope_operation_key")\n  @@index([membershipId, status, leaseUntil], map: "MembershipBillingAttempt_membership_status_lease")\n}',
      );
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.membershipBillingAttempts",
      access: { update: denyAll },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    membership: relationship({
      ref: "Membership.billingAttempts",
      access: { update: denyAll },
      db: { extendPrismaSchema: requiredRelationshipDb("membership") },
    }),
    operation: select({
      type: "string",
      options: [
        { label: "Cancel", value: "cancel" },
        { label: "Freeze", value: "freeze" },
        { label: "Unfreeze", value: "unfreeze" },
        { label: "Tier change", value: "tier-change" },
      ],
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    idempotencyKey: text({
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    requestHash: text({
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    claimToken: text({
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    generation: integer({
      defaultValue: 0,
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    status: select({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "processing",
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    leaseUntil: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    lastError: text({
      defaultValue: "",
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    requestedAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    completedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
  },
});
