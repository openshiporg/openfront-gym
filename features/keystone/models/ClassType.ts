import { list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  integer,
  select,
  multiselect,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn, permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { relationship } from "@keystone-6/core/fields";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const ClassType = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateTenantOwnership([]) },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "difficulty", "duration", "caloriesBurn"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.classTypes",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Yoga, Spin, HIIT, Boxing",
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    difficulty: select({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "All Levels", value: "all-levels" },
      ],
      defaultValue: "all-levels",
      validation: { isRequired: true },
    }),

    duration: integer({
      validation: { isRequired: true },
      defaultValue: 60,
      ui: {
        description: "Typical duration in minutes",
      },
    }),

    equipmentNeeded: multiselect({
      type: "string",
      options: [
        { label: "Mat", value: "mat" },
        { label: "Weights", value: "weights" },
        { label: "Resistance Bands", value: "resistance_bands" },
        { label: "Jump Rope", value: "jump_rope" },
        { label: "Boxing Gloves", value: "boxing_gloves" },
        { label: "Cycling Shoes", value: "cycling_shoes" },
        { label: "Kettlebells", value: "kettlebells" },
        { label: "Medicine Ball", value: "medicine_ball" },
        { label: "None", value: "none" },
      ],
      defaultValue: [],
    }),

    caloriesBurn: integer({
      ui: {
        description: "Estimated calories burned per session",
      },
    }),

    schedules: relationship({
      ref: "ClassSchedule.classType",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
});
