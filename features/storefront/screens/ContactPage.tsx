import { Metadata } from "next";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us - Openfront Gym",
  description: "Get in touch with Openfront Gym. Visit us, call us, or send us a message.",
};

export async function generateMetadata(): Promise<Metadata> {
  return metadata;
}

const contactInfo = [
  {
    icon: MapPin,
    title: "Location",
    details: ["123 Fitness Avenue", "San Francisco, CA 94102"],
  },
  {
    icon: Phone,
    title: "Phone",
    details: ["(415) 555-0123", "Front desk: 6am – 10pm"],
  },
  {
    icon: Mail,
    title: "Email",
    details: ["info@openfrontgym.com", "support@openfrontgym.com"],
  },
  {
    icon: Clock,
    title: "Hours",
    details: ["Mon–Fri 5:00 AM – 11:00 PM", "Sat–Sun 6:00 AM – 10:00 PM"],
  },
];

export async function ContactPage() {
  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">Direct line</p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              Contact
              <br />
              the gym
            </h1>
          </div>
          <p className="max-w-md border-l-2 border-[#ffb59e] pl-6 text-base leading-relaxed text-[#c4c7c7]">
            Reach the front desk, confirm facility details, ask about memberships, or book a tour of the training environment.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4">
            {contactInfo.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`${index % 2 === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"} flex gap-5 p-6`}>
                  <Icon className="mt-1 h-5 w-5 shrink-0 text-[#ffb59e]" />
                  <div>
                    <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.03em] text-white">
                      {item.title}
                    </h2>
                    <div className="mt-3 space-y-1 text-sm leading-relaxed text-[#c4c7c7]">
                      {item.details.map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="bg-[#1c1b1b] p-8">
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#ffb59e]">Inquiry form</p>
            <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.05em] text-white">
              Send a message
            </h2>
            <form className="mt-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input className="h-12 border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]" placeholder="First name" />
                <input className="h-12 border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]" placeholder="Last name" />
              </div>
              <input className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]" placeholder="Email" type="email" />
              <input className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]" placeholder="Phone" type="tel" />
              <select className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#7df4ff]">
                <option>Membership inquiry</option>
                <option>Class information</option>
                <option>Schedule a tour</option>
                <option>General support</option>
              </select>
              <textarea className="min-h-[160px] w-full border border-white/10 bg-[#0e0e0e] px-4 py-3 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#7df4ff]" placeholder="How can we help?" />
              <button type="submit" className="inline-flex bg-[linear-gradient(45deg,#ffb59e_0%,#e44400_100%)] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[#3a0b00] transition-transform active:scale-95">
                Send message
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
