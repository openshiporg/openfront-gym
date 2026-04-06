import { redirect } from "next/navigation";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";

export type DashboardUser = {
  id: string;
  email: string;
  name: string;
  role?: {
    canAccessDashboard?: boolean;
    canManageAllRecords?: boolean;
    canManageSettings?: boolean;
    canManageOnboarding?: boolean;
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
          role {
            canAccessDashboard
            canManageAllRecords
            canManageSettings
            canManageOnboarding
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

export async function requireSettingsManager() {
  const user = await requireDashboardUser();

  if (!user.role?.canManageSettings && !user.role?.canManageAllRecords) {
    redirect("/dashboard/no-access");
  }

  return user;
}
