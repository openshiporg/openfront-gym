"use client";

import { useState, useActionState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { login, signUp } from "@/features/storefront/lib/data/user";

interface LoginPageProps {
  redirectTo?: string;
  allowSignup?: boolean;
}

export default function LoginPage({ redirectTo, allowSignup = false }: LoginPageProps) {
  const [view, setView] = useState<"signin" | "signup">(allowSignup ? "signup" : "signin");
  const [signinError, signinAction, signinPending] = useActionState(login, null);
  const [signupError, signupAction, signupPending] = useActionState(signUp, null);

  const inputClass =
    "h-12 w-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]";
  const labelClass = "text-sm font-medium text-[var(--color-ink-muted)]";

  return (
    <div className="w-full">
      <div className="mb-7 flex border-b border-[var(--color-rule)]">
        {(allowSignup ? (["signup", "signin"] as const) : (["signin"] as const)).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 border-b-2 pb-3 text-sm font-medium transition-colors ${
              view === v
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {v === "signup" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      {view === "signin" || !allowSignup ? (
        <form action={signinAction} className="space-y-4">
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <div className="space-y-1.5">
            <label htmlFor="signin-email" className={labelClass}>
              Email
            </label>
            <input id="signin-email" name="email" type="email" placeholder="member@kineticperformance.club" required autoComplete="email" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signin-password" className={labelClass}>
              Password
            </label>
            <input id="signin-password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </div>
          {signinError ? <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{signinError}</p> : null}
          <button type="submit" disabled={signinPending} className="sf-btn-primary mt-2 flex h-12 w-full items-center justify-center gap-2 disabled:opacity-50">
            {signinPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in
          </button>
        </form>
      ) : (
        <form action={signupAction} className="space-y-4">
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className={labelClass}>
              Full name
            </label>
            <input id="signup-name" name="name" placeholder="Maya Patel" required autoComplete="name" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-email" className={labelClass}>
              Email
            </label>
            <input id="signup-email" name="email" type="email" placeholder="member@kineticperformance.club" required autoComplete="email" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-phone" className={labelClass}>
              Phone
            </label>
            <input id="signup-phone" name="phone" type="tel" placeholder="(555) 000-0000" autoComplete="tel" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-password" className={labelClass}>
              Password
            </label>
            <input id="signup-password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" className={inputClass} />
            <p className="text-xs text-[var(--color-ink-muted)]">Use 12–128 characters.</p>
          </div>
          {signupError ? <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{signupError}</p> : null}
          <ul className="space-y-2 pt-1">
            {["Facility access starts with your plan", "Class entitlement depends on tier", "Billing is handled securely by Stripe"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                {t}
              </li>
            ))}
          </ul>
          <button type="submit" disabled={signupPending} className="sf-btn-primary mt-2 flex h-12 w-full items-center justify-center gap-2 disabled:opacity-50">
            {signupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create account
          </button>
        </form>
      )}
    </div>
  );
}
