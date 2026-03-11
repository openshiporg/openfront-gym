import { Quote, Star } from "lucide-react"

const testimonials = [
  {
    id: 1,
    name: "SARAH MITCHELL",
    role: "Elite Tier",
    content: "The specialized programming here is unmatched. It's not just a gym; it's a high-performance laboratory where I've redefined what my body is capable of.",
    achievement: "TOP 5% PERFORMANCE"
  },
  {
    id: 2,
    name: "MICHAEL CHEN",
    role: "Founding Member",
    content: "Absolute discipline is the culture. The atmosphere pushes you to 110% from the moment you scan your biometric entry. Best training floor in the city.",
    achievement: "CONSISTENCY 100%"
  },
  {
    id: 3,
    name: "EMILY RODRIGUEZ",
    role: "Pro Tier",
    content: "I've trained at boutique gyms globally, but the protocol-driven approach here is unique. Data-backed progress and world-class coaching staff.",
    achievement: "MARATHON READY"
  }
]

export default function Testimonials() {
  return (
    <section className="bg-[#050505] py-32 text-white relative overflow-hidden">
      {/* Decorative text background */}
      <div className="absolute -bottom-10 left-0 text-[200px] font-black uppercase italic leading-none text-white/5 whitespace-nowrap select-none pointer-events-none">
        TRANSFORMATION
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-24 flex flex-col items-center text-center">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.4em] text-violet-500">
            Social Proof
          </div>
          <h2 className="text-4xl font-black uppercase italic leading-tight tracking-tighter md:text-7xl">
            Success <span className="text-zinc-700">Intel</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-white/5">
          {testimonials.map((testimonial, i) => (
            <div
              key={testimonial.id}
              className={`p-12 transition-all hover:bg-zinc-900 group ${i < 2 ? 'md:border-r border-white/5' : ''}`}
            >
              <Quote className="h-10 w-10 text-violet-600 mb-8 opacity-40 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex gap-1 mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-violet-500 text-violet-500" />
                ))}
              </div>

              <p className="text-lg font-medium italic leading-relaxed text-zinc-300 group-hover:text-white transition-colors mb-12">
                "{testimonial.content}"
              </p>

              <div className="flex items-end justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest">{testimonial.name}</h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{testimonial.role}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-500 bg-violet-500/10 px-2 py-1 border border-violet-500/20">
                    {testimonial.achievement}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
