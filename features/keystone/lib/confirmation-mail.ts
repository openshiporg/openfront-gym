import { mailTransport } from "./mail";
import type { ConfirmationMail } from "./order-confirmation";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));

export async function sendConfirmationMail(mail: ConfirmationMail): Promise<{ sent: boolean; error?: string }> {
  try {
    const info: any = await mailTransport().sendMail({
      to: mail.to,
      from: process.env.SMTP_FROM,
      subject: mail.subject,
      html: `<body style="font-family:Helvetica,Arial,sans-serif;color:#222;max-width:560px;margin:auto">
        <h2>${escapeHtml(mail.heading)}</h2>
        ${mail.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        <p><a href="${escapeHtml(mail.link.url)}">${escapeHtml(mail.link.label)}</a></p>
      </body>`,
    });
    const rejected = Array.isArray(info?.rejected) && info.rejected.length > 0;
    return rejected ? { sent: false, error: "recipient_rejected" } : { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "send_failed" };
  }
}
