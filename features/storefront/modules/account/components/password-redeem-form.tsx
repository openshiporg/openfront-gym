"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { redeemPasswordResetAction, type PasswordRedeemState } from "@/features/storefront/lib/actions/password-reset";
import { Banner } from "@/features/storefront/modules/common/ui";

const initialState: PasswordRedeemState = { status: "idle", message: null };

export function PasswordRedeemForm({ email, token, next }: { email: string; token: string; next: string }) {
  const [state, action, pending] = useActionState(redeemPasswordResetAction, initialState);
  return (
    <form action={action} className="sf-form">
      {state.status === "error" ? <Banner tone="bad">{state.message}</Banner> : null}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next} />
      <p className="sf-hint">Account: {email}</p>
      <label className="sf-field">New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <label className="sf-field">Confirm new password<input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <button type="submit" disabled={pending} className="sf-btn" data-size="lg" data-block>
        {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
        {pending ? "Saving…" : "Set password and sign in"}
      </button>
    </form>
  );
}
