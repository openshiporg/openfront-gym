import { list, graphql } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  json,
  relationship,
  checkbox,
  virtual,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn, permissions, rules } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { normalizeOnboardingMediaPath } from "../mutations/gymSettingsLifecycle";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const Instructor = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: {
    async validateInput(args: any) {
      await validateTenantOwnership([
        { field: "user", list: "user" },
      ])(args);
      const { resolvedData, addValidationError } = args;
      if (resolvedData.photo === undefined) return;
      try {
        resolvedData.photo = normalizeOnboardingMediaPath(resolvedData.photo);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
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
      query: rules.canReadInstructor,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ["user", "specialties", "isActive"],
    },
    labelField: "user",
  },
  fields: {
    organization: relationship({
      ref: "Organization.instructors",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
      ui: { description: "Tenant organization for this instructor" },
    }),
    // Link to User account
    user: relationship({
      ref: "User",
      access: { read: permissions.canManageAllRecords, update: denyAll },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
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
      access: { create: permissions.canManageOnboarding, update: denyAll },
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
      access: { create: denyAll, update: denyAll },
    }),

    classInstances: relationship({
      ref: "ClassInstance.instructor",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    availability: relationship({
      ref: "TrainerAvailability.instructor",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    appointments: relationship({
      ref: "TrainerAppointment.instructor",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    displayName: virtual({
      access: { read: isSignedIn },
      field: graphql.field({
        type: graphql.String,
        async resolve(item, args, context) {
          const instructor = await context.sudo().query.Instructor.findOne({
            where: { id: item.id.toString() },
            query: "user { name }",
          });
          return instructor?.user?.name ?? "Coach";
        },
      }),
      ui: { description: "Public instructor display name" },
    }),

    totalClassesTaught: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { lte: new Date().toISOString() },
              isCancelled: { equals: false },
            },
          });
          return count;
        },
      }),
      ui: { description: 'Total number of classes taught' },
    }),

    averageRating: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve() {
          // Ratings are not modeled yet; do not expose a fabricated score.
          return null;
        },
      }),
      ui: { description: 'Unavailable until member ratings are modeled' },
    }),

    totalRevenue: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Float,
        async resolve() {
          // Instructor pricing/revenue is not modeled; do not expose a fabricated amount.
          return null;
        },
      }),
      ui: { description: 'Unavailable until instructor pricing is modeled' }
    }),

    upcomingClasses: virtual({
      access: { read: permissions.canManageAllRecords },
      field: graphql.field({
        type: graphql.Int,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const count = await sudoContext.query.ClassInstance.count({
            where: {
              instructor: { id: { equals: item.id.toString() } },
              date: { gte: new Date().toISOString() },
              isCancelled: { equals: false },
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
