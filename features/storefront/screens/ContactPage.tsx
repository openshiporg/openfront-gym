import Link from "next/link";
import { Metadata } from "next";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { ContactForm } from "@/features/storefront/modules/contact/components/contact-form";
import { publicSupportEmail, sanitizeContactTopics, contactTopicsWithHours } from "@/features/storefront/lib/contact-config";

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

export async function ContactPage() {
  const config = await getStorefrontConfig();
  const deliveryConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  const configuredSettingsEmail = publicSupportEmail(config?.email);
  const supportEmail = configuredSettingsEmail || publicSupportEmail(process.env.CONTACT_FORM_TO) || null;
  const contactInfo = contactTopicsWithHours(config?.contactTopics?.length
    ? sanitizeContactTopics(config.contactTopics, Boolean(configuredSettingsEmail)).map((item: any) => ({
        title: item.title,
        details: item.details || [],
      }))
    : [
        { title: "Location", details: [config?.address || "Address not published"] },
        { title: "Phone", details: [config?.phone || "Phone not published"] },
        { title: "Email", details: [configuredSettingsEmail || "Contact email not configured"] },
      ], config?.hours);

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

        <nav className="sf-quick-grid mt-8" aria-label="Get help with your visit"><Link className="sf-quick-card" href="/account/bookings"><h2>Change a class booking ↗</h2><p>Review confirmed sessions and waitlists.</p></Link><Link className="sf-quick-card" href="/account/membership"><h2>Manage your membership ↗</h2><p>Billing, freeze and renewal options.</p></Link><Link className="sf-quick-card" href="/policies"><h2>Before your first visit ↗</h2><p>Read club participation and booking policies.</p></Link></nav>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
            {contactInfo.map((item: { title: string; details: string[] }) => (
              <div key={item.title} className="py-6">
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <div className="mt-3 space-y-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                  {(item.details || []).map((detail: string) => (
                    <p key={detail}>{item.title.toLowerCase() === "phone" && config?.phone === detail ? <a className="sf-link" href={`tel:${detail}`}>{detail}</a> : item.title.toLowerCase() === "email" && configuredSettingsEmail === detail ? <a className="sf-link" href={`mailto:${detail}`}>{detail}</a> : detail}</p>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="border border-[var(--color-rule)] bg-[var(--color-surface)] p-8">
            <p className="sf-eyebrow">Inquiry</p>
            <h2 className="mt-3 text-3xl font-semibold">Send a message</h2>
            <p className="sf-muted text-sm mt-3">Ask about a first visit, membership or training. A tour or class is arranged only after the club confirms it with you.</p>
            <ContactForm deliveryConfigured={deliveryConfigured} supportEmail={supportEmail} />
          </section>
        </div>
      </div>
    </div>
  );
}
