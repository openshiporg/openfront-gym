import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { requiredRelationshipDb } from "./tenantRelationships";
import { trackingFields } from "./trackingFields";
import { trackingBasisField } from "./trackingBasis";

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
    // Starter records this run created or adopted, their seeded values, the placeholder coach
    // accounts it created and the requested configuration: the provenance retries rely on.
    manifest: json({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    ...trackingFields,
    trackingBasis: trackingBasisField,
  },
});
