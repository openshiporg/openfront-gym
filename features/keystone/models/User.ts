import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, password, relationship, text, timestamp, select } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import type { Session } from '../access'
import { trackingFields } from './trackingFields'
import { connectedRelationshipId, validateTenantOwnership } from './tenantRelationships'
import { elevatedRoleCapabilities, roleCapabilityFields } from './roleCapabilities'
import { normalizeAuthIdentity } from '../../../lib/authRateLimit'

const validateUserTenant = validateTenantOwnership([
  { field: 'role', list: 'role' },
], { requireOrganization: false });

export async function validateUserInput(args: any) {
  const session = args.session ?? args.context?.session;
  await validateUserTenant(args);

  const roleId = connectedRelationshipId(args.resolvedData.role);
  if (!roleId || !session) return;
  if (args.operation === 'update' && args.item?.id === session.itemId) {
    args.addValidationError('You cannot change the role assigned to your own account');
    return;
  }
  const role = await args.context.prisma.role.findUnique({
    where: { id: roleId },
    select: Object.fromEntries(roleCapabilityFields.map((field) => [field, true])),
  });
  const elevated = elevatedRoleCapabilities(role ?? {}, session.data?.role);
  if (elevated.length) {
    args.addValidationError(`You cannot assign a role with capabilities you do not hold: ${elevated.join(', ')}`);
  }
}

function canAssignRole({ session, item, operation }: any) {
  if (!permissions.canManageRoles({ session })) return false;
  return operation === 'create' || session?.itemId !== item?.id;
}

export const User = list({
  hooks: { validateInput: validateUserInput },
  access: {
    operation: {
      query: isSignedIn,
      // Public registration uses the bounded registerMember workflow; generic CRUD never creates public users.
      create: permissions.canManagePeople,
      update: isSignedIn,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadOwnUser,
      update: rules.canUpdatePeople,
      delete: rules.canDeletePeople,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManagePeople(args),
    hideDelete: args => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ['name', 'email', 'organization', 'role', 'membership'],
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        // canEditOtherPeople can edit other people
        if (session?.data.role?.canEditOtherPeople) return 'edit'

        // edit themselves
        if (session?.itemId === item?.id) return 'edit'

        // else, default all fields to read mode
        return 'read'
      },
    },
  },
  fields: {
    organization: relationship({
      ref: 'Organization.users',
      access: {
        create: permissions.canManagePeople,
        update: () => false,
      },
      graphql: { isNonNull: { read: true } },
      ui: { description: 'Tenant organization for this account' },
    }),
    name: text({
      validation: {
        isRequired: true,
      },
    }),
    email: text({
      isIndexed: 'unique',
      hooks: {
        resolveInput: ({ resolvedData }) => resolvedData.email === undefined
          ? undefined
          : normalizeAuthIdentity(resolvedData.email),
      },
      validation: {
        isRequired: true,
      },
    }),
    password: password({
      access: {
        read: denyAll,
        update: ({ session, item }) =>
          permissions.canManagePeople({ session }) || session?.itemId === item.id,
      },
      validation: {
        isRequired: true,
        rejectCommon: true,
        length: { min: 12, max: 128 },
      },
    }),
    role: relationship({
      ref: 'Role.assignedTo',
      access: {
        create: canAssignRole,
        update: canAssignRole,
      },
      ui: {
        itemView: {
          fieldMode: args => (canAssignRole({ ...args, operation: 'update' }) ? 'edit' : 'read'),
        },
      },
    }),

    // Inverse lifecycle collections are read-only. Owning records are linked by
    // their tenant-checked custom workflows.
    membership: relationship({
      ref: 'Membership.member',
      many: false,
      access: { create: denyAll, update: denyAll },
    }),

    payments: relationship({
      ref: 'MembershipPayment.member',
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    paymentSessions: relationship({
      ref: 'PaymentSession.user',
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    // Stripe integration
    stripeCustomerId: text({
      access: {
        read: isSignedIn,
        create: permissions.canManageAllRecords,
        update: permissions.canManageAllRecords,
      },
      ui: {
        description: "Stripe Customer ID",
      },
    }),

    phone: text({
      ui: {
        description: "Member phone number",
      },
    }),

    emergencyContact: text({
      ui: {
        description: "Emergency contact name and phone",
      },
    }),

    onboardingStatus: select({
      access: {
        create: denyAll,
        update: denyAll,
      },
      type: 'string',
      options: [
        { label: 'Not Started', value: 'not_started' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dismissed', value: 'dismissed' },
      ],
      defaultValue: 'not_started',
      validation: { isRequired: true },
      ui: {
        description: 'Tracks dashboard onboarding state for this user',
      },
    }),

    ...trackingFields,
  },
});
