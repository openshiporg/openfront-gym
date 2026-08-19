import { list } from "@keystone-6/core";
import { checkbox, integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { canManageTenant, tenantFilter, tenantItemAccess } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

const canManageAppointments = (args: any) => canManageTenant(args, "canManageAppointments" as any);
const tenantItem = (args: any) => tenantItemAccess(args);

function canReadTrainerAvailability({ session }: any) {
  if (canManageAppointments({ session })) return tenantFilter({ session });
  if (session?.data?.role?.isInstructor) {
    return tenantFilter({ session }, { instructor: { user: { id: { equals: session.itemId } } } });
  }
  return false;
}

export const TrainerAvailability = list({
  hooks: {
    validateInput: validateTenantOwnership([
      { field: "instructor", list: "instructor", required: true },
      { field: "location", list: "location", required: true },
    ]),
  },
  access: {
    operation: {
      query: ({ session }: any) => Boolean(session),
      create: canManageAppointments,
      update: canManageAppointments,
      delete: canManageAppointments,
    },
    filter: { query: canReadTrainerAvailability },
    item: { update: tenantItem, delete: tenantItem },
  },
  ui: {
    listView: { initialColumns: ["instructor", "type", "dayOfWeek", "startTime", "endTime", "isAvailable"] },
  },
  fields: {
    organization: relationship({
      ref: "Organization.trainerAvailability",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    instructor: relationship({
      ref: "Instructor.availability",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("instructor") },
    }),
    location: relationship({
      ref: "Location.trainerAvailability",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") },
    }),
    type: select({
      type: "enum",
      options: [
        { label: "Recurring", value: "recurring" },
        { label: "One time", value: "one_time" },
        { label: "Time off", value: "time_off" },
      ],
      defaultValue: "recurring",
      validation: { isRequired: true },
    }),
    dayOfWeek: integer({ validation: { min: 0, max: 6 } }),
    date: timestamp(),
    startTime: text({ validation: { isRequired: true } }),
    endTime: text({ validation: { isRequired: true } }),
    effectiveFrom: timestamp(),
    effectiveTo: timestamp(),
    isAvailable: checkbox({ defaultValue: true }),
    reason: text({ ui: { displayMode: "textarea" } }),
    ...trackingFields,
  },
});
