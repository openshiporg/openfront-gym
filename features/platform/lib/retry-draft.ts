/**
 * The retained request a failed or unconfirmed staff form returns with (loaded server-side from
 * its StaffIntent; see staff-intent.ts). Resubmitting it is the same request: the form is locked
 * to the recorded values and key, and the server replays a committed result for that key.
 */
export type RetryDraft = {
  operation: string;
  scope: string;
  key: string;
  values: Record<string, string>;
  lists?: Record<string, string[]>;
  intentId?: string;
  lastError?: string;
};

function matches(retry: RetryDraft | undefined, operation: string, scope: string) {
  return Boolean(retry && retry.operation === operation && retry.scope === scope);
}

/** The key a form renders: the retained one for the same operation and record, otherwise a fresh one. */
export function retryKeyFor(retry: RetryDraft | undefined, operation: string, scope = "", fresh: () => string) {
  return matches(retry, operation, scope) ? retry!.key : fresh();
}

/** The retained value of `field` for the same operation and record. */
export function retryValue(retry: RetryDraft | undefined, operation: string, field: string, scope = "") {
  return matches(retry, operation, scope) ? retry!.values[field] : undefined;
}

/** Every retained value of a repeated field (for example one per returned line). */
export function retryList(retry: RetryDraft | undefined, operation: string, field: string, scope = "") {
  return matches(retry, operation, scope) ? retry!.lists?.[field] ?? [] : [];
}

/** The retained intent this form is locked to, if it is the form the request came from. */
export function retryIntentFor(retry: RetryDraft | undefined, operation: string, scope = "") {
  return matches(retry, operation, scope) ? retry!.intentId : undefined;
}
