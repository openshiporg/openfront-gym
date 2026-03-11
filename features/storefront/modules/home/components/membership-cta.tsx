import Link from "next/link"
import { ShieldCheck, Zap, Globe, Lock } from "lucide-react"

export default function MembershipCTA() {
  return (
    <section className="relative overflow-hidden bg-[#0a0a0a] py-32 text-white">
      {/* Background Graphic */}
      <div className="absolute top-0 right-0 h-full w-1/3 bg-violet-600/5 blur-[120px]" />
      
      <div className="container mx-auto px-6">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div>
            <div className="mb-6 inline-block bg-violet-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em]">
              Access Level: Unrestricted
            </div>
            <h2 className="mb-8 text-5xl font-black uppercase italic leading-[0.9] tracking-tighter md:text-8xl">
              Become the <br /> <span className="text-zinc-700 font-outline-2">Standard</span>
            </h2>
            
            <div className="mb-12 space-y-6">
              {[
                { icon: ShieldCheck, title: "Biometric Lab Access", desc: "24/7 entry to all performance zones." },
                { icon: Zap, title: "Elite Protocols", desc: "Personalized programming for every member." },
                { icon: Lock, title: "The Vault", desc: "Private recovery suites and cryotherapy." },
              ].map((item, i) => (
                <div key={i} className="flex gap-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-white/10 bg-white/5">
                    <item.icon className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest">{item.title}</h4>
                    <p className="text-xs text-zinc-500 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/memberships"
              className="inline-flex h-16 items-center bg-white px-12 text-sm font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-violet-600 hover:text-white"
            >
              Select Your Tier
            </Link>
          </div>

          <div className="relative">
            <div className="relative border border-white/5 bg-zinc-900/50 p-12 backdrop-blur-sm">
              <div className="absolute -top-px -left-px h-8 w-8 border-l-2 border-t-2 border-violet-600" />
              <div className="absolute -bottom-px -right-px h-8 w-8 border-r-2 border-b-2 border-violet-600" />
              
              <h3 className="mb-8 text-center text-2xl font-black uppercase italic tracking-tighter">
                Direct Entry <span className="text-violet-500 text-sm align-top">V1</span>
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between border-b border-white/5 pb-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Initiation</span>
                  <span className="text-xs font-black uppercase line-through text-zinc-700">$250</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-4 text-violet-500">
                  <span className="text-xs font-black uppercase tracking-widest italic">Founding Member Rate</span>
                  <span className="text-lg font-black italic tracking-tighter">WAIVED</span>
                </div>
              </div>

              <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                Founding rates guaranteed for the first 500 members. 
                <br />Current status: <span className="text-white">412/500</span>
              </p>
            </div>

            {/* Floating accent elements */}
            <div className="absolute -bottom-8 -left-8 h-24 w-24 border-b border-l border-white/10" />
            <div className="absolute -top-8 -right-8 h-24 w-24 border-t border-r border-white/10" />
          </div>
        </div>
      </div>
    </section>
  )
}
