import { GraphQLError, Kind, getOperationAST } from "graphql";
import type { Plugin } from "graphql-yoga";

/**
 * A suspended organization keeps sign-in, account recovery, read access to its history, and
 * reconciliation of payments that already exist; every other mutation (new bookings, sales,
 * check-ins, catalog and settings edits, new charges) is refused at this one boundary, for
 * dashboard and storefront callers alike. Public and partner entry points check the tenant
 * status themselves, and the services that start new activity re-check it under a row lock
 * (lockActiveOrganization) in the transaction that writes it.
 */
const ALLOWED_WHILE_SUSPENDED = new Set([
  "authenticateUserWithPassword",
  "endSession",
  "sendUserPasswordResetLink",
  "redeemUserPasswordResetToken",
  "changeMemberPassword",
  "completeMembershipCheckout",
  "cancelMembership",
  "getStripeBillingPortal",
  "refundGymPayment",
  "replayPaymentEvent",
  "reconcileCounterPayment",
  "markPaymentRecoveryContacted",
  // Recording and resolving a form request is not new activity; the operation itself is checked.
  "beginStaffIntent",
  "settleStaffIntent",
  // Contacting the club stays open.
  "submitContactForm",
  // Its resolver admits only a member's own privacy request and withdrawals while suspended.
  "runOperationsCommand",
]);

// Fields that can change a tenant's status. They must be the only field in their document, so a
// suspension can never be followed by other work admitted under the pre-suspension session.
const TENANT_STATUS_FIELDS = new Set(["updateOrganization", "updateOrganizations", "deleteOrganization", "deleteOrganizations"]);

function mutationFields(document: any, operationName: string | null | undefined) {
  const operation = getOperationAST(document, operationName);
  if (operation?.operation !== "mutation") return null;
  return operation.selectionSet.selections.map((selection) => selection.kind === Kind.FIELD ? selection.name.value : "");
}

export function tenantStatusMixError(document: any, operationName: string | null | undefined) {
  const fields = mutationFields(document, operationName);
  if (!fields || fields.length < 2 || !fields.some((name) => TENANT_STATUS_FIELDS.has(name))) return undefined;
  return new GraphQLError("Send an organization update on its own, without other changes in the same request.");
}

export function suspendedTenantMutationError(document: any, operationName: string | null | undefined, session: any) {
  if (session?.data?.organization?.status !== "suspended") return undefined;
  const fields = mutationFields(document, operationName);
  if (!fields) return undefined;
  if (fields.length && fields.every((name) => ALLOWED_WHILE_SUSPENDED.has(name))) return undefined;
  return new GraphQLError("This organization is suspended. New activity is paused; sign-in, history and payment reconciliation remain available.");
}

export const suspendedTenantPlugin: Plugin = {
  onExecute({ args, setResultAndStopExecution }) {
    const error = tenantStatusMixError(args.document, args.operationName)
      || suspendedTenantMutationError(args.document, args.operationName, (args.contextValue as any)?.session);
    if (error) setResultAndStopExecution({ errors: [error] });
  },
};

/** For entry points without a signed-in session (kiosk): the tenant must be active. */
export async function assertActiveOrganization(context: any, organizationId: string) {
  const organization = await context.sudo().query.Organization.findOne({ where: { id: organizationId }, query: "id status" });
  if (!organization || organization.status !== "active") throw new Error("This organization is not accepting new activity");
}
