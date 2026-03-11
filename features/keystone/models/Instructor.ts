import { list, graphql } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  json,
  relationship,
  checkbox,
  virtual,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const Instructor = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ["user", "specialties", "isActive"],
    },
    labelField: "user",
  },
  fields: {
    // Link to User account
    user: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "The user account for this instructor",
      },
    }),

    bio: document({
      formatting: true,
      links: true,
    }),

    // JSON array of specialties
    specialties: json({
      defaultValue: [],
      ui: {
        description: "Array of specialties (e.g., ['yoga', 'pilates', 'strength'])",
      },
    }),

    // JSON array of certifications
    certifications: json({
      defaultValue: [],
      ui: {
        description: "Array of certifications (e.g., ['ACE', 'NASM', 'RYT-200'])",
      },
    }),

    photo: text({
      ui: {
        description: "URL to instructor's photo",
      },
    }),

    isActive: checkbox({
      defaultValue: true,
      ui: {
        description: "Whether this instructor is currently active",
      },
    }),

    // Relationships
    classSchedules: relationship({
      ref: "ClassSchedule.instructor",
      many: true,
    }),

    classInstances: relationship({
      ref: "ClassInstance.instructor",
      many: true,
    }),

    totalClassesTaught: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: new Date().toISOString() },
            },
          });
          return count;
        },
      }),
      ui: { description: 'Total number of classes taught' },
    }),

    averageRating: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          return 4.5;
        },
      }),
      ui: { description: 'Average rating from members (placeholder)' },
    }),

    totalRevenue: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();

          const instances = await sudoContext.query.ClassInstance.findMany({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: new Date().toISOString() },
            },
            query: 'bookings(where: { status: { equals: "confirmed" } }) { id }',
          });

          const totalBookings = instances.reduce(
            (sum: number, inst: any) => sum + (inst.bookings?.length || 0),
            0
          );

          const revenuePerClass = 15;
          return totalBookings * revenuePerClass;
        },
      }),
      ui: { description: 'Total revenue attributed to this instructor' },
    }),

    upcomingClasses: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { gte: new Date().toISOString() },
            },
          });
          return count;
        },
      }),
      ui: { description: 'Number of upcoming scheduled classes' },
    }),

    ...trackingFields,
  },
});
