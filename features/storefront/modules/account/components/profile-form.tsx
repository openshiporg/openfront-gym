"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updateProfile } from "@/features/storefront/lib/data/user";

interface ProfileFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfile, null);
  const inputClass =
    "h-12 w-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]";
  const labelClass = "text-sm font-medium text-[var(--color-ink)]";

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" defaultValue={user.name} required maxLength={120} autoComplete="name" className={inputClass} />
        </div>
        <div className="space-y-2">
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} maxLength={40} autoComplete="tel" className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" name="email" type="email" defaultValue={user.email} required maxLength={320} autoComplete="email" className={inputClass} />
        <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
          This email is used for sign-in and is mirrored to the linked member profile.
        </p>
      </div>

      <div className="border-t border-[var(--color-rule)] pt-6">
        <div className="space-y-2">
          <label htmlFor="password" className={labelClass}>New password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Leave blank to keep the current password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className={inputClass}
          />
          <p className="text-xs leading-5 text-[var(--color-ink-muted)]">Use 12–128 characters. Existing credentials stay unchanged when blank.</p>
        </div>
      </div>

      {state?.error ? (
        <p className="border border-red-700/25 bg-red-50 px-4 py-3 text-sm text-red-900">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="flex items-center gap-2 border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> Profile updated
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="sf-btn-primary inline-flex min-w-44 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save profile
      </button>
    </form>
  );
}
