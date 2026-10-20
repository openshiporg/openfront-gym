import { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { getUser } from "@/features/storefront/lib/data/user";
import { ContactForm } from "@/features/storefront/modules/contact/components/contact-form";
import { mapLink, publicSupportEmail, publishedHours } from "@/features/storefront/lib/contact-config";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink } from "@/features/storefront/modules/common/ui";
import { HoursList } from "@/features/storefront/modules/layout/templates/footer";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: "Contact",
    description: config?.address ? `${config.address}${config.phone ? ` · ${config.phone}` : ""}` : undefined,
  };
}

const CHANNEL = {
  phone: /^(?:phone|call|telephone)$/i,
  email: /^e-?mail$/i,
  address: /^(?:location|address|visit|find us)$/i,
  hours: /^(?:(?:opening|business|gym|club)\s+)?hours$/i,
};

export async function ContactPage({ searchParams }: { searchParams?: Promise<{ topic?: string; from?: string }> } = {}) {
  const [config, user, params] = await Promise.all([getStorefrontConfig(), getUser(), searchParams ?? Promise.resolve(undefined)]);
  const supportEmail = publicSupportEmail(config?.email) || publicSupportEmail(process.env.CONTACT_FORM_TO) || null;
  const phone = config?.phone?.trim() || null;
  const address = config?.address?.trim() || null;
  const hours = publishedHours(config?.hours);
  const timeZone = config?.timezone || "UTC";
  const from = params?.from ? safeStorefrontReturnPath(params.from, "") || null : null;
  const [firstName = "", ...rest] = (user?.name || "").trim().split(/\s+/);

  // Gym Settings fields are the source of truth for each channel; contact-topic copy adds notes.
  const topics: Array<{ title: string; details: string[] }> = Array.isArray(config?.contactTopics)
    ? config.contactTopics.filter((topic: any) => typeof topic?.title === "string" && topic.title.trim())
    : [];
  const notesFor = (pattern: RegExp, exclude: Array<string | null>) => topics
    .filter((topic) => pattern.test(topic.title.trim()))
    .flatMap((topic) => topic.details || [])
    .filter((detail) => detail && !exclude.some((value) => value && detail.includes(value)) && !/not (?:configured|published)/i.test(detail));
  const addressLines = address ? [address] : topics.filter((topic) => CHANNEL.address.test(topic.title.trim())).flatMap((topic) => topic.details || []);
  const otherTopics = topics.filter((topic) => !Object.values(CHANNEL).some((pattern) => pattern.test(topic.title.trim())));
  const phoneNotes = notesFor(CHANNEL.phone, [phone]);
  const emailNotes = notesFor(CHANNEL.email, [supportEmail]).filter((note) => !/\S+@\S+\.\S+/.test(note));

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Contact" />

        <div className="sf-split">
          <section className="sf-stack" aria-label="Contact details">
            <div className="sf-contact-list">
              <div>
                <h2>Phone</h2>
                <div className="sf-stack" data-gap="sm">
                  {phone ? <p><a className="sf-link" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a></p> : <p className="sf-text-2">Not published</p>}
                  {phoneNotes.map((note) => <p key={note} className="sf-meta">{note}</p>)}
                </div>
              </div>
              <div>
                <h2>Email</h2>
                <div className="sf-stack" data-gap="sm">
                  {supportEmail ? <p className="sf-break"><a className="sf-link" href={`mailto:${supportEmail}`}>{supportEmail}</a></p> : <p className="sf-text-2">Use the message form</p>}
                  {emailNotes.map((note) => <p key={note} className="sf-meta">{note}</p>)}
                </div>
              </div>
              <div>
                <h2>Address</h2>
                <div className="sf-stack" data-gap="sm">
                  {addressLines.length ? addressLines.map((line) => <p key={line} className="sf-break">{line}</p>) : <p className="sf-text-2">Not published</p>}
                  {addressLines.length ? (
                    <p>
                      <a className="sf-link" data-size="sm" href={mapLink(addressLines.join(", "))} target="_blank" rel="noreferrer">
                        Directions<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens Google Maps)</span>
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <h2>Hours</h2>
                <div className="sf-stack" data-gap="sm">
                  {hours.length ? <HoursList hours={hours} timeZone={timeZone} /> : <p className="sf-text-2">Not published</p>}
                  {hours.length ? <p className="sf-meta">Times in {timeZone}</p> : null}
                </div>
              </div>
              {otherTopics.map((topic) => (
                <div key={topic.title}>
                  <h2>{topic.title}</h2>
                  <div className="sf-stack" data-gap="sm">
                    {(topic.details || []).map((detail) => <p key={detail} className="sf-break">{detail}</p>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="sf-actions">
              <ArrowLink href="/account/bookings" size="sm">Bookings</ArrowLink>
              <ArrowLink href="/account/membership" size="sm">Membership</ArrowLink>
              <ArrowLink href="/policies" size="sm">Policies</ArrowLink>
            </div>
          </section>

          <section className="sf-card" aria-labelledby="contact-form-title">
            <h2 id="contact-form-title" className="sf-h2">Send a message</h2>
            <ContactForm
              topic={params?.topic}
              from={from}
              phone={phone}
              supportEmail={supportEmail}
              defaults={user ? { firstName, lastName: rest.join(" "), email: user.email, phone: user.phone || undefined } : undefined}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
