"use client";

import { useState, useActionState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { login, signUp } from "@/features/storefront/lib/data/user";

interface LoginPageProps {
  redirectTo?: string;
}

export default function LoginPage({ redirectTo }: LoginPageProps) {
  const [view, setView] = useState<"signin" | "signup">("signup");
  const [signinError, signinAction, signinPending] = useActionState(login, null);
  const [signupError, signupAction, signupPending] = useActionState(signUp, null);

  const inputClass = "h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]";
  const labelClass = "text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]";

  return (
    <div className="w-full text-[#e5e2e1]">
      <div className="mb-7 flex border-b border-white/10">
        {(["signup", "signin"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 border-b-2 pb-3 text-sm font-bold uppercase tracking-[0.18em] transition-colors ${
              view === v ? "border-[#ffb59e] text-[#ffb59e]" : "border-transparent text-[#c4c7c7] hover:text-white"
            }`}
          >
            {v === "signup" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      {view === "signin" ? (
        <form action={signinAction} className="space-y-4">
          {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
          <div className="space-y-1.5">
            <label htmlFor="signin-email" className={labelClass}>Email</label>
            <input id="signin-email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signin-password" className={labelClass}>Password</label>
            <input id="signin-password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </div>
          {signinError && <p className="border border-[#ffb4ab]/30 bg-[#93000a]/20 px-3 py-2 text-sm text-[#ffdad6]">{signinError}</p>}
          <button type="submit" disabled={signinPending} className="mt-2 flex h-12 w-full items-center justify-center gap-2 bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] text-sm font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95 disabled:opacity-50">
            {signinPending && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
          </button>
        </form>
      ) : (
        <form action={signupAction} className="space-y-4">
          {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className={labelClass}>Full name</label>
            <input id="signup-name" name="name" placeholder="Jane Smith" required autoComplete="name" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-email" className={labelClass}>Email</label>
            <input id="signup-email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-phone" className={labelClass}>Phone</label>
            <input id="signup-phone" name="phone" type="tel" placeholder="(555) 000-0000" autoComplete="tel" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signup-password" className={labelClass}>Password</label>
            <input id="signup-password" name="password" type="password" minLength={8} required autoComplete="new-password" className={inputClass} />
          </div>
          {signupError && <p className="border border-[#ffb4ab]/30 bg-[#93000a]/20 px-3 py-2 text-sm text-[#ffdad6]">{signupError}</p>}
          <ul className="space-y-2 pt-1">
            {["Facility access starts with your plan", "Class entitlement depends on tier", "Billing is handled securely by Stripe"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[#c4c7c7]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#7df4ff]" />
                {t}
              </li>
            ))}
          </ul>
          <button type="submit" disabled={signupPending} className="mt-2 flex h-12 w-full items-center justify-center gap-2 bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] text-sm font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95 disabled:opacity-50">
            {signupPending && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </button>
        </form>
      )}
    </div>
  );
}
