"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

const PATHS = { retail: "/dashboard/platform/retail", training: "/dashboard/platform/training" } as const;
const ACTIONS = ["open", "status", "cancel", "refund", "retry"] as const;
const DONE: Record<(typeof ACTIONS)[number], string> = {
  open: "Card checkout reopened",
  status: "Card payment checked with Stripe",
  cancel: "Card checkout cancelled and its hold released",
  refund: "Refund to the card requested",
  retry: "Fulfilment retried",
};

/** Staff follow-up on one counter card payment: check, reopen, cancel, refund or retry fulfilment. */
export async function counterPaymentAction(form: FormData): Promise<void> {
  const surface = form.get("surface") === "retail" ? "retail" : "training";
  const path = PATHS[surface];
  const action = String(form.get("action") || "") as (typeof ACTIONS)[number];
  let message = "";
  let checkoutUrl: string | null = null;
  try {
    if (!ACTIONS.includes(action)) throw new Error("Unknown card payment action");
    const attemptId = String(form.get("attemptId") || "") || null;
    const checkoutSessionId = String(form.get("checkoutSessionId") || "") || null;
    const result = await keystoneClient<{ reconcileCounterPayment: any }>(
      `mutation CounterPayment($attemptId: ID, $checkoutSessionId: String, $action: String!) { reconcileCounterPayment(attemptId: $attemptId, checkoutSessionId: $checkoutSessionId, action: $action) }`,
      { attemptId, checkoutSessionId, action: action === "open" ? "status" : action },
    );
    if (!result.success) throw new Error(staffActionError(result, "Card payment could not be checked. Try again."));
    const view = result.data.reconcileCounterPayment || {};
    checkoutUrl = action === "open" ? view.checkoutUrl || null : null;
    message = view.status === "exception"
      ? "Paid but not fulfilled. Retry fulfilment or refund it to the card."
      : view.status === "fulfilled"
        ? surface === "retail" ? "Card sale recorded" : "Card package recorded"
        : view.status === "refunded"
          ? "Refund to the card confirmed"
          : view.status === "refund_failed"
            ? "Stripe reported the refund as failed, so nothing was refunded. Start the refund again from the original payment."
            : action === "cancel" && (view.status === "reserved" || view.status === "open")
              ? view.lastError || "The hold is still in place until Stripe confirms the checkout can't be paid."
              : view.status === "refund_pending"
                ? "Refund to the card requested. It isn't confirmed yet; check with Stripe again shortly."
                : DONE[action];
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Card payment could not be checked")}`);
  }
  if (checkoutUrl) redirect(checkoutUrl);
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
