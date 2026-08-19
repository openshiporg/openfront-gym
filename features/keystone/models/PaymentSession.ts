import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";

import { isSignedIn, permissions, rules } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const PaymentSession = list({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, idempotencyKey], map: "PaymentSession_organization_idempotency_key")\n}'
      );
    },
  },
  hooks: { validateInput: validateTenantOwnership([
    { field: "user", list: "user", required: true },
    { field: "membershipTier", list: "membershipTier", required: true },
    { field: "paymentProvider", list: "paymentProvider", required: true },
  ]) },
  access: {
    operation: {
      query: isSignedIn,
      // Checkout sessions are created and advanced only by the guarded payment workflow.
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadOwnPaymentSession,
      update: rules.canReadOwnPaymentSession,
      delete: rules.canReadOwnPaymentSession,
    },
  },
  ui: {
    listView: {
      initialColumns: ["user", "paymentProvider", "status", "amount", "currencyCode", "expiresAt"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.paymentSessions",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    user: relationship({ ref: "User.paymentSessions" }),
    membershipTier: relationship({ ref: "MembershipTier.paymentSessions" }),
    paymentProvider: relationship({ ref: "PaymentProvider.sessions" }),
    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Requires Action", value: "requires_action" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
        { label: "Expired", value: "expired" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
    }),
    billingCycle: select({
      type: "string",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Annual", value: "annual" },
      ],
      validation: { isRequired: true },
    }),
    amount: integer({
      validation: { isRequired: true },
      ui: { description: "Backend-authoritative amount in the currency's minor unit." },
    }),
    currencyCode: text({ validation: { isRequired: true }, defaultValue: "USD" }),
    idempotencyKey: text({ isIndexed: true, validation: { isRequired: true } }),
    providerSessionId: text({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
    }),
    providerCustomerId: text({ access: { read: permissions.canManageAllRecords } }),
    providerSubscriptionId: text({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { read: permissions.canManageAllRecords },
    }),
    checkoutUrl: text({
      db: { isNullable: true },
      access: { read: rules.canReadOwnPaymentSessionField },
    }),
    data: json({
      defaultValue: {},
      access: { read: permissions.canManageAllRecords },
    }),
    expiresAt: timestamp(),
    completedAt: timestamp(),
    failedAt: timestamp(),
    cancelledAt: timestamp(),
    lastError: text({ access: { read: permissions.canManageAllRecords } }),
    provisioningLockedUntil: timestamp({ access: { read: permissions.canManageAllRecords } }),
    payments: relationship({
      ref: "GymPayment.paymentSession",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    ...trackingFields,
  },
});
