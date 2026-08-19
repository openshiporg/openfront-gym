import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { requiredRelationshipDb } from "./tenantRelationships";

export const OnboardingRun = list({
  access: {
    operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll },
  },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId], map: "OnboardingRun_organization_key")\n}'
      );
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.onboardingRuns",
      access: { update: denyAll },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    status: select({
      type: "string",
      options: [
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "running",
      validation: { isRequired: true },
      access: { read: denyAll, create: denyAll, update: denyAll },
    }),
    attempts: integer({ defaultValue: 0, access: { read: denyAll, create: denyAll, update: denyAll } }),
    lastError: text({ defaultValue: "", access: { read: denyAll, create: denyAll, update: denyAll } }),
    startedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    completedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    leaseUntil: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    leaseToken: text({ access: { read: denyAll, create: denyAll, update: denyAll } }),
  },
});
