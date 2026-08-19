"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  inviteMemberAction,
  type InviteMemberState,
} from "../actions/members";

const initialState: InviteMemberState = {
  status: "idle",
  message: null,
  email: null,
};

export function MemberInviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-sm font-semibold">Invite a member</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Creates an inactive-billing member profile with an unknown random password and sends a secure password-setup email. The member chooses a paid plan after sign-in.
        </p>
      </div>

      {state.message ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            state.status === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <form action={action} className="grid gap-3 md:grid-cols-[1fr_1.25fr_1fr_auto]">
        <Input name="name" required maxLength={120} placeholder="Full name" />
        <Input name="email" required type="email" maxLength={254} placeholder="Email" />
        <Input name="phone" maxLength={40} placeholder="Phone (optional)" />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create and invite"}
        </Button>
      </form>
    </div>
  );
}
