import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, relationship, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'
import { compoundUniqueDb, validateTenantOwnership } from './tenantRelationships'
import { elevatedRoleCapabilities, roleCapabilityFields } from './roleCapabilities'

/** Full-capability holder: can manage every record and every role. Only such a holder may complete its own role. */
function holdsFullCapability(role: any) {
  return role?.canManageAllRecords === true && role?.canManageRoles === true;
}

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

/** Update filter: as above, plus a full-capability holder's own role (validateRoleInput limits that edit to adding flags). */
function updatableRoleFilter({ session }: any) {
  const organizationId = session?.data?.organization?.id;
  const currentRoleId = session?.data?.role?.id;
  if (!organizationId || !currentRoleId) return false;
  if (!holdsFullCapability(session?.data?.role)) return manageableRoleFilter({ session });
  return { organization: { id: { equals: organizationId } } };
}

/**
 * Own-role edit allowed only to complete a full-capability role: the stored role (not the
 * session snapshot) must hold canManageAllRecords and canManageRoles, and the change may only
 * turn capability flags on. No rename, no removal, no relationship changes, never a non-full role.
 */
export function ownRoleCompletionError(item: any, resolvedData: Record<string, unknown>) {
  if (!holdsFullCapability(item)) return 'You cannot modify the role assigned to your own account';
  // isInstructor is a persona (narrows to own rosters), not a capability; it stays out of self-completion.
  const allowed = new Set<string>(roleCapabilityFields.filter(field => field !== 'isInstructor'));
  for (const [key, value] of Object.entries(resolvedData ?? {})) {
    if (key === 'updatedAt') continue;
    if (!allowed.has(key) || value !== true) {
      return 'Your own role can only gain capabilities; ask another role manager for any other change';
    }
  }
  return null;
}

export async function validateRoleInput(args: any) {
  const session = args.session ?? args.context?.session;
  await validateTenantOwnership([])(args);

  if (session?.data?.role?.id && args.item?.id === session.data.role.id) {
    const error = args.operation === 'update' ? ownRoleCompletionError(args.item, args.resolvedData) : 'You cannot modify the role assigned to your own account';
    if (error) args.addValidationError(error);
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
      update: updatableRoleFilter,
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
    canCreateRecords: checkbox({ defaultValue: false, label: 'Reserved: grants no access in Gym', ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } } }),
    canManageAllRecords: checkbox({ defaultValue: false, label: 'User can read, update and delete every record in this organization (full administrator)' }),
    canSeeOtherPeople: checkbox({ defaultValue: false, label: 'User can read other members and staff' }),
    canEditOtherPeople: checkbox({ defaultValue: false, label: 'User can update other members and staff' }),
    canManagePeople: checkbox({ defaultValue: false, label: 'User can invite members, issue password links and manage member accounts' }),
    canManageRoles: checkbox({ defaultValue: false, label: 'User can CRUD roles' }),
    canAccessDashboard: checkbox({ defaultValue: false, label: 'User can access the dashboard' }),
    canManageOnboarding: checkbox({ defaultValue: false, label: 'User can access onboarding and store configuration' }),
    canManageSettings: checkbox({ defaultValue: false, label: 'User can edit store settings and publish participation terms' }),
    canManageAppointments: checkbox({ defaultValue: false, label: 'User can manage personal training packages, appointments and availability' }),
    canManageCheckIns: checkbox({ defaultValue: false, label: 'User can check members in and out at the front desk' }),
    canManageFacilities: checkbox({ defaultValue: false, label: 'User can manage rooms and equipment, closures and facility check-ins' }),
    canManagePrograms: checkbox({ defaultValue: false, label: 'User can assign and review coaching work for any member' }),
    canManageCommunications: checkbox({ defaultValue: false, label: 'User can read and answer storefront contact messages' }),
    canManageRetail: checkbox({ defaultValue: false, label: 'User can record retail sales, returns, stock and cash drawer closes' }),
    canManagePayroll: checkbox({ defaultValue: false, label: 'Reserved: Gym has no payroll features; grants no access', ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } } }),
    canViewReports: checkbox({ defaultValue: false, label: 'User can view reports' }),
    isInstructor: checkbox({ defaultValue: false, label: 'User is a coach: sees their own rosters, appointments and coaching members' }),
    assignedTo: relationship({
      ref: 'User.role',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: {
        displayMode: 'count',
        itemView: { fieldMode: 'read' },
      },
    }),

    ...trackingFields,
  },
});
