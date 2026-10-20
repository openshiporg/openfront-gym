"use client";

import Link from "next/link";
import { useState, useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, signUp } from "@/features/storefront/lib/data/user";
import { contactPath } from "@/features/storefront/lib/contact-config";

interface LoginPageProps {
  redirectTo?: string;
  allowSignup?: boolean;
  showHeading?: boolean;
  /** Which tab opens first when sign-up is allowed; new-visitor flows open on "Create account". */
  defaultView?: "signin" | "signup";
  /** Published participation terms a new member accepts with the account. */
  terms?: { policyId: string; version: string } | null;
}

export default function LoginPage({ redirectTo, allowSignup = false, showHeading = false, defaultView = "signin", terms = null }: LoginPageProps) {
  const [view, setView] = useState<"signin" | "signup">(defaultView);
  const [signinError, signinAction, signinPending] = useActionState(login, null);
  const [signupError, signupAction, signupPending] = useActionState(signUp, null);
  const signup = view === "signup" && allowSignup;

  return (
    <div className="sf-auth">
      {showHeading ? <h1 className="sf-h1">{signup ? "Create account" : "Sign in"}</h1> : null}
      {allowSignup ? (
        <div className="sf-seg" role="group" aria-label="Account access">
          {(["signin", "signup"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>
      ) : null}

      {!signup ? (
        <form action={signinAction} className="sf-form">
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <label htmlFor="signin-email" className="sf-field">Email
            <input id="signin-email" name="email" type="email" required autoComplete="email" />
          </label>
          <label htmlFor="signin-password" className="sf-field">Password
            <input id="signin-password" name="password" type="password" required autoComplete="current-password" />
          </label>
          {signinError ? <p role="alert" className="sf-field-error">{signinError}</p> : null}
          <button type="submit" disabled={signinPending} className="sf-btn" data-size="lg" data-block>
            {signinPending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
            {signinPending ? "Signing in…" : "Sign in"}
          </button>
          <div><Link href={redirectTo && redirectTo !== "/account" ? `/forgot-password?returnTo=${encodeURIComponent(redirectTo)}` : "/forgot-password"} className="sf-link" data-size="sm">Forgot password</Link></div>
          {!allowSignup ? (
            <p className="sf-meta">New to the club? <Link href={contactPath("account", redirectTo)} className="sf-link" data-size="sm">Contact us to open an account</Link></p>
          ) : null}
        </form>
      ) : (
        <form action={signupAction} className="sf-form">
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <label htmlFor="signup-name" className="sf-field">Full name
            <input id="signup-name" name="name" required autoComplete="name" />
          </label>
          <label htmlFor="signup-email" className="sf-field">Email
            <input id="signup-email" name="email" type="email" required autoComplete="email" />
          </label>
          <label htmlFor="signup-phone" className="sf-field">Phone (optional)
            <input id="signup-phone" name="phone" type="tel" autoComplete="tel" />
          </label>
          <label htmlFor="signup-password" className="sf-field">Password
            <input id="signup-password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" />
            <small>12–128 characters</small>
          </label>
          {terms ? (
            <>
              <input type="hidden" name="termsPolicyId" value={terms.policyId} />
              <label className="sf-check">
                <input type="checkbox" name="acceptTerms" required />
                <span>I accept the <Link href="/waiver" className="sf-link" target="_blank">participation terms</Link> (version {terms.version})</span>
              </label>
            </>
          ) : null}
          {signupError ? <p role="alert" className="sf-field-error">{signupError}</p> : null}
          {signupError?.includes("already exists") ? (
            <div className="sf-actions">
              <button type="button" className="sf-btn" data-variant="secondary" onClick={() => setView("signin")}>Sign in</button>
              <Link href={redirectTo && redirectTo !== "/account" ? `/forgot-password?returnTo=${encodeURIComponent(redirectTo)}` : "/forgot-password"} className="sf-link" data-size="sm">Forgot password</Link>
            </div>
          ) : null}
          <button type="submit" disabled={signupPending} className="sf-btn" data-size="lg" data-block>
            {signupPending ? <Loader2 className="sf-spin" aria-hidden="true" /> : null}
            {signupPending ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}
