import { Button } from "@/components/ui/button";
import { Notice } from "@/features/platform/components/platform-ui";
import { discardStaffIntentAction } from "@/features/platform/lib/intent-actions";
import type { RetryDraft } from "@/features/platform/lib/retry-draft";

// Routing fields a form posts for itself; they aren't part of what the person entered.
const SYSTEM_FIELDS = new Set(["operation", "requestKey", "idempotencyKey", "retryScope", "surface", "timeZone", "cart", "quoteToken", "reviewedTotal", "settledAmount", "itemId"]);

function fieldLabel(name: string) {
  const text = name.replace(/^restock:.*/, "Restock").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_:-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Shown in place of a form's inputs while its earlier request is retained: exactly what will be
 * sent again, with the same key, and an explicit discard for a request known not to be recorded.
 * The values come from the server-side record of the request, never from the URL.
 */
export function RetainedRequestNotice({ retry, summary }: { retry: RetryDraft; summary?: React.ReactNode }) {
  const entries = Object.entries(retry.lists || {}).filter(([name, values]) => !SYSTEM_FIELDS.has(name) && values.some(Boolean));
  return (
    <Notice tone="warning" title="This request wasn't confirmed">
      <p>{retry.lastError ? `${retry.lastError} ` : ""}Retry sends exactly the same request again; it is never applied twice.</p>
      {summary ?? (entries.length ? (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_minmax(0,1fr)]">
          {entries.map(([name, values]) => (
            <div key={name} className="contents">
              <dt className="text-muted-foreground">{fieldLabel(name)}</dt>
              <dd className="whitespace-pre-wrap break-words">{values.filter(Boolean).join(", ")}</dd>
            </div>
          ))}
        </dl>
      ) : null)}
    </Notice>
  );
}

/** Discard control for a retained request; rendered outside the form it belongs to. */
export function DiscardRetainedRequest({ intentId, returnTo }: { intentId: string; returnTo: string }) {
  return (
    <form action={discardStaffIntentAction} className="flex justify-end">
      <input type="hidden" name="intentId" value={intentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" variant="ghost" size="sm">Discard: it wasn’t recorded</Button>
    </form>
  );
}
