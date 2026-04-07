import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export default async function Hero() {
  const config = await getStorefrontConfig();
  const stats = config?.heroStats?.length
    ? config.heroStats
    : [
        { value: "24/7", label: "Member access" },
        { value: "0–∞", label: "Classes by plan" },
        { value: "15+", label: "Weekly sessions" },
        { value: "3", label: "Expert coaches" },
      ];

  const brandName = config?.name || 'Openfront Gym';
  const headline = config?.heroHeadline || 'Movement is art.\nThe body of work\nis you.';
  const subheadline = config?.heroSubheadline || 'Membership access, class booking, instructor programming, and member operations all running from one coordinated platform.';

  return (
    <section className="relative overflow-hidden bg-[#131313]">
      {/* Subtle cool-toned background glow — no warm orange */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_-5%_40%,rgba(79,70,229,0.15),transparent),radial-gradient(circle_at_90%_85%,rgba(99,102,241,0.10),transparent_40%)]" />

      <div className="relative mx-auto grid min-h-[88vh] max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:px-8">

        {/* ── Left: editorial headline block ── */}
        <div className="z-10 flex flex-col">
          {/* Eyebrow */}
          <p className="gym-eyebrow">{brandName} · {config?.heroEyebrow || 'Performance without compromise'}</p>

          {/* Giant headline */}
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-[clamp(4rem,10vw,8rem)] font-black uppercase leading-[0.82] tracking-[-0.08em] text-white">
            {headline.split('\n').map((line: string, i: number) => (
              <span key={i} className="block">
                {i === 1 ? (
                  <span className="[-webkit-text-stroke:2px_#818cf8] text-transparent">{line}</span>
                ) : line}
              </span>
            ))}
          </h1>

          {/* Subheadline */}
          <p className="mt-8 max-w-md border-l-2 border-[#818cf8] pl-5 text-sm leading-relaxed text-[#c4c7c7]">
            {subheadline}
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href={config?.heroPrimaryCtaHref || '/join'}
              className="inline-flex items-center justify-center bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90"
            >
              {config?.heroPrimaryCtaLabel || 'Start membership'}
            </Link>
            <Link
              href={config?.heroSecondaryCtaHref || '/schedule'}
              className="inline-flex items-center justify-center border-2 border-[#818cf8] px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-[#818cf8] transition-colors hover:bg-[#818cf8]/10"
            >
              {config?.heroSecondaryCtaLabel || 'View schedule'}
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-14 flex flex-wrap items-center gap-8 border-t border-white/10 pt-8">
            {[
              { n: '500+', l: 'Active members' },
              { n: 'No', l: 'Hidden fees' },
              { n: '5★', l: 'Member rating' },
            ].map(({ n, l }) => (
              <div key={l}>
                <div className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-tight text-[#818cf8]">{n}</div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: stat panel ── */}
        <div className="z-10 flex flex-col">
          <div className="divide-y divide-white/10 border border-white/10">
            {stats.map((item: any) => (
              <div key={item.label} className="flex items-center gap-5 bg-[#1c1b1b] px-6 py-6 transition-colors hover:bg-[#232323]">
                <div className="w-[3px] self-stretch bg-[linear-gradient(180deg,#818cf8,#4f46e5)] opacity-70" />
                <div>
                  <div className="gym-stat-value">{item.value}</div>
                  <div className="gym-stat-label mt-1">{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-35">
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#c4c7c7]">Scroll</span>
        <ChevronDown className="h-4 w-4 text-[#c4c7c7] animate-bounce" />
      </div>
    </section>
  );
}
