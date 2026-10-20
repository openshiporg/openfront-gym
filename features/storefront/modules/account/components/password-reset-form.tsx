"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestPasswordResetAction, type PasswordResetState } from "@/features/storefront/lib/actions/password-reset";
import { Banner } from "@/features/storefront/modules/common/ui";

const initialState: PasswordResetState = { status: "idle", message: null };

export function PasswordResetForm({ returnTo = "" }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialState);
  return (
    <form action={action} className="sf-form">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state.status === "sent" ? <Banner tone="ok" title="Check your email">{state.message}</Banner> : null}
      {state.status === "error" ? <Banner tone="bad">{state.message}</Banner> : null}
      <label className="sf-field">Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <button type="submit" disabled={pending} className="sf-btn" data-size="lg" data-block>
        {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
