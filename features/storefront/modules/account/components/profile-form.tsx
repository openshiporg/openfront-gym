"use client";

import { useActionState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
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
  const inputClass = "h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]";
  const labelClass = "text-[10px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]";

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>Full name</label>
        <input id="name" name="name" defaultValue={user.name} required className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" name="email" type="email" defaultValue={user.email} required className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="phone" className={labelClass}>Phone</label>
        <input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className={labelClass}>New password</label>
        <input id="password" name="password" type="password" placeholder="Leave blank to keep current" minLength={8} className={inputClass} />
      </div>

      {state?.error && <p className="border border-[#ffb4ab]/30 bg-[#93000a]/20 px-3 py-2 text-sm text-[#ffdad6]">{state.error}</p>}
      {state?.success && (
        <p className="flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-[#7df4ff]">
          <CheckCircle2 className="h-4 w-4" /> Profile updated
        </p>
      )}

      <button type="submit" disabled={pending} className="flex h-12 items-center justify-center gap-2 bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-6 text-sm font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95 disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
      </button>
    </form>
  );
}
