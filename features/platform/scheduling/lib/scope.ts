export function schedulingWorkspaceOptions(user: {
  id: string;
  role?: { isInstructor?: boolean | null; canManageAllRecords?: boolean | null } | null;
}) {
  const canManageWorkspace = Boolean(user.role?.canManageAllRecords);
  const isInstructorOnly = Boolean(user.role?.isInstructor && !canManageWorkspace);
  return {
    canManageWorkspace,
    isInstructorOnly,
    userId: isInstructorOnly ? user.id : undefined,
  };
}
