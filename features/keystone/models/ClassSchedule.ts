import { list, graphql } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  integer,
  relationship,
  select,
  checkbox,
  virtual,
} from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const ClassSchedule = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "instructor", "dayOfWeek", "startTime", "endTime", "isActive"],
    },
  },
  fields: {
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
      validation: { isRequired: true },
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
    }),

    averageAttendance: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: { classSchedule: { id: { equals: item.id.toString() } } },
            query: 'bookings { id }',
          });

          if (instances.length === 0) return 0;

          const totalAttendance = instances.reduce(
            (sum: number, inst: any) => sum + (inst.bookings?.length || 0),
            0
          );

          return Math.round((totalAttendance / instances.length) * 10) / 10;
        },
      }),
      ui: { description: 'Average number of attendees per class' },
    }),

    bookingRate: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const maxCapacity = item.maxCapacity as number;
          if (!maxCapacity) return 0;

          const sudoContext = context.sudo();
          const instances = await sudoContext.query.ClassInstance.findMany({
            where: { classSchedule: { id: { equals: item.id.toString() } } },
            query: 'bookings(where: { status: { equals: "confirmed" } }) { id }',
          });

          if (instances.length === 0) return 0;

          const totalBooked = instances.reduce(
            (sum: number, inst: any) => sum + (inst.bookings?.length || 0),
            0
          );
          const totalCapacity = instances.length * maxCapacity;

          return Math.round((totalBooked / totalCapacity) * 100);
        },
      }),
      ui: { description: 'Booking rate as percentage of capacity' },
    }),

    totalRevenue: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const bookings = await sudoContext.query.ClassBooking.findMany({
            where: {
              classInstance: {
                classSchedule: { id: { equals: item.id.toString() } }
              },
              status: { equals: 'confirmed' }
            },
            query: 'id',
          });

          const classPrice = 15;
          return bookings.length * classPrice;
        },
      }),
      ui: { description: 'Total revenue from this class schedule' },
    }),

    ...trackingFields,
  },
});
