import Link from "next/link"
import { Logo } from "@/features/dashboard/components/Logo"
import { Github, Twitter, Instagram, ArrowRight } from "lucide-react"

export default function Footer() {
  return (
    <footer className="bg-black text-white border-t border-white/5">
      <div className="container mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
          <div className="md:col-span-4">
            <Logo className="mb-8" />
            <p className="text-zinc-500 max-w-xs text-sm leading-relaxed mb-8">
              A high-performance training collective dedicated to the pursuit of absolute discipline and physical excellence.
            </p>
            <div className="flex gap-4">
              {[Instagram, Twitter, Github].map((Icon, i) => (
                <Link key={i} href="#" className="h-10 w-10 flex items-center justify-center border border-white/10 hover:border-violet-600 hover:text-violet-500 transition-colors">
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
          
          <div className="md:col-span-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-6">Disciplines</h4>
            <ul className="space-y-4 text-sm font-bold uppercase tracking-widest">
              <li><Link href="/classes" className="hover:text-violet-500">HIIT</Link></li>
              <li><Link href="/classes" className="hover:text-violet-500">Strength</Link></li>
              <li><Link href="/classes" className="hover:text-violet-500">Recovery</Link></li>
              <li><Link href="/classes" className="hover:text-violet-500">Boxing</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-6">Platform</h4>
            <ul className="space-y-4 text-sm font-bold uppercase tracking-widest">
              <li><Link href="/memberships" className="hover:text-violet-500">Plans</Link></li>
              <li><Link href="/schedule" className="hover:text-violet-500">Schedule</Link></li>
              <li><Link href="/account" className="hover:text-violet-500">Portal</Link></li>
              <li><Link href="/facilities" className="hover:text-violet-500">Labs</Link></li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-6">Join the Transmission</h4>
            <p className="text-zinc-500 text-sm mb-6">Get weekly performance protocols and lab updates.</p>
            <form className="flex">
              <input 
                type="email" 
                placeholder="EMAIL ADDRESS" 
                className="flex-1 bg-zinc-900 border border-white/5 px-4 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-violet-600"
              />
              <button className="bg-white text-black px-6 py-3 hover:bg-violet-600 hover:text-white transition-colors">
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
        
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700">
            &copy; {new Date().getFullYear()} OPENFRONT GYM. ALL RIGHTS RESERVED.
          </p>
          <div className="flex gap-8 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700">
            <Link href="#" className="hover:text-zinc-400">Privacy</Link>
            <Link href="#" className="hover:text-zinc-400">Terms</Link>
            <Link href="#" className="hover:text-zinc-400">Liability</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
