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
import { retireUnderSchedulingLock } from "../lib/lifecycle-guards";

/**
 * Certifications are display strings or structured qualification entries
 * ({ name, required, evidenceReference, verifiedAt, expiresAt, revoked }); a required entry is
 * enforced before coaching, so its shape is checked on save and never flattened to text.
 */
function certificationProblem(value: unknown) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 50) return "Certifications must be a list of up to 50 entries";
  for (const [index, entry] of value.entries()) {
    if (typeof entry === "string") { if (entry.length > 200) return `Certification ${index + 1} is too long`; continue; }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return `Certification ${index + 1} must be text or a qualification object`;
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) return `Certification ${index + 1} needs a name`;
    if (item.required !== undefined && typeof item.required !== "boolean") return `Certification ${index + 1}: required must be true or false`;
    for (const key of ["verifiedAt", "expiresAt"]) if (item[key] != null && !Number.isFinite(new Date(String(item[key])).getTime())) return `Certification ${index + 1}: ${key} must be a date`;
    if (item.required === true && (typeof item.evidenceReference !== "string" || !item.evidenceReference.trim() || !item.verifiedAt || !item.expiresAt)) return `Certification ${index + 1} is required, so it needs evidenceReference, verifiedAt and expiresAt`;
  }
  return null;
}

export const Instructor = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, userId") },
  hooks: {
    async validateInput(args: any) {
      let failed = false;
      const addValidationError = (message: string) => { failed = true; args.addValidationError(message); };
      await validateTenantOwnership([
        { field: "user", list: "user" },
      ])({ ...args, addValidationError });
      const { resolvedData } = args;
      // A coach profile links only to an account that holds the instructor role.
      const linkedUserId = resolvedData.user?.connect?.id;
      if (args.operation === "create" && linkedUserId) {
        const linked = await args.context.sudo().query.User.findOne({ where: { id: linkedUserId }, query: "id role { isInstructor }" });
        if (!linked?.role?.isInstructor) addValidationError("Link the coach profile to an account with the instructor role");
      }
      const certifications = certificationProblem(resolvedData.certifications);
      if (resolvedData.certifications !== undefined && certifications) addValidationError(certifications);
      if (resolvedData.photo !== undefined) {
        try {
          resolvedData.photo = normalizeOnboardingMediaPath(resolvedData.photo);
        } catch (error) {
          addValidationError(error instanceof Error ? error.message : String(error));
        }
      }
      // Retirement is checked and written last, together under the scheduling lock, and only
      // when nothing else in this edit was refused.
      if (!failed && args.operation === "update" && resolvedData.isActive === false && args.item?.isActive) {
        const problem = await retireUnderSchedulingLock(args.context, "instructor", args.item);
        if (problem) addValidationError(problem);
      }
    },
    async validateDelete({ item, context, addValidationError }: any) {
      const prisma = context.prisma as any;
      const [schedules, instances, appointments] = await Promise.all([
        prisma.classSchedule.count({ where: { instructorId: item.id } }),
        prisma.classInstance.count({ where: { instructorId: item.id } }),
        prisma.trainerAppointment.count({ where: { instructorId: item.id } }),
      ]);
      if (schedules || instances || appointments) addValidationError("Coaches with classes or appointments keep their history: mark them inactive after reassigning upcoming work instead of deleting");
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
    // Coach profiles are created from Instructors → Add coach, which offers only eligible
    // instructor-role accounts; the generic create form's account picker is not offered.
    hideCreate: true,
    listView: {
      initialColumns: ["user", "specialties", "isActive"],
    },
    // A scalar label: the shared dashboard core selects labels as scalars (`label: <field>`).
    labelField: "displayName",
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
      // Linked once at creation. Onboarding placeholder accounts keep their recorded provenance;
      // handing one to the real coach is on hold pending the family credential security review.
      ui: {
        displayMode: "select",
        description: "The user account for this instructor",
        itemView: { fieldMode: "read" },
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

    // JSON array of certifications: descriptive strings, or structured entries that gate coaching
    certifications: json({
      defaultValue: [],
      ui: {
        description: "Descriptive names (\"ACE\") or structured entries. An entry with \"required\": true needs name, evidenceReference, verifiedAt and expiresAt, and blocks coaching once expired or \"revoked\": true.",
      },
    }),

    photo: text({
      access: { create: permissions.canManageOnboarding, update: denyAll },
      ui: {
        description: "Photo set during onboarding",
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
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
