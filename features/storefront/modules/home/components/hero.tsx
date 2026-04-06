import Link from "next/link";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export default async function Hero() {
  const config = await getStorefrontConfig();
  const stats = config?.heroStats?.length
    ? config.heroStats
    : [
        { value: "24/7", label: "Top-tier access" },
        { value: "0-∞", label: "Classes by plan" },
        { value: "15", label: "Weekly recurring sessions" },
        { value: "3", label: "Coaches seeded at setup" },
      ];

  return (
    <section className="relative overflow-hidden bg-[#131313]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,181,158,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(228,68,0,0.18),transparent_28%)]" />
      <div className="mx-auto grid min-h-[78vh] max-w-7xl items-end gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:pb-24">
        <div className="relative z-10">
          <p className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.35em] text-[#ffb59e]">
            {(config?.name || 'Openfront Gym') + ' · ' + (config?.heroEyebrow || 'Performance without compromise')}
          </p>
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.88] tracking-[-0.08em] text-white sm:text-7xl lg:text-[7rem]">
            {config?.heroHeadline || 'Train with structure. Recover with intent.'}
          </h1>
          <p className="mt-7 max-w-xl border-l-2 border-[#ffb59e] pl-5 text-sm uppercase tracking-[0.12em] text-[#c4c7c7] sm:text-base">
            {config?.heroSubheadline || 'Membership access, classes, coaching, and facility operations configured from real data.'}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href={config?.heroPrimaryCtaHref || '/join'}
              className="inline-flex items-center bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-8 py-4 font-sans text-sm font-bold uppercase tracking-[0.2em] text-[#3a0b00] transition-transform active:scale-95"
            >
              {config?.heroPrimaryCtaLabel || 'Start membership'}
            </Link>
            <Link
              href={config?.heroSecondaryCtaHref || '/schedule'}
              className="inline-flex items-center border-2 border-[#d3fbff] px-8 py-4 font-sans text-sm font-bold uppercase tracking-[0.2em] text-[#d3fbff] transition-colors hover:bg-[#d3fbff]/10"
            >
              {config?.heroSecondaryCtaLabel || 'View schedule'}
            </Link>
          </div>
        </div>

        <div className="relative z-10 grid gap-px bg-white/10">
          {stats.map((item: any, idx: number) => (
            <div key={item.label} className={`bg-[#1c1b1b] px-6 py-6 ${idx === 0 ? "border-l-4 border-[#ffb59e]" : ""}`}>
              <div className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.06em] text-white">
                {item.value}
              </div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[#c4c7c7]">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
