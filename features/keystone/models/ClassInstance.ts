import { list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  relationship,
  timestamp,
  integer,
  checkbox,
  text,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions, rules } from "../access";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";
import { tenantFilter } from "../access/tenantPolicy";

const validateClassInstanceTenant = validateTenantOwnership([
  { field: "classSchedule", list: "classSchedule", required: true },
  { field: "instructor", list: "instructor" },
]);

export const ClassInstance = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, classScheduleId, date") },
  hooks: {
    async validateInput(args: any) {
      await validateClassInstanceTenant(args);
      const nextCapacity = args.resolvedData.maxCapacity;
      if (args.operation === "update" && typeof nextCapacity === "number" && args.item?.id) {
        const confirmed = await args.context.prisma.classBooking.count({
          where: { classInstanceId: args.item.id, status: "confirmed" },
        });
        if (nextCapacity < confirmed) {
          args.addValidationError(`Capacity cannot be lower than the ${confirmed} confirmed bookings`);
        }
      }
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: rules.canReadClassInstance,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ["classSchedule", "date", "instructor", "isCancelled"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.classInstances",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    // Reference to the recurring schedule
    classSchedule: relationship({
      ref: "ClassSchedule.instances",
      ui: {
        displayMode: "select",
      },
    }),

    // Specific date for this instance
    date: timestamp({
      validation: { isRequired: true },
      ui: {
        description: "Specific date and time of this class occurrence",
      },
    }),

    // Override instructor for this specific instance (if different from schedule)
    instructor: relationship({
      ref: "Instructor.classInstances",
      ui: {
        displayMode: "select",
        description: "Override instructor (leave empty to use schedule default)",
      },
    }),

    // Override capacity for this specific instance
    maxCapacity: integer({
      access: { update: denyAll },
      validation: { min: 1, max: 10000 },
      ui: {
        description: "Override max capacity (leave empty to use schedule default)",
      },
    }),

    isCancelled: checkbox({
      access: { update: denyAll },
      defaultValue: false,
      ui: {
        description: "Whether this class instance has been cancelled",
      },
    }),

    cancellationReason: text({
      access: { read: permissions.canManageAllRecords, update: denyAll },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        displayMode: "textarea",
        description: "Reason for cancellation (if cancelled)",
      },
    }),

    // Bookings for this specific instance
    bookings: relationship({
      ref: "ClassBooking.classInstance",
      access: {
        read: permissions.canManageAllRecords,
        create: denyAll,
        update: denyAll,
      },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      many: true,
    }),

    ...trackingFields,
  },
});
