import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { checkbox, integer, json, relationship, text, timestamp } from "@keystone-6/core/fields";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";
import { trackingFields } from "./trackingFields";
const access = { operation: { query: (args: any) => canManageTenant(args, "canManageRetail" as any), create: denyAll, update: denyAll, delete: denyAll }, filter: { query: tenantFilter } };
const organization = () => relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } });
const location = () => relationship({ ref: "Location", db: { extendPrismaSchema: requiredRelationshipDb("location") } });
export const RetailItem = list({
  access, db: { extendPrismaSchema: compoundUniqueDb("organizationId, locationId, sku") },
  fields: { organization: organization(), location: location(), sku: text({ validation: { isRequired: true } }), name: text({ validation: { isRequired: true } }), unitAmount: integer({ validation: { isRequired: true, min: 0 } }), currencyCode: text({ defaultValue: "USD" }), stockOnHand: integer({ defaultValue: 0, validation: { min: 0 } }), isActive: checkbox({ defaultValue: true }), ...trackingFields },
});
export const RetailSale = list({
  access, db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization(), location: location(), requestKey: text({ validation: { isRequired: true } }), requestHash: text({ validation: { isRequired: true } }), lines: json({ defaultValue: [] }), totalAmount: integer({ validation: { isRequired: true, min: 0 } }), currencyCode: text({ defaultValue: "USD" }), tender: text({ validation: { isRequired: true } }), paymentReference: text(), soldAt: timestamp({ validation: { isRequired: true } }), recordedBy: relationship({ ref: "User" }), ...trackingFields },
});
export const RetailReturn = list({
  access, db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization(), location: location(), sale: relationship({ ref: "RetailSale", db: { extendPrismaSchema: requiredRelationshipDb("sale") } }), requestKey: text({ validation: { isRequired: true } }), requestHash: text({ validation: { isRequired: true } }), lines: json({ defaultValue: [] }), refundAmount: integer({ validation: { isRequired: true, min: 0 } }), refundReference: text(), tender: text({ validation: { isRequired: true } }), reason: text({ validation: { isRequired: true } }), returnedAt: timestamp({ validation: { isRequired: true } }), recordedBy: relationship({ ref: "User" }), ...trackingFields },
});
export const RetailStockEntry = list({
  access, db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  fields: { organization: organization(), location: location(), item: relationship({ ref: "RetailItem", db: { extendPrismaSchema: requiredRelationshipDb("item") } }), eventKey: text({ validation: { isRequired: true } }), requestHash: text(), quantity: integer({ validation: { isRequired: true } }), balanceAfter: integer({ validation: { isRequired: true, min: 0 } }), reason: text({ validation: { isRequired: true } }), recordedBy: relationship({ ref: "User" }), ...trackingFields },
});
export const RetailClose = list({
  access, db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  fields: { organization: organization(), location: location(), requestKey: text({ validation: { isRequired: true } }), requestHash: text({ validation: { isRequired: true } }), periodStart: timestamp({ validation: { isRequired: true } }), periodEnd: timestamp({ validation: { isRequired: true } }), openingAmount: integer({ validation: { min: 0 } }), expectedAmount: integer({ validation: { isRequired: true } }), countedAmount: integer({ validation: { isRequired: true, min: 0 } }), varianceAmount: integer({ validation: { isRequired: true } }), reason: text(), evidence: json({ defaultValue: {} }), recordedBy: relationship({ ref: "User" }), ...trackingFields },
});
