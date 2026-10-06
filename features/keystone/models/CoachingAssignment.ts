import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

export const CoachingAssignment = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, requestKey") },
  access: {
    operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: ({ session }: any) => tenantFilter({ session }, canManageTenant({ session }, "canManagePrograms" as any)
      ? undefined : { OR: [{ member: { user: { id: { equals: session?.itemId } } } }, { instructor: { user: { id: { equals: session?.itemId } } } }] }) },
  },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: relationship({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    instructor: relationship({ ref: "Instructor", db: { extendPrismaSchema: requiredRelationshipDb("instructor") } }),
    title: text({ validation: { isRequired: true } }),
    instructions: text({ validation: { isRequired: true } }),
    dueAt: timestamp({ validation: { isRequired: true } }),
    status: select({ options: ["assigned", "submitted", "reviewed", "cancelled"], defaultValue: "assigned" }),
    memberEvidence: text(),
    submittedAt: timestamp(),
    review: text(),
    reviewedAt: timestamp(),
    workoutLog: relationship({ ref: "WorkoutLog" }),
    requestKey: text({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});
