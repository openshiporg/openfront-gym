import { currentRoleActor } from "./currentRoleActor";

/** Front-desk authority uses the current role, not a stateless-session snapshot. */
export async function currentCheckInActor(context: any) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords && !actor.canManageFacilities && !actor.canManageCheckIns) {
    throw new Error("Facility check-in management permission required");
  }
  return actor;
}
