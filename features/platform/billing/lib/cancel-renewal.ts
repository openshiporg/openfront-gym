/** Validates a staff "Cancel renewal" submission before it is sent to the provider. */
export type CancelRenewalInput = { membershipId: string; reason: string; idempotencyKey: string };

export function parseCancelRenewalForm(form: { get(name: string): unknown }): CancelRenewalInput {
  const membershipId = String(form.get("membershipId") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  const idempotencyKey = String(form.get("idempotencyKey") ?? "");
  if (!membershipId) throw new Error("Choose the membership to cancel");
  if (form.get("confirmCancelRenewal") !== "yes") throw new Error("Confirm that renewal ends after the current paid period");
  if (reason.length < 3 || reason.length > 500) throw new Error("Give a reason between 3 and 500 characters");
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("This form is missing its request key; reload the page");
  return { membershipId, reason, idempotencyKey };
}
