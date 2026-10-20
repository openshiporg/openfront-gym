import { redirect } from "next/navigation";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";

export type DashboardUser = {
  id: string;
  email: string;
  name: string;
  organization?: { id: string } | null;
  role?: {
    canAccessDashboard?: boolean;
    canManageAllRecords?: boolean;
    canManageSettings?: boolean;
    canManageOnboarding?: boolean;
    canManageCheckIns?: boolean;
    canManageFacilities?: boolean;
    canViewReports?: boolean;
    canManagePeople?: boolean;
    canSeeOtherPeople?: boolean;
    canEditOtherPeople?: boolean;
    canManageRetail?: boolean;
    canManageAppointments?: boolean;
    canManagePrograms?: boolean;
    isInstructor?: boolean;
  } | null;
} | null;

export async function getDashboardUser(): Promise<DashboardUser> {
  const query = `
    query DashboardCurrentUser {
      authenticatedItem {
        ... on User {
          id
          email
          name
          organization { id }
          role {
            canAccessDashboard
            canManageAllRecords
            canManageSettings
            canManageOnboarding
            canManageCheckIns
            canManageFacilities
            canViewReports
            canManagePeople
            canSeeOtherPeople
            canEditOtherPeople
            canManageRetail
            canManageAppointments
            canManagePrograms
            isInstructor
          }
        }
      }
    }
  `;

  const response = await keystoneClient<{ authenticatedItem: DashboardUser }>(query);
  if (!response.success) return null;
  return response.data?.authenticatedItem ?? null;
}

export async function requireDashboardUser() {
  const user = await getDashboardUser();

  if (!user) {
    redirect("/dashboard/signin");
  }

  if (!user.role?.canAccessDashboard) {
    redirect("/dashboard/no-access");
  }

  return user;
}

export async function requireDashboardManager() {
  const user = await requireDashboardUser();

  if (!user.role?.canManageAllRecords) {
    redirect("/dashboard/no-access");
  }

  return user;
}

/** People directory and recovery: scoped people staff, not only global operators. */
export async function requirePeopleManager() {
  const user = await requireDashboardUser();
  const role = user.role;
  if (!role?.canManageAllRecords && !role?.canManagePeople && !role?.canSeeOtherPeople && !role?.canEditOtherPeople) {
    redirect("/dashboard/no-access");
  }
  return user;
}

export async function requireReportsViewer() {
  const user = await requireDashboardUser();

  if (!user.role?.canViewReports && !user.role?.canManageAllRecords) {
    redirect("/dashboard/no-access");
  }

  return user;
}

export async function requireSettingsManager() {
  const user = await requireDashboardUser();

  if (!user.role?.canManageSettings && !user.role?.canManageAllRecords) {
    redirect("/dashboard/no-access");
  }

  return user;
}
