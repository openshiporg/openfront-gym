import { mailTransport } from "./mail";
import type { ConfirmationMail } from "./order-confirmation";
import { emailButton, emailLayout, emailParagraph, escapeHtml } from "./email-layout"


export async function sendConfirmationMail(mail: ConfirmationMail): Promise<{ sent: boolean; error?: string; messageId?: string; response?: string }> {
  try {
    const info: any = await mailTransport().sendMail({
      to: mail.to,
      from: process.env.SMTP_FROM,
      subject: mail.subject,
      html: emailLayout({
        preheader: mail.heading,
        title: mail.heading,
        body: `${mail.lines.map((line) => emailParagraph(escapeHtml(line))).join("")}
${emailButton(mail.link.label, mail.link.url)}`,
      }),
    });
    const rejected = Array.isArray(info?.rejected) && info.rejected.length > 0;
    return rejected ? { sent: false, error: "recipient_rejected" } : { sent: true, messageId: typeof info?.messageId === "string" ? info.messageId : undefined, response: typeof info?.response === "string" ? info.response : undefined };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "send_failed" };
  }
}
