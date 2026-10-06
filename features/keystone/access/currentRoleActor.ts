import { getTenantId } from "./tenantPolicy";

/** Resolve mutable capabilities from the current User→Role relationship, not a stateless-session snapshot. */
export async function currentRoleActor(context: any) {
  const session = context.session as any;
  const organizationId = getTenantId(session);
  if (!session?.itemId || !organizationId) throw new Error("Organization session required");

  const user = await context.query.User.findOne({
    where: { id: session.itemId },
    query: "id organization { id } role { id canManageAllRecords canManagePeople canManageCheckIns canManageFacilities isInstructor organization { id } }",
  });
  if (!user || user.organization?.id !== organizationId || (user.role && user.role.organization?.id !== organizationId)) {
    throw new Error("Actor organization mismatch");
  }

  const role = user.role;
  return {
    userId: session.itemId,
    organizationId,
    canManageAllRecords: Boolean(role?.canManageAllRecords),
    canManagePeople: Boolean(role?.canManagePeople),
    canManageCheckIns: Boolean(role?.canManageCheckIns),
    canManageFacilities: Boolean(role?.canManageFacilities),
    isInstructor: Boolean(role?.isInstructor),
  };
}
