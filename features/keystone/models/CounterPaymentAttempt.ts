import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";
import { trackingFields } from "./trackingFields";

/**
 * Durable staffed-counter card operation (retail sale, training package, or their refunds).
 * The frozen quote, held stock or reserved credits and the provider identity are committed
 * before the provider is called, so a paid checkout or an issued refund is always either
 * fulfilled from the accepted terms or left as an actionable exception. Only the counter
 * payment services write it; the retail and training workspaces project it to staff.
 */
export const CounterPaymentAttempt = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    location: relationship({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } }),
    purpose: select({
      type: "string",
      options: [
        { label: "Retail sale", value: "retail_sale" },
        { label: "Training package sale", value: "training_sale" },
        { label: "Retail refund", value: "retail_refund" },
        { label: "Training package refund", value: "training_refund" },
        { label: "Unfulfilled payment refund", value: "exception_refund" },
      ],
      validation: { isRequired: true },
    }),
    requestKey: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    status: select({
      type: "string",
      options: [
        { label: "Reserved", value: "reserved" },
        { label: "Awaiting card payment", value: "open" },
        { label: "Fulfilled", value: "fulfilled" },
        { label: "Paid, needs staff action", value: "exception" },
        { label: "Paid, being refunded", value: "compensating" },
        { label: "Released", value: "released" },
        { label: "Refund in progress", value: "refund_pending" },
        { label: "Refunded", value: "refunded" },
        { label: "Refund failed", value: "refund_failed" },
      ],
      defaultValue: "reserved",
      validation: { isRequired: true },
    }),
    amount: integer({ validation: { isRequired: true, min: 0 } }),
    currencyCode: text({ defaultValue: "USD" }),
    // Accepted lines/terms, captured when the attempt is reserved and never re-derived.
    quote: json({ defaultValue: {} }),
    providerId: text({ defaultValue: "" }),
    providerKey: text({ defaultValue: "" }),
    providerCheckoutId: text({ defaultValue: "" }),
    providerPaymentId: text({ defaultValue: "" }),
    providerRefundId: text({ defaultValue: "" }),
    claimToken: text({ defaultValue: "" }),
    result: json({ defaultValue: {} }),
    lastError: text({ defaultValue: "" }),
    expiresAt: timestamp(),
    resolvedAt: timestamp(),
    recordedBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
