export type InstructorTool = {
  label: string;
  href: string;
  icon: "users" | "external" | "calendar" | "graduation";
};

/** Dashboard tools shown on the storefront coach page; each mirrors its destination's own permission. */
export function instructorTools(role?: {
  canAccessDashboard?: boolean | null;
  canManageAllRecords?: boolean | null;
  canViewReports?: boolean | null;
  isInstructor?: boolean | null;
} | null): InstructorTool[] {
  if (!role?.canAccessDashboard) return [];
  const tools: InstructorTool[] = [
    { label: "Scheduling center", href: "/dashboard/platform/scheduling", icon: "calendar" },
  ];
  // Rosters admit dashboard instructors for their own sessions and operators for all.
  if (role.canManageAllRecords || role.isInstructor) tools.unshift({ label: "Live rosters", href: "/dashboard/platform/rosters", icon: "users" });
  if (role.canManageAllRecords) {
    tools.push({ label: "Instructor profile", href: "/dashboard/platform/instructors", icon: "graduation" });
  }
  if (role.canViewReports || role.canManageAllRecords) {
    tools.push({ label: "Operations reports", href: "/dashboard/platform/reports", icon: "external" });
  }
  return tools;
}
