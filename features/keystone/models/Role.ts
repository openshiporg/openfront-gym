import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, relationship, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'
import { compoundUniqueDb, validateTenantOwnership } from './tenantRelationships'
import { elevatedRoleCapabilities } from './roleCapabilities'

function manageableRoleFilter({ session }: any) {
  const organizationId = session?.data?.organization?.id;
  const currentRoleId = session?.data?.role?.id;
  if (!organizationId || !currentRoleId) return false;
  return {
    AND: [
      { organization: { id: { equals: organizationId } } },
      { id: { not: { equals: currentRoleId } } },
    ],
  };
}

export async function validateRoleInput(args: any) {
  const session = args.session ?? args.context?.session;
  await validateTenantOwnership([])(args);

  if (session?.data?.role?.id && args.item?.id === session.data.role.id) {
    args.addValidationError('You cannot modify the role assigned to your own account');
    return;
  }
  if (session) {
    const elevated = elevatedRoleCapabilities(args.resolvedData, session.data?.role);
    if (elevated.length) {
      args.addValidationError(`A role cannot grant capabilities you do not hold: ${elevated.join(', ')}`);
    }
  }
}

export const Role = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: { validateInput: validateRoleInput },
  access: {
    operation: {
      ...allOperations(permissions.canManageRoles),
      query: isSignedIn,
    },
    filter: {
      query: rules.canReadOwnRole,
      update: manageableRoleFilter,
      delete: manageableRoleFilter,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManageRoles(args),
    hideDelete: args => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ['name', 'assignedTo'],
    },
    itemView: {
      defaultFieldMode: args => (permissions.canManageRoles(args) ? 'edit' : 'read'),
    },
  },
  fields: {
    organization: relationship({
      ref: 'Organization.roles',
      access: { update: denyAll },
      graphql: { isNonNull: { read: true } },
      ui: { description: 'Tenant organization for this role' },
    }),
    name: text({ validation: { isRequired: true } }),
    canCreateRecords: checkbox({ defaultValue: false }),
    canManageAllRecords: checkbox({ defaultValue: false }),
    canSeeOtherPeople: checkbox({ defaultValue: false }),
    canEditOtherPeople: checkbox({ defaultValue: false }),
    canManagePeople: checkbox({ defaultValue: false }),
    canManageRoles: checkbox({ defaultValue: false }),
    canAccessDashboard: checkbox({ defaultValue: false }),
    canManageOnboarding: checkbox({ defaultValue: false }),
    canManageSettings: checkbox({ defaultValue: false }),
    canManageAppointments: checkbox({ defaultValue: false }),
    canManageFacilities: checkbox({ defaultValue: false }),
    canManagePrograms: checkbox({ defaultValue: false }),
    canManageCommunications: checkbox({ defaultValue: false }),
    canManageRetail: checkbox({ defaultValue: false }),
    canManagePayroll: checkbox({ defaultValue: false }),
    canViewReports: checkbox({ defaultValue: false }),
    isInstructor: checkbox({ defaultValue: false }),
    assignedTo: relationship({
      ref: 'User.role',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: {
        itemView: { fieldMode: 'read' },
      },
    }),

    ...trackingFields,
  },
});
