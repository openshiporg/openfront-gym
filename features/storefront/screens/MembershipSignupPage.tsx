"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ShieldCheck, Zap, ArrowRight, Lock, Loader2 } from "lucide-react"
import { Logo } from "@/features/dashboard/components/Logo"
import { signUp } from "@/features/dashboard/actions/auth"
import { createMembershipCheckout } from "@/features/integrations/payment/stripe"

const tiers = {
  basic: { name: "Basic", monthlyPrice: 49, annualPrice: 470, desc: "Standard lab access & equipment." },
  premium: { name: "Premium", monthlyPrice: 89, annualPrice: 850, desc: "Unlimited classes & biometric tracking." },
  unlimited: { name: "Unlimited", monthlyPrice: 149, annualPrice: 1430, desc: "All-access, recovery vault & PT sessions." },
}

type TierId = keyof typeof tiers

export function MembershipSignupPage({ tier = "premium" }: { tier?: string }) {
  const router = useRouter()
  const selectedTier = tiers[tier as TierId] || tiers.premium
  const tierId = (tier as TierId) in tiers ? (tier as TierId) : "premium"

  const [isLoading, setIsLoading] = useState(false)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

  const price = billingCycle === "monthly"
    ? selectedTier.monthlyPrice
    : selectedTier.annualPrice

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // 1. Create User via Server Action
      const submitData = new FormData()
      submitData.append("email", formData.email)
      submitData.append("password", formData.password)
      submitData.append("from", `/checkout/payment?tier=${tierId}&cycle=${billingCycle}`)

      // Mocking the signUp return to simulate the flow
      // In real scenario, signUp redirects on success
      await createMembershipCheckout(tierId, billingCycle)
      
      // Redirect to simulated payment page
      router.push(`/dashboard/platform/billing`)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-violet-500/30">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left: Design/Marketing */}
        <div className="hidden lg:flex flex-col justify-between p-16 bg-[#050505] border-r border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,#3b0764,transparent)] opacity-20" />
          
          <Link href="/">
            <Logo className="scale-125 origin-left" />
          </Link>

          <div className="relative z-10">
            <div className="mb-6 inline-block border border-violet-500/50 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">
              Protocol: Membership Activation
            </div>
            <h2 className="text-6xl font-black uppercase italic leading-[0.9] tracking-tighter mb-8">
              Commit to the <br /> <span className="text-zinc-700">Evolution</span>
            </h2>
            
            <div className="space-y-8 max-w-sm">
              <div className="flex gap-4">
                <ShieldCheck className="h-6 w-6 text-violet-500 shrink-0" />
                <p className="text-sm text-zinc-400 font-medium">Biometric identification and 24/7 autonomous lab access granted upon completion.</p>
              </div>
              <div className="flex gap-4">
                <Zap className="h-6 w-6 text-violet-500 shrink-0" />
                <p className="text-sm text-zinc-400 font-medium">Instant synchronization with our Performance Labs booking system.</p>
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700">
            © {new Date().getFullYear()} OPENFRONT GYM / SYSTEM_v2.0
          </div>
        </div>

        {/* Right: Form */}
        <div className="flex items-center justify-center p-8 md:p-16">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Initialize Account</h1>
              <p className="text-zinc-500 text-sm">Step 01: Identity Verification & Tier Selection</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-6">
              <div className="space-y-4">
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-12 w-full bg-zinc-900 border border-white/5 px-4 text-sm font-bold uppercase tracking-tight focus:outline-none focus:border-violet-600 transition-colors"
                    placeholder="Enter full name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-12 w-full bg-zinc-900 border border-white/5 px-4 text-sm font-bold uppercase tracking-tight focus:outline-none focus:border-violet-600 transition-colors"
                    placeholder="name@company.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Secure Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="h-12 w-full bg-zinc-900 border border-white/5 px-4 text-sm font-bold uppercase tracking-tight focus:outline-none focus:border-violet-600 transition-colors"
                    placeholder="Min. 8 characters"
                  />
                </div>
              </div>

              {/* Billing Cycle Component */}
              <div className="bg-zinc-900/50 border border-white/5 p-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tier: {selectedTier.name}</span>
                  <span className="text-violet-500 text-xs font-black uppercase italic">${price}/{billingCycle === 'monthly' ? 'MO' : 'YR'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={cn(
                      "h-10 text-[10px] font-black uppercase tracking-widest transition-all",
                      billingCycle === 'monthly' ? "bg-white text-black" : "bg-zinc-900 text-zinc-500 border border-white/5 hover:bg-zinc-800"
                    )}
                  >
                    Monthly
                  </button>
                  <button 
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={cn(
                      "h-10 text-[10px] font-black uppercase tracking-widest transition-all",
                      billingCycle === 'annual' ? "bg-white text-black" : "bg-zinc-900 text-zinc-500 border border-white/5 hover:bg-zinc-800"
                    )}
                  >
                    Annual (-20%)
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex h-14 w-full items-center justify-center bg-violet-600 px-10 text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-violet-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Initialize Membership</span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-zinc-600 font-bold uppercase tracking-widest">
                Protected by Biometric Security protocols.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
