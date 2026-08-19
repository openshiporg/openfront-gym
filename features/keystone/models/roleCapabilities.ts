export const roleCapabilityFields = [
  "canCreateRecords",
  "canManageAllRecords",
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManageSettings",
  "canManageAppointments",
  "canManageFacilities",
  "canManagePrograms",
  "canManageCommunications",
  "canManageRetail",
  "canManagePayroll",
  "canViewReports",
  "isInstructor",
] as const;

export function elevatedRoleCapabilities(
  candidate: Record<string, unknown>,
  actor: Record<string, unknown> | null | undefined,
) {
  if (actor?.canManageAllRecords === true) return [];
  return roleCapabilityFields.filter((field) => candidate[field] === true && actor?.[field] !== true);
}
