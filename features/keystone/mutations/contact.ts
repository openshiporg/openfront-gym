import { mailDeliveryEnabled, mailTransport } from "../lib/mail";
import { budgetKey, consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";
import { isKnownSource, requestClientSource } from "../../../lib/clientSource";
import { configuredStorefrontOrganization } from "../queries/publicGym";

type ContactFormInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  topic?: string | null;
  message: string;
  reference?: string | null;
  sourcePath?: string | null;
};

const referencePattern = /^GYM-\d{8}-[A-F0-9]{8}$/;

/** Storefront page the sender came from; kept only as a same-site path for staff context. */
function sourcePathOf(value?: string | null) {
  const path = value?.trim() || "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || /[\u0000-\u001f\u007f\\]/.test(path)) return "";
  return path;
}

/** Optional staff email copy. The stored message is the record, so delivery problems never reject it. */
async function emailStaffCopy(message: { subject: string; senderName: string; email: string; phone: string; topic: string; reference: string; body: string }) {
  if (!mailDeliveryEnabled()) return;
  try {
    await mailTransport().sendMail({
      to: process.env.CONTACT_FORM_TO || process.env.SMTP_FROM,
      from: process.env.SMTP_FROM,
      replyTo: message.email,
      subject: `[Gym Contact] ${message.subject}${message.reference ? ` · ${message.reference}` : ""}`,
      text: [
        `Name: ${message.senderName}`,
        `Email: ${message.email}`,
        `Phone: ${message.phone || "Not provided"}`,
        `Topic: ${message.topic}`,
        message.reference ? `Reference: ${message.reference}` : null,
        "",
        message.body,
      ].filter((line) => line !== null).join("\n"),
    });
  } catch (error) {
    console.error("Contact message saved; staff email copy failed:", error instanceof Error ? error.message : error);
  }
}

export async function submitContactForm(
  _root: unknown,
  { data }: { data: ContactFormInput },
  context: any,
) {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = normalizeAuthIdentity(data.email);
  const phone = data.phone?.trim() || "";
  const topic = data.topic?.trim() || "General support";
  const message = data.message.trim();
  const reference = referencePattern.test(data.reference?.trim() || "") ? data.reference!.trim() : "";
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 ||
      /[\r\n]/.test(`${firstName}${lastName}${topic}`) ||
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || phone.length > 40 ||
      topic.length > 120 || !message || message.length > 5000) {
    throw new Error("Contact form details are invalid or too long");
  }
  const source = requestClientSource(context.req);
  if ((isKnownSource(source) && !(await consumeAuthAttempt(context.prisma, budgetKey("contact-source", source), 10, 15 * 60 * 1000))) ||
      !(await consumeAuthAttempt(context.prisma, budgetKey("contact", email, source), 5, 15 * 60 * 1000))) {
    throw new Error("Too many contact form submissions");
  }
  // Contacting the club (including about an account) stays open while its sales are paused.
  const organizationId = (await configuredStorefrontOrganization(context))?.id ?? null;
  if (!organizationId) throw new Error("Contact form is not available");

  const senderName = `${firstName} ${lastName}`;
  const subject = `${topic} — ${senderName}`;
  await context.sudo().query.ContactMessage.createOne({
    data: {
      organization: { connect: { id: organizationId } },
      subject,
      reference,
      name: senderName,
      email,
      phone,
      topic,
      message,
      sourcePath: sourcePathOf(data.sourcePath),
    },
    query: "id",
  });
  await emailStaffCopy({ subject, senderName, email, phone, topic, reference, body: message });
  return true;
}
