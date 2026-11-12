/**
 * Dashboard list links follow the session's own access: a list the role cannot query, or that only
 * shows the person's own rows, is hidden from the Models nav and home; Create and Delete are hidden
 * when the list's operation access refuses them. Keystone's defaults only check static config.
 */

type RoleFlags = Record<string, unknown> | null | undefined;
type UiArgs = { session?: any; context: any };

/** Lists a non-operator staff role works in, by the capability that scopes its rows to the tenant. */
export const STAFF_LIST_CAPABILITIES: Record<string, string[]> = {
  Member: ["canSeeOtherPeople", "canEditOtherPeople", "canManagePeople"],
  User: ["canSeeOtherPeople", "canEditOtherPeople", "canManagePeople"],
  MemberImportRecord: ["canManagePeople"],
  TrainingLead: ["canManagePeople"],
  Role: ["canManageRoles"],
  Organization: ["canManageSettings"],
  CheckIn: ["canManageCheckIns", "canManageFacilities"],
  GymResource: ["canManageFacilities"],
  ContactMessage: ["canManageCommunications"],
  GiftCard: ["canManageRetail"],
  RetailItem: ["canManageRetail"],
  RetailSale: ["canManageRetail"],
  RetailReturn: ["canManageRetail"],
  RetailStockEntry: ["canManageRetail"],
  RetailClose: ["canManageRetail"],
  TrainerAppointment: ["canManageAppointments", "isInstructor"],
  TrainerAvailability: ["canManageAppointments", "isInstructor"],
  TrainingPackage: ["canManageAppointments"],
  TrainingCreditEntry: ["canManageAppointments"],
  CoachingAssignment: ["canManagePrograms", "isInstructor"],
  ClassSchedule: ["isInstructor"],
  ClassInstance: ["isInstructor"],
  ClassBooking: ["isInstructor"],
  AttendanceRecord: ["isInstructor"],
};

export function staffCanUseList(listKey: string, role: RoleFlags) {
  if (!role) return false;
  if (role.canManageAllRecords === true) return true;
  return (STAFF_LIST_CAPABILITIES[listKey] ?? []).some((flag) => role[flag] === true);
}

async function operationAllowed(listKey: string, access: any, operation: "query" | "create" | "delete", args: UiArgs) {
  const check = typeof access === "function" ? access : access?.operation?.[operation];
  if (typeof check !== "function") return true;
  return Boolean(await check({ ...args, listKey, operation }));
}

async function configured(value: unknown, args: UiArgs) {
  return typeof value === "function" ? Boolean(await value(args)) : Boolean(value);
}

export function withSessionListUi(models: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(models).map(([listKey, config]) => {
    const ui = config.ui ?? {};
    return [listKey, {
      ...config,
      ui: {
        ...ui,
        isHidden: async (args: UiArgs) =>
          (await configured(ui.isHidden, args))
          || !staffCanUseList(listKey, args.session?.data?.role)
          || !(await operationAllowed(listKey, config.access, "query", args)),
        hideCreate: async (args: UiArgs) =>
          (await configured(ui.hideCreate, args)) || !(await operationAllowed(listKey, config.access, "create", args)),
        hideDelete: async (args: UiArgs) =>
          (await configured(ui.hideDelete, args)) || !(await operationAllowed(listKey, config.access, "delete", args)),
      },
    }];
  }));
}
