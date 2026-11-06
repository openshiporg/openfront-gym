import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { requiredRelationshipDb } from "./tenantRelationships";
import { trackingFields } from "./trackingFields";

/**
 * Stored-value gift card (Mindbody / Square). Issued only after Stripe confirms the online purchase;
 * the balance changes only through the gift card commands, each appending a row to `ledger`.
 */
export const GiftCard = list({
  access: {
    operation: { query: (args: any) => canManageTenant(args, "canManageRetail" as any), create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: tenantFilter },
  },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["code", "status", "initialValue", "balance", "recipientName", "expiresAt"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    code: text({ isIndexed: "unique", validation: { isRequired: true } }),
    status: select({
      type: "string",
      options: [
        { label: "Active", value: "active" },
        { label: "Used up", value: "redeemed" },
        { label: "Refunded", value: "voided" },
      ],
      defaultValue: "active",
      validation: { isRequired: true },
    }),
    initialValue: integer({ validation: { isRequired: true, min: 0 } }),
    balance: integer({ validation: { isRequired: true, min: 0 } }),
    purchaserName: text(),
    purchaserEmail: text(),
    recipientName: text(),
    recipientEmail: text(),
    message: text({ ui: { displayMode: "textarea" } }),
    paymentSession: relationship({ ref: "PaymentSession" }),
    stripePaymentIntentId: text(),
    expiresAt: timestamp(),
    activatedAt: timestamp(),
    emailedAt: timestamp(),
    refundedAt: timestamp(),
    ledger: json({ defaultValue: [] }),
    ...trackingFields,
  },
});
