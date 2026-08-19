import { Metadata } from "next";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { ContactForm } from "@/features/storefront/modules/contact/components/contact-form";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the gym.",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: config?.name ? `Contact — ${config.name}` : metadata.title,
    description: config?.description || metadata.description,
  };
}

function formatHours(hours?: Record<string, string> | null) {
  if (!hours) return ["Hours available after setup"];
  const entries = Object.entries(hours);
  if (!entries.length) return ["Hours available after setup"];
  return entries.slice(0, 2).map(([day, value]) => `${day.slice(0, 3)} · ${value}`);
}

export async function ContactPage() {
  const config = await getStorefrontConfig();
  const deliveryConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  const supportEmail = config?.email?.trim() || process.env.CONTACT_FORM_TO?.trim() || null;
  const contactInfo = config?.contactTopics?.length
    ? config.contactTopics.map((item: any) => ({
        title: item.title,
        details: item.details || [],
      }))
    : [
        { title: "Location", details: [config?.address || "Address available after setup"] },
        { title: "Phone", details: [config?.phone || "Phone available after setup"] },
        { title: "Email", details: [config?.email || "Email available after setup"] },
        { title: "Hours", details: formatHours(config?.hours) },
      ];

  return (
    <div className="sf-page px-5 pb-24 pt-12 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="sf-page-header border-b border-[var(--color-rule)] pb-12">
          <div>
            <p className="sf-eyebrow">Contact</p>
            <h1 className="sf-display mt-4 text-[var(--text-display-s)]">Reach {config?.name || "the club"}</h1>
          </div>
          <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)]">
            Front desk, membership questions, class info, or a tour of the facility.
          </p>
        </header>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
            {contactInfo.map((item: { title: string; details: string[] }) => (
              <div key={item.title} className="py-6">
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <div className="mt-3 space-y-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                  {(item.details || []).map((detail: string) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-8">
            <p className="sf-eyebrow">Inquiry</p>
            <h2 className="mt-3 text-3xl font-semibold">Send a message</h2>
            <ContactForm deliveryConfigured={deliveryConfigured} supportEmail={supportEmail} />
          </section>
        </div>
      </div>
    </div>
  );
}
