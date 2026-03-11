import Link from "next/link"
import { Play, ArrowRight, Zap, Target, Trophy } from "lucide-react"

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-black text-white selection:bg-violet-500/30 selection:text-violet-200">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3b0764,transparent)] opacity-40" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />
      
      {/* Animated Mesh / Flow elements */}
      <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-violet-600/20 blur-[128px] animate-pulse" />
      <div className="absolute top-1/2 -right-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-[96px]" />

      <div className="container relative mx-auto px-6 py-24 md:py-40">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <div className="group mb-8 flex cursor-default items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 transition-colors hover:border-violet-500/50 hover:bg-violet-500/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 group-hover:text-violet-300">
              New: Performance Labs open in Downtown
            </span>
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-5xl font-black uppercase italic leading-[0.9] tracking-tighter md:text-8xl lg:text-9xl">
            Unleash the <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600">Primal</span>{" "}
            <span className="relative inline-block">
              Force
              <div className="absolute -bottom-2 left-0 h-1.5 w-full bg-violet-600 md:-bottom-4" />
            </span>
          </h1>

          <p className="mt-12 max-w-2xl text-lg font-medium text-zinc-400 md:text-xl">
            The next generation of high-performance training. Specialized programming, 
            world-class coaches, and a culture built on absolute discipline.
          </p>

          {/* Action cluster */}
          <div className="mt-12 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <Link
              href="/join"
              className="group relative flex h-14 items-center justify-center overflow-hidden rounded-none bg-violet-600 px-10 text-base font-black uppercase tracking-widest transition-all hover:bg-violet-500 active:scale-95"
            >
              <span className="relative z-10">Join the Force</span>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            </Link>
            
            <Link
              href="/schedule"
              className="group flex items-center gap-3 text-sm font-black uppercase tracking-widest text-white transition-colors hover:text-violet-400"
            >
              Explore Classes
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Stat clusters with bespoke cards */}
          <div className="mt-24 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, label: "Live Classes", value: "150+", sub: "Dynamic Sessions" },
              { icon: Target, label: "Specialties", value: "12+", sub: "Discipline Blocks" },
              { icon: Trophy, label: "Success Rate", value: "98%", sub: "Goal Completion" },
            ].map((stat, i) => (
              <div 
                key={i}
                className="group relative border border-white/5 bg-zinc-900/50 p-8 text-left transition-all hover:border-violet-500/30 hover:bg-zinc-900"
              >
                <stat.icon className="mb-4 h-6 w-6 text-violet-500" />
                <div className="text-3xl font-black tabular-nums tracking-tighter">{stat.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{stat.label}</div>
                <div className="mt-4 h-0.5 w-8 bg-zinc-800 transition-all group-hover:w-full group-hover:bg-violet-600" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decorative vertical line */}
      <div className="absolute left-1/2 top-0 h-24 w-px bg-gradient-to-b from-violet-500 to-transparent opacity-50" />
    </section>
  )
}
