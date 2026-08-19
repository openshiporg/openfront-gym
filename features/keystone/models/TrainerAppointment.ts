import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import {
  requiredRelationshipDb,
  validateResourceLocation,
  validateTenantOwnership,
} from "./tenantRelationships";

function canReadAppointment({ session }: any) {
  if (canManageTenant({ session }, "canManageAppointments" as any)) {
    return tenantFilter({ session });
  }
  return tenantFilter(
    { session },
    {
      OR: [
        { member: { user: { id: { equals: session?.itemId } } } },
        { instructor: { user: { id: { equals: session?.itemId } } } },
      ],
    }
  );
}

export const TrainerAppointment = list({
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId, idempotencyKey], map: "TrainerAppointment_organization_idempotency_key")\n}'
      );
    },
  },
  hooks: {
    async validateInput(args: any) {
      await validateTenantOwnership([
        { field: "member", list: "member", required: true },
        { field: "instructor", list: "instructor", required: true },
        { field: "location", list: "location", required: true },
        { field: "resource", list: "gymResource" },
      ])(args);
      await validateResourceLocation(args);
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: { query: canReadAppointment },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: { initialColumns: ["startTime", "member", "instructor", "location", "status"] },
  },
  fields: {
    organization: relationship({
      ref: "Organization.appointments",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    member: relationship({
      ref: "Member.trainerAppointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("member") },
    }),
    instructor: relationship({
      ref: "Instructor.appointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("instructor") },
    }),
    location: relationship({
      ref: "Location.trainerAppointments",
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("location") },
    }),
    resource: relationship({ ref: "GymResource.appointments" }),
    startTime: timestamp({ validation: { isRequired: true } }),
    endTime: timestamp({ validation: { isRequired: true } }),
    durationMinutes: integer({ validation: { isRequired: true, min: 15, max: 480 } }),
    status: select({
      type: "enum",
      options: [
        { label: "Scheduled", value: "scheduled" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Checked in", value: "checked_in" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No show", value: "no_show" },
      ],
      defaultValue: "scheduled",
      validation: { isRequired: true },
    }),
    serviceName: text({ validation: { isRequired: true } }),
    priceAmount: integer({ defaultValue: 0, validation: { min: 0 } }),
    currencyCode: text({ defaultValue: "USD", validation: { isRequired: true } }),
    idempotencyKey: text({
      isIndexed: true,
      access: { update: () => false },
      validation: { isRequired: true },
    }),
    requestHash: text({
      access: { update: () => false },
      validation: { isRequired: true },
    }),
    memberNotes: text({ ui: { displayMode: "textarea" } }),
    internalNotes: text({
      access: { read: permissions.canManageAllRecords },
      ui: { displayMode: "textarea" },
    }),
    cancellationReason: text({ ui: { displayMode: "textarea" } }),
    cancelledAt: timestamp(),
    checkedInAt: timestamp(),
    completedAt: timestamp(),
    payment: relationship({ ref: "GymPayment" }),
    ...trackingFields,
  },
});
