import { Metadata } from "next";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the gym. Visit us, call us, or send us a message.",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: config?.name ? `Contact ${config.name}` : metadata.title,
    description: config?.description || metadata.description,
  };
}

function formatHours(hours?: Record<string, string> | null) {
  if (!hours) return ["Hours available after setup"];
  const entries = Object.entries(hours);
  if (!entries.length) return ["Hours available after setup"];
  return entries.slice(0, 2).map(([day, value]) => `${day.slice(0, 3)} · ${value}`);
}

export async function ContactPage(props: {
  searchParams?: Promise<{ status?: string }>
}) {
  const searchParams = props.searchParams ? await props.searchParams : { status: undefined as string | undefined };
  const status = searchParams.status;
  const config = await getStorefrontConfig();
  const contactInfo = config?.contactTopics?.length
    ? config.contactTopics.map((item: any, index: number) => ({
        icon: [MapPin, Phone, Mail, Clock][index] || MapPin,
        title: item.title,
        details: item.details || [],
      }))
    : [
        {
          icon: MapPin,
          title: "Location",
          details: [config?.address || "Address available after setup"],
        },
        {
          icon: Phone,
          title: "Phone",
          details: [config?.phone || "Phone available after setup"],
        },
        {
          icon: Mail,
          title: "Email",
          details: [config?.email || "Email available after setup"],
        },
        {
          icon: Clock,
          title: "Hours",
          details: formatHours(config?.hours),
        },
      ];

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-14 grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Direct line</p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-black uppercase leading-[0.9] tracking-[-0.08em] text-white sm:text-7xl">
              Contact
              <br />
              {config?.name || "the gym"}
            </h1>
          </div>
          <p className="max-w-md border-l-2 border-[#818cf8] pl-6 text-base leading-relaxed text-[#c4c7c7]">
            Reach the front desk, confirm facility details, ask about memberships, or book a tour of {config?.name || "the training environment"}.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4">
            {contactInfo.map((item: any, index: number) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`${index % 2 === 0 ? "bg-[#1c1b1b]" : "bg-[#0e0e0e] border border-white/10"} flex gap-5 p-6`}>
                  <Icon className="mt-1 h-5 w-5 shrink-0 text-[#818cf8]" />
                  <div>
                    <h2 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.03em] text-white">
                      {item.title}
                    </h2>
                    <div className="mt-3 space-y-1 text-sm leading-relaxed text-[#c4c7c7]">
                      {(item.details || []).map((detail: string) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="bg-[#1c1b1b] p-8">
            {status === "sent" ? (
              <div className="mb-6 border border-[#a5b4fc]/30 bg-[#00363a]/30 px-4 py-3 text-sm text-[#d3fbff]">
                Thanks — your message has been sent to the front desk.
              </div>
            ) : null}
            {status === "error" ? (
              <div className="mb-6 border border-[#ffb4ab]/30 bg-[#93000a]/20 px-4 py-3 text-sm text-[#ffdad6]">
                We couldn't send your message right now. Please try again or contact the gym directly.
              </div>
            ) : null}
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#818cf8]">Inquiry form</p>
            <h2 className="mt-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.05em] text-white">
              Send a message
            </h2>
            <form action={"/api/contact" as any} method="POST" className="mt-8 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input name="firstName" required className="h-12 border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]" placeholder="First name" />
                <input name="lastName" required className="h-12 border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]" placeholder="Last name" />
              </div>
              <input name="email" required className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]" placeholder="Email" type="email" />
              <input name="phone" className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]" placeholder="Phone" type="tel" />
              <select name="topic" className="h-12 w-full border border-white/10 bg-[#0e0e0e] px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]">
                <option>Membership inquiry</option>
                <option>Class information</option>
                <option>Schedule a tour</option>
                <option>General support</option>
              </select>
              <textarea name="message" required className="min-h-[160px] w-full border border-white/10 bg-[#0e0e0e] px-4 py-3 text-sm text-white placeholder:text-[#8e9192] focus:outline-none focus:ring-1 focus:ring-[#a5b4fc]" placeholder="How can we help?" />
              <button type="submit" className="inline-flex bg-[linear-gradient(45deg,#818cf8_0%,#4f46e5_100%)] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-transform active:scale-95">
                Send message
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
