export type InstructorTool = {
  label: string;
  href: string;
  icon: "users" | "external" | "calendar" | "graduation";
};

export function instructorTools(role?: {
  canAccessDashboard?: boolean | null;
  canManageAllRecords?: boolean | null;
  canViewReports?: boolean | null;
} | null): InstructorTool[] {
  if (!role?.canAccessDashboard) return [];
  const tools: InstructorTool[] = [
    { label: "Scheduling center", href: "/dashboard/platform/scheduling", icon: "calendar" },
  ];
  if (role.canManageAllRecords) {
    tools.unshift({ label: "Live rosters", href: "/dashboard/platform/rosters", icon: "users" });
    tools.push({ label: "Instructor profile", href: "/dashboard/platform/instructors", icon: "graduation" });
  }
  if (role.canViewReports || role.canManageAllRecords) {
    tools.push({ label: "Operations reports", href: "/dashboard/platform/reports", icon: "external" });
  }
  return tools;
}
