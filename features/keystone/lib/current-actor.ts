import type { roleCapabilityFields } from "../models/roleCapabilities";

type RoleCapability = (typeof roleCapabilityFields)[number];

/**
 * The actor's authority as it stands now, read inside the caller's transaction AFTER any lock
 * wait and right before privileged writes. The User, Role and Organization rows are share-locked
 * until the transaction ends, so a concurrent revocation, tenant move or suspension either waits
 * for this work to finish or is seen by it — the session snapshot is never trusted on its own.
 */
export async function lockCurrentActor(
  tx: any,
  userId: string,
  organizationId: string,
  capabilities: RoleCapability[],
  options: { requireActiveOrganization?: boolean } = {},
) {
  const users = await tx.$queryRaw`SELECT "id", "organization", "role" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
  const user = Array.isArray(users) ? users[0] : null;
  if (!user || user.organization !== organizationId || !user.role) throw new Error("Your current role does not allow this action");
  const roles = await tx.$queryRaw`SELECT * FROM "Role" WHERE "id" = ${user.role} FOR SHARE`;
  const role = Array.isArray(roles) ? roles[0] : null;
  if (!role || role.organization !== organizationId || !role.canAccessDashboard) throw new Error("Your current role does not allow this action");
  for (const capability of capabilities) {
    if (!role[capability]) throw new Error("Your current role does not allow this action");
  }
  if (options.requireActiveOrganization !== false) await lockActiveOrganization(tx, organizationId);
  return { userId, organizationId, role: role as Record<string, unknown> };
}

/**
 * New activity (a sale, charge, booking or appointment) is admitted only while the tenant is
 * active, read inside the caller's transaction right before its first write. The Organization
 * row stays share-locked until commit, so a suspension either waits for this work or is seen.
 */
export async function lockActiveOrganization(tx: any, organizationId: string) {
  const organizations = await tx.$queryRaw`SELECT "status" FROM "Organization" WHERE "id" = ${organizationId} FOR SHARE`;
  const organization = Array.isArray(organizations) ? organizations[0] : null;
  if (!organization || organization.status !== "active") throw new Error("This organization is not accepting new activity");
}
