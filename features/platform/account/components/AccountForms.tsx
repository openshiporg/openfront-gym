"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldInput, FormField, Notice } from "@/features/platform/components/platform-ui";
import { changeOwnPasswordAction, confirmOwnEmailChangeAction, requestOwnEmailChangeAction, type AccountFormState } from "../actions/account";

const idle: AccountFormState = { status: "idle", message: null };

function Outcome({ state }: { state: AccountFormState }) {
  if (!state.message) return null;
  return <Notice tone={state.status === "error" ? "danger" : "positive"}>{state.message}</Notice>;
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, idle);
  return (
    <form action={action} className="grid gap-4">
      <FormField label="Current password"><FieldInput name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="New password" hint="12–128 characters"><FieldInput name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></FormField>
        <FormField label="Confirm new password"><FieldInput name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></FormField>
      </div>
      <Outcome state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Changing…" : "Change password"}</Button></div>
    </form>
  );
}

export function EmailForm() {
  const [state, action, pending] = useActionState(requestOwnEmailChangeAction, idle);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="New email"><FieldInput name="newEmail" type="email" required maxLength={254} autoComplete="email" /></FormField>
        <FormField label="Current password"><FieldInput name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" /></FormField>
      </div>
      <Outcome state={state} />
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? "Sending…" : "Send confirmation link"}</Button></div>
    </form>
  );
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmOwnEmailChangeAction, idle);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">Confirm to make this address your sign-in email. Your old address gets a notice that it changed.</p>
      <Outcome state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Confirming…" : "Confirm new email"}</Button></div>
    </form>
  );
}
