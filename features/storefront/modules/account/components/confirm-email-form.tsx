"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { confirmEmailChangeAction, type EmailConfirmState } from "@/features/storefront/lib/data/user";
import { Banner } from "@/features/storefront/modules/common/ui";

const initialState: EmailConfirmState = { status: "idle", message: null };

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmEmailChangeAction, initialState);
  return (
    <form action={action} className="sf-form">
      <input type="hidden" name="token" value={token} />
      <p>Confirm to make this address your sign-in email. Your old address gets a notice that it changed.</p>
      {state.status === "error" ? <Banner tone="bad">{state.message}</Banner> : null}
      <div>
        <button type="submit" disabled={pending} className="sf-btn">
          {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
          {pending ? "Confirming…" : "Confirm new email"}
        </button>
      </div>
    </form>
  );
}
