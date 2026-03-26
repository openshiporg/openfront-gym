const TESTIMONIALS = [
  {
    name: "Alexander Volkov",
    role: "Powerlifter",
    quote: "No distractions, no fake wellness fluff. Just high-end coaching and a real focus on getting stronger.",
    accent: "#7df4ff",
  },
  {
    name: "Elena Rossi",
    role: "Endurance athlete",
    quote: "The programming is meticulous. Booking is easy, classes start on time, and the results follow the work.",
    accent: "#ffb59e",
  },
  {
    name: "Jameson Reed",
    role: "BJJ blue belt",
    quote: "You do not come here to waste time. You come here to refine your mechanics and build a better base.",
    accent: "#7df4ff",
  },
];

export default function Testimonials() {
  return (
    <section className="bg-[#131313] px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-6xl">
            The Openfront tribe
          </h2>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.32em] text-[#ffb59e]">
            Built on collective discipline
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <blockquote key={t.name} className="bg-[#1c1b1b] p-10" style={{ borderLeft: `4px solid ${t.accent}` }}>
              <p className="text-lg italic leading-relaxed text-[#e5e2e1]">“{t.quote}”</p>
              <footer className="mt-8 flex flex-col">
                <span className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold uppercase tracking-tight text-white">
                  {t.name}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">{t.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
