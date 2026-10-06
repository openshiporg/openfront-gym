import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

export const TrainingCreditEntry = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  access: {
    operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: ({ session }: any) => tenantFilter({ session }, canManageTenant({ session }, "canManageAppointments" as any)
      ? undefined : { trainingPackage: { member: { user: { id: { equals: session?.itemId } } } } }) },
  },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    trainingPackage: relationship({ ref: "TrainingPackage", db: { extendPrismaSchema: requiredRelationshipDb("trainingPackage") } }),
    appointment: relationship({ ref: "TrainerAppointment" }),
    eventKey: text({ validation: { isRequired: true } }),
    kind: select({ options: ["issued", "reserved", "restored", "refunded"], validation: { isRequired: true } }),
    quantity: integer({ validation: { isRequired: true } }),
    balanceAfter: integer({ validation: { isRequired: true, min: 0 } }),
    actor: relationship({ ref: "User" }),
    reason: text(),
    ...trackingFields,
  },
});
