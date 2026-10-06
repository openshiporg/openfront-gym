import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

// Immutable purchased terms; only lifecycle services may issue, redeem or refund.
export const TrainingPackage = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, purchaseReference") },
  access: {
    operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: ({ session }: any) => tenantFilter({ session }, canManageTenant({ session }, "canManageAppointments" as any)
      ? undefined : { member: { user: { id: { equals: session?.itemId } } } }) },
  },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: relationship({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    location: relationship({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } }),
    serviceName: text({ validation: { isRequired: true } }),
    durationMinutes: integer({ validation: { isRequired: true, min: 15, max: 480 } }),
    totalCredits: integer({ validation: { isRequired: true, min: 1, max: 1000 } }),
    creditsRemaining: integer({ validation: { isRequired: true, min: 0 } }),
    amount: integer({ validation: { isRequired: true, min: 1 } }),
    currencyCode: text({ defaultValue: "USD" }),
    purchaseReference: text({ validation: { isRequired: true } }),
    purchasedAt: timestamp({ validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    recordedBy: relationship({ ref: "User" }),
    status: select({ options: ["active", "refunded"], defaultValue: "active", validation: { isRequired: true } }),
    refundAmount: integer({ defaultValue: 0 }),
    refundReference: text(),
    refundedAt: timestamp(),
    terms: json({ defaultValue: {} }),
    ...trackingFields,
  },
});
