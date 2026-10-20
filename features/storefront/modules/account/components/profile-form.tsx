"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { changePassword, requestEmailChangeAction, updateProfile, type EmailChangeState } from "@/features/storefront/lib/data/user";
import { Banner } from "@/features/storefront/modules/common/ui";

interface ProfileFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    pendingEmail?: string | null;
    phone?: string | null;
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <div className="sf-stack">
      <form action={action} className="sf-form">
        <div className="sf-form-row">
          <label htmlFor="name" className="sf-field">Full name
            <input id="name" name="name" defaultValue={user.name} required maxLength={120} autoComplete="name" />
          </label>
          <label htmlFor="phone" className="sf-field">Phone
            <input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} maxLength={40} autoComplete="tel" />
          </label>
        </div>

        <div className="sf-field">Sign-in email
          <p className="sf-num">{user.email}</p>
          {user.pendingEmail ? <small>Waiting for you to open the confirmation link sent to {user.pendingEmail}.</small> : <small>Change it below; the new address is confirmed from its own inbox.</small>}
        </div>

        {state?.error ? <Banner tone="bad">{state.error}</Banner> : null}
        {state?.success ? <Banner tone="ok">Profile saved</Banner> : null}

        <div>
          <button type="submit" disabled={pending} className="sf-btn">
            {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
            {pending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
      <EmailForm />
      <PasswordForm />
    </div>
  );
}

const initialEmailState: EmailChangeState = { status: "idle", message: null };

function EmailForm() {
  const [state, action, pending] = useActionState(requestEmailChangeAction, initialEmailState);
  return (
    <form action={action} className="sf-form" aria-labelledby="change-email">
      <h2 id="change-email" className="sf-h3">Change sign-in email</h2>
      <div className="sf-form-row">
        <label htmlFor="new-email" className="sf-field">New email
          <input id="new-email" name="newEmail" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <label htmlFor="email-current-password" className="sf-field">Current password
          <input id="email-current-password" name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" />
        </label>
      </div>
      {state.status === "error" ? <Banner tone="bad">{state.message}</Banner> : null}
      {state.status === "requested" ? <Banner tone="ok" title="Check the new inbox">{state.message}</Banner> : null}
      <div>
        <button type="submit" disabled={pending} className="sf-btn" data-variant="secondary">
          {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
          {pending ? "Sending…" : "Send confirmation link"}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="sf-form" aria-labelledby="change-password">
      <h2 id="change-password" className="sf-h3">Change password</h2>
      <label htmlFor="current-password" className="sf-field">Current password
        <input id="current-password" name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" />
      </label>
      <div className="sf-form-row">
        <label htmlFor="new-password" className="sf-field">New password
          <input id="new-password" name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
          <small>12–128 characters.</small>
        </label>
        <label htmlFor="confirm-password" className="sf-field">Confirm new password
          <input id="confirm-password" name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
      </div>
      {state?.error ? <Banner tone="bad">{state.error}</Banner> : null}
      {state?.success ? <Banner tone="ok">Password changed</Banner> : null}
      <div>
        <button type="submit" disabled={pending} className="sf-btn" data-variant="secondary">
          {pending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
          {pending ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
