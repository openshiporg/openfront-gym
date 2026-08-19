const BOUNDED_MEMBER_PERMISSIONS = {
  canCreateRecords: false,
  canManageAllRecords: false,
  canSeeOtherPeople: false,
  canEditOtherPeople: false,
  canManagePeople: false,
  canManageRoles: false,
  canAccessDashboard: false,
  canManageOnboarding: false,
  canManageSettings: false,
  canManageAppointments: false,
  canManageFacilities: false,
  canManagePrograms: false,
  canManageCommunications: false,
  canManageRetail: false,
  canManagePayroll: false,
  canViewReports: false,
  isInstructor: false,
} as const;

/** Public registration and operator invitations must never inherit a stale or
 * customized elevated role merely because it is named "Member". */
export async function ensureBoundedMemberRole(context: any, organizationId: string) {
  const sudo = context.sudo();
  const roles = await sudo.query.Role.findMany({
    where: {
      AND: [
        { organization: { id: { equals: organizationId } } },
        { name: { equals: "Member" } },
      ],
    },
    take: 1,
    query: "id",
  });
  if (roles[0]) {
    return sudo.query.Role.updateOne({
      where: { id: (roles[0] as any).id },
      data: BOUNDED_MEMBER_PERMISSIONS,
      query: "id",
    });
  }
  return sudo.query.Role.createOne({
    data: {
      organization: { connect: { id: organizationId } },
      name: "Member",
      ...BOUNDED_MEMBER_PERMISSIONS,
    },
    query: "id",
  });
}
