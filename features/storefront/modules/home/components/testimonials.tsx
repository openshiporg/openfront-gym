const TESTIMONIALS = [
  {
    name: "Alexander Volkov",
    role: "Powerlifter",
    quote: "No distractions, no fake wellness fluff. Just high-end coaching and a real focus on getting stronger.",
    accent: "#818cf8",
  },
  {
    name: "Elena Rossi",
    role: "Endurance athlete",
    quote: "The programming is meticulous. Booking is easy, classes start on time, and the results follow the work.",
    accent: "#6366f1",
  },
  {
    name: "Jameson Reed",
    role: "BJJ blue belt",
    quote: "You do not come here to waste time. You come here to refine your mechanics and build a better base.",
    accent: "#818cf8",
  },
];

export default function Testimonials() {
  return (
    <section className="bg-[#131313] px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">

        {/* ── Section header ── */}
        <div className="mb-16 border-b border-white/10 pb-12">
          <p className="gym-eyebrow">Members</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="gym-heading">What members<br />are saying</h2>
            <p className="gym-body max-w-xs md:text-right md:pb-2">
              Real words from real athletes who train here consistently.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-white/[0.06] md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <blockquote
              key={t.name}
              className="relative bg-[#1c1b1b] p-10"
              style={{ borderLeft: `3px solid ${t.accent}` }}
            >
              {/* Decorative quotation mark */}
              <div
                className="absolute right-8 top-4 font-[family-name:var(--font-space-grotesk)] text-[5rem] font-black leading-none select-none pointer-events-none"
                style={{ color: `${t.accent}15` }}
                aria-hidden="true"
              >
                &ldquo;
              </div>

              <p className="relative text-base italic leading-relaxed text-[#e5e2e1]">&ldquo;{t.quote}&rdquo;</p>

              <footer className="mt-8 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: `linear-gradient(90deg, ${t.accent}40, transparent)` }}
                />
                <div className="text-right">
                  <span className="block font-[family-name:var(--font-space-grotesk)] text-sm font-black uppercase tracking-tight text-white">
                    {t.name}
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">
                    {t.role}
                  </span>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
