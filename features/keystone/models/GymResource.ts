import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { checkbox, integer, json, relationship, select, text } from "@keystone-6/core/fields";
import { canManageTenant, tenantFilter, tenantItemAccess } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

const canManageFacilities = (args: any) => canManageTenant(args, "canManageFacilities" as any);
const tenantItem = (args: any) => tenantItemAccess(args);

export const GymResource = list({
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "location", list: "location", required: true },
    ]),
  },
  access: {
    operation: {
      query: canManageFacilities,
      create: canManageFacilities,
      update: canManageFacilities,
      delete: canManageFacilities,
    },
    filter: { query: tenantFilter },
    item: { update: tenantItem, delete: tenantItem },
  },
  ui: {
    labelField: "name",
    listView: { initialColumns: ["name", "type", "location", "capacity", "isActive"] },
  },
  fields: {
    organization: relationship({
      ref: "Organization.resources",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    location: relationship({
      ref: "Location.resources",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") },
    }),
    name: text({ validation: { isRequired: true } }),
    type: select({
      type: "enum",
      options: [
        { label: "Training room", value: "room" },
        { label: "Court", value: "court" },
        { label: "Lane", value: "lane" },
        { label: "Equipment", value: "equipment" },
        { label: "Recovery station", value: "recovery" },
        { label: "Other", value: "other" },
      ],
      defaultValue: "room",
      validation: { isRequired: true },
    }),
    capacity: integer({ defaultValue: 1, validation: { min: 1, max: 500 } }),
    isExclusive: checkbox({ defaultValue: true }),
    isActive: checkbox({ defaultValue: true }),
    setupBufferMinutes: integer({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    cleanupBufferMinutes: integer({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    notes: text({ ui: { displayMode: "textarea" } }),
    metadata: json({ defaultValue: {} }),
    appointments: relationship({
      ref: "TrainerAppointment.resource",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),
    ...trackingFields,
  },
});
