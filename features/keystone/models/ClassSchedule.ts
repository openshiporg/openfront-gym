import { list, graphql } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  integer,
  relationship,
  select,
  checkbox,
  virtual,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions, rules } from "../access";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";
import { tenantFilter } from "../access/tenantPolicy";

const validateClassScheduleTenant = validateTenantOwnership([
  { field: "instructor", list: "instructor" },
]);

export const ClassSchedule = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name, dayOfWeek, startTime, instructorId") },
  hooks: {
    async validateInput(args: any) {
      await validateClassScheduleTenant(args);
      const startTime = args.resolvedData.startTime ?? args.item?.startTime;
      const endTime = args.resolvedData.endTime ?? args.item?.endTime;
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (typeof startTime !== "string" || !timePattern.test(startTime)) {
        args.addValidationError("Start time must use 24-hour HH:MM format");
      }
      if (typeof endTime !== "string" || !timePattern.test(endTime)) {
        args.addValidationError("End time must use 24-hour HH:MM format");
      } else if (typeof startTime === "string" && timePattern.test(startTime) && endTime <= startTime) {
        args.addValidationError("End time must be later than start time");
      }

      const nextCapacity = args.resolvedData.maxCapacity;
      if (args.operation === "update" && typeof nextCapacity === "number" && args.item?.id) {
        const inheritedInstances = await args.context.prisma.classInstance.findMany({
          where: { classScheduleId: args.item.id, maxCapacity: null },
          select: { id: true },
        });
        const instanceIds = inheritedInstances.map((instance: any) => instance.id);
        if (instanceIds.length) {
          const counts = await args.context.prisma.classBooking.groupBy({
            by: ["classInstanceId"],
            where: { classInstanceId: { in: instanceIds }, status: "confirmed" },
            _count: { _all: true },
          });
          const highestConfirmed = counts.reduce((highest: number, row: any) => Math.max(highest, row._count._all), 0);
          if (nextCapacity < highestConfirmed) {
            args.addValidationError(`Capacity cannot be lower than the ${highestConfirmed} confirmed bookings on a class instance`);
          }
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
      query: rules.canReadClassSchedule,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "instructor", "dayOfWeek", "startTime", "endTime", "isActive"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.classSchedules",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the class (e.g., 'Morning Yoga', 'HIIT Blast')",
      },
    }),

    description: text({
      ui: {
        displayMode: "textarea",
        description: "Description of the class",
      },
    }),

    instructor: relationship({
      ref: "Instructor.classSchedules",
      ui: {
        displayMode: "select",
      },
    }),

    classType: relationship({
      ref: "ClassType.schedules",
      ui: {
        displayMode: "select",
        description: "Reusable class format for this recurring schedule",
      },
    }),

    dayOfWeek: select({
      type: "string",
      options: [
        { label: "Monday", value: "monday" },
        { label: "Tuesday", value: "tuesday" },
        { label: "Wednesday", value: "wednesday" },
        { label: "Thursday", value: "thursday" },
        { label: "Friday", value: "friday" },
        { label: "Saturday", value: "saturday" },
        { label: "Sunday", value: "sunday" },
      ],
      validation: { isRequired: true },
    }),

    startTime: text({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)",
      },
    }),

    endTime: text({
      validation: { isRequired: true },
      ui: {
        description: "Format: HH:MM (24-hour)",
      },
    }),

    maxCapacity: integer({
      access: { update: denyAll },
      validation: { isRequired: true, min: 1, max: 10000 },
      defaultValue: 20,
      ui: {
        description: "Maximum number of participants",
      },
    }),

    isActive: checkbox({
      defaultValue: true,
      ui: {
        description: "Whether this class schedule is currently active",
      },
    }),

    // Relationship to specific instances
    instances: relationship({
      ref: "ClassInstance.classSchedule",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    averageAttendance: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const now = new Date().toISOString();
          const [completedClasses, totalAttendance] = await Promise.all([
            sudoContext.query.ClassInstance.count({
              where: {
                classSchedule: { id: { equals: item.id.toString() } },
                date: { lte: now },
                isCancelled: { equals: false },
              },
            }),
            sudoContext.query.AttendanceRecord.count({
              where: {
                classSchedule: { id: { equals: item.id.toString() } },
                attended: { equals: true },
              },
            }),
          ]);

          if (completedClasses === 0) return 0;
          return Math.round((totalAttendance / completedClasses) * 10) / 10;
        },
      }),
      ui: { description: 'Average number of attendees per class' },
    }),

    bookingRate: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const scheduleCapacity = item.maxCapacity as number;
          if (!scheduleCapacity) return 0;

          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: {
              classSchedule: { id: { equals: item.id.toString() } },
              isCancelled: { equals: false },
            },
            query: 'maxCapacity bookings(where: { status: { equals: "confirmed" } }) { id }',
          });

          if (instances.length === 0) return 0;

          const totalBooked = instances.reduce(
            (sum: number, inst: any) => sum + (inst.bookings?.length || 0),
            0
          );
          const totalCapacity = instances.reduce(
            (sum: number, instance: any) => sum + (instance.maxCapacity ?? scheduleCapacity),
            0,
          );

          return totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;
        },
      }),
      ui: { description: 'Booking rate as percentage of capacity' },
    }),

    totalRevenue: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve() {
          // Class pricing is not modeled on schedules; never invent revenue.
          return null;
        },
      }),
      ui: { description: 'Unavailable until class-level pricing is modeled' },
    }),

    ...trackingFields,
  },
});
