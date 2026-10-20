import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, password, relationship, text, timestamp, select } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import type { Session } from '../access'
import { trackingFields } from './trackingFields'
import { connectedRelationshipId, validateTenantOwnership } from './tenantRelationships'
import { elevatedRoleCapabilities, roleCapabilityFields } from './roleCapabilities'
import { normalizeAuthIdentity } from '../../../lib/authRateLimit'
import { guardKeystonePrismaResults } from '../lib/prisma-result'
import { memberHasHistory } from '../lib/lifecycle-guards'

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
  const prisma = guardKeystonePrismaResults(args.context.prisma as any)
  const role = await prisma.role.findUnique({
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

/**
 * An account linked to a member profile has one contact authority: the Member record (and the
 * member's own profile service). Its User name/phone copy is not edited generically, so the two
 * can never be changed from both sides at once. Staff-only accounts keep their own fields.
 */
async function noLinkedMember({ item, context }: any) {
  if (!item?.id) return true
  const linked = await guardKeystonePrismaResults(context.prisma as any).member.count({ where: { userId: item.id } })
  return linked === 0
}

export const User = list({
  hooks: {
    validateInput: validateUserInput,
    // Accounts that own memberships, bookings, payments or coaching history are archived
    // (member account closed, coach retired), never deleted out from under that history.
    async validateDelete({ item, context, addValidationError }: any) {
      const prisma = guardKeystonePrismaResults(context.prisma as any)
      const member = await prisma.member.findFirst({ where: { userId: item.id, organizationId: item.organizationId }, select: { id: true } })
      const coach = await prisma.instructor.count({ where: { userId: item.id } })
      if (coach || await memberHasHistory(context, item.organizationId, member?.id ?? null, item.id)) {
        addValidationError("This account has membership, booking, payment or coaching history and can't be deleted; close or retire it instead")
      }
    },
  },
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
      access: { update: noLinkedMember },
      validation: {
        isRequired: true,
      },
    }),
    // The login identity. Generic updates are refused for everyone, including tenant
    // all-record operators: only the signed-in holder changes it (current password, then a link
    // sent to the new mailbox confirms it — requestEmailChange/confirmEmailChange). The change
    // stays synchronized to Member.
    email: text({
      isIndexed: 'unique',
      access: { update: denyAll },
      hooks: {
        resolveInput: ({ resolvedData }) => resolvedData.email === undefined
          ? undefined
          : normalizeAuthIdentity(resolvedData.email),
      },
      validation: {
        isRequired: true,
      },
    }),
    // Only the holder changes a password: with current-password proof (changeMemberPassword) or
    // their own reset link. Generic updates are refused for everyone, staff included.
    password: password({
      access: {
        read: denyAll,
        update: denyAll,
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
      access: { update: noLinkedMember },
      ui: {
        description: "Member phone number",
      },
    }),

    // Legacy free-text emergency contact. Sensitive: never written generically (the member
    // profile's emergency fields carry this now) and cleared with other health/emergency data.
    emergencyContact: text({
      access: { read: ({ session, item }) => Boolean(session?.itemId && (session.itemId === item.id || session.data?.role?.canManageAllRecords)), create: denyAll, update: denyAll },
      ui: {
        description: "Emergency contact name and phone (legacy)",
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
    }),

    // A requested sign-in email change waiting for its link to be opened from the new mailbox.
    pendingEmail: text({
      access: { read: ({ session, item }) => Boolean(session?.itemId && session.itemId === item.id), create: denyAll, update: denyAll },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' }, listView: { fieldMode: 'hidden' } },
    }),
    pendingEmailTokenHash: text({
      access: { read: denyAll, create: denyAll, update: denyAll },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
    }),
    pendingEmailRequestedAt: timestamp({
      access: { read: denyAll, create: denyAll, update: denyAll },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
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
