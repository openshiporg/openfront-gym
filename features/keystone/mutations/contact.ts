import { createTransport } from "nodemailer";
import { consumeAuthAttempt, normalizeAuthIdentity } from "../../../lib/authRateLimit";

export async function submitContactForm(
  _root: unknown,
  { data }: { data: { firstName: string; lastName: string; email: string; phone?: string | null; topic?: string | null; message: string } },
  context: any,
) {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const email = normalizeAuthIdentity(data.email);
  const phone = data.phone?.trim() || "";
  const topic = data.topic?.trim() || "General support";
  const message = data.message.trim();
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 ||
      /[\r\n]/.test(`${firstName}${lastName}${topic}`) ||
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || phone.length > 40 ||
      topic.length > 120 || !message || message.length > 5000) {
    throw new Error("Contact form details are invalid or too long");
  }
  if (!(await consumeAuthAttempt(context.prisma, "contact:global", 200, 15 * 60 * 1000)) ||
      !(await consumeAuthAttempt(context.prisma, `contact:${email}`, 5, 15 * 60 * 1000))) {
    throw new Error("Too many contact form submissions");
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error("Contact email is not configured");
  const transport = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  const senderName = `${firstName} ${lastName}`;
  const delivery = await transport.sendMail({
    to: process.env.CONTACT_FORM_TO || process.env.SMTP_FROM,
    from: process.env.SMTP_FROM,
    replyTo: email,
    subject: `[Gym Contact] ${topic} — ${senderName}`,
    text: [
      `Name: ${senderName}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `Topic: ${topic}`,
      "",
      message,
    ].join("\n"),
  });
  const accepted = Array.isArray(delivery.accepted) ? delivery.accepted : [];
  if (!delivery.messageId || accepted.length === 0) {
    throw new Error("Contact email delivery was not accepted by the configured provider");
  }
  return true;
}
