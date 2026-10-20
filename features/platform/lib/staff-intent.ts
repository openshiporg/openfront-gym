import { gymGraphql } from "@/features/platform/lib/gym-graphql";
import type { RetryDraft } from "@/features/platform/lib/retry-draft";

/**
 * Server-side journal for staff and member form requests (see keystone StaffIntent). A form's
 * values and key are recorded before its operation is sent; a failed or unacknowledged request
 * is retried from that record, so the retry is byte-for-byte the original. The browser only ever
 * carries the opaque intent id; notes, reasons and amounts never go into the URL.
 */

export type IntentWorkspace = "retail" | "training" | "billing";
type StoredIntent = { id: string; workspace: string; operation: string; scope: string; requestKey: string; form: Record<string, string[]>; status: string; lastError: string; createdAt: string };

const INTENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

function formValues(form: FormData) {
  const values: Record<string, string[]> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value !== "string" || name.startsWith("$ACTION") || name === "intentId") continue;
    (values[name] ||= []).push(value);
  }
  return values;
}

function toFormData(values: Record<string, string[]>) {
  const form = new FormData();
  for (const [name, list] of Object.entries(values)) for (const value of list) form.append(name, value);
  return form;
}

async function readIntent(id: string): Promise<StoredIntent | null> {
  if (!INTENT_ID.test(id)) return null;
  const result = await gymGraphql<{ staffIntent: StoredIntent | null }>(`query StaffIntent($id: ID!) { staffIntent(id: $id) }`, { id });
  return result.success ? result.data.staffIntent : null;
}

/**
 * Opens the request a form submission stands for. A submission that names a retained intent is
 * replaced by that intent's recorded values (the form was locked to it); anything else is recorded
 * as a new intent before the caller sends its operation.
 */
export async function openStaffIntent(workspace: IntentWorkspace, submitted: FormData, keyField = "requestKey") {
  const intentId = String(submitted.get("intentId") || "");
  if (intentId) {
    const stored = await readIntent(intentId);
    if (!stored || stored.status !== "pending" || stored.workspace !== workspace) throw new Error("This saved request is no longer available. Start it again.");
    return { id: stored.id, form: toFormData(stored.form), requestKey: stored.requestKey };
  }
  const requestKey = String(submitted.get(keyField) || "");
  const result = await gymGraphql<{ beginStaffIntent: StoredIntent }>(
    `mutation BeginStaffIntent($workspace: String!, $operation: String!, $scope: String, $requestKey: String!, $form: JSON!) {
      beginStaffIntent(workspace: $workspace, operation: $operation, scope: $scope, requestKey: $requestKey, form: $form)
    }`,
    { workspace, operation: String(submitted.get("operation") || "default"), scope: String(submitted.get("retryScope") || ""), requestKey, form: formValues(submitted) },
  );
  if (!result.success) throw new Error(result.error || "This request couldn't be recorded. Try again.");
  return { id: result.data.beginStaffIntent.id, form: submitted, requestKey };
}

/**
 * Records what the form saw and returns the request's resulting status. A failure keeps the
 * request retained for an exact retry, unless the operation itself already confirmed it (its
 * response was lost on the way back), in which case the status is "succeeded".
 */
export async function settleStaffIntent(id: string, outcome: "failed" | "succeeded" | "abandoned", error?: string) {
  const result = await gymGraphql<{ settleStaffIntent: StoredIntent }>(
    `mutation SettleStaffIntent($id: ID!, $outcome: String!, $error: String) { settleStaffIntent(id: $id, outcome: $outcome, error: $error) }`,
    { id, outcome, error: error ?? null },
  );
  if (!result.success && outcome === "abandoned") throw new Error(result.error || "The request couldn't be discarded");
  return result.success ? result.data.settleStaffIntent.status : "unknown";
}

/** The retained request a page was returned with, as the form's locked retry values. */
export async function loadRetryIntent(id: string | string[] | undefined, workspace: IntentWorkspace): Promise<RetryDraft | undefined> {
  const value = Array.isArray(id) ? id[0] : id;
  if (!value) return undefined;
  const stored = await readIntent(value);
  if (!stored || stored.status !== "pending" || stored.workspace !== workspace) return undefined;
  const values = Object.fromEntries(Object.entries(stored.form).map(([name, list]) => [name, list[0] ?? ""]));
  return { operation: stored.operation, scope: stored.scope, key: stored.requestKey, values, lists: stored.form, intentId: stored.id, lastError: stored.lastError };
}

/** This person's unconfirmed requests in the workspace (for example after a lost response). */
export async function loadPendingIntents(workspace: IntentWorkspace) {
  const result = await gymGraphql<{ myPendingStaffIntents: Array<{ id: string; operation: string; scope: string; lastError: string; createdAt: string }> }>(
    `query PendingStaffIntents($workspace: String!) { myPendingStaffIntents(workspace: $workspace) }`,
    { workspace },
  );
  return result.success ? result.data.myPendingStaffIntents : [];
}
