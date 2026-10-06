import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

// Operator-managed inquiry/trial case, deliberately separate from marketing consent.
export const TrainingLead = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, email") },
  access: {
    operation: { query: (args: any) => canManageTenant(args, "canManagePeople" as any), create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: tenantFilter },
  },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    name: text({ validation: { isRequired: true } }),
    email: text({ validation: { isRequired: true } }),
    source: text(),
    owner: relationship({ ref: "User" }),
    status: select({ options: ["new", "contacted", "trial_booked", "trial_attended", "converted", "closed"], defaultValue: "new" }),
    trialAt: timestamp(),
    nextActionAt: timestamp(),
    member: relationship({ ref: "Member" }),
    history: json({ defaultValue: [] }),
    ...trackingFields,
  },
});
