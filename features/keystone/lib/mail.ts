import { createTransport, getTestMessageUrl } from "nodemailer";
import { resolvePublicBaseUrl } from "./internal-origin";

/**
 * Outbound mail is a capability: MAIL_ENABLED=false (or missing SMTP settings) means no SMTP
 * traffic from any entry point. Production requires an explicit MAIL_ENABLED value.
 */
export function mailDeliveryEnabled() {
  const flag = process.env.MAIL_ENABLED;
  const enabled = flag === "true" || (flag === undefined && process.env.NODE_ENV !== "production");
  return enabled && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export function mailTransport() {
  if (!mailDeliveryEnabled()) throw new Error("Email delivery is turned off for this Gym deployment");
  const port = Number(process.env.SMTP_PORT || 587);
  return createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
}

type MailLink = { url: string; label: string };

function linkEmail({ heading, links, footer }: { heading: string; links: MailLink[]; footer: string }): string {
  const buttons = links.map((link) => `
          <tr>
            <td align="center" style="padding: 8px 0;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 5px;" bgcolor="#346df1"><a href="${escapeHtml(link.url)}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid #346df1; display: inline-block; font-weight: bold;">${escapeHtml(link.label)}</a></td>
                </tr>
              </table>
            </td>
          </tr>`).join("");
  return `
    <body style="background: #f9f9f9;">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
            ${escapeHtml(heading)}
          </td>
        </tr>${buttons}
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
            ${escapeHtml(footer)}
          </td>
        </tr>
      </table>
    </body>
  `;
}

/**
 * What the mail server said about the intended recipient. "accepted" means the SMTP server took
 * the message for that address; it is not proof the mailbox received or opened it.
 */
export type MailOutcome = "accepted" | "rejected" | "unconfirmed";

function recipientOutcome(info: any, to: string): MailOutcome {
  const listed = (values: unknown) => Array.isArray(values) && values.some((value) => String((value as any)?.address ?? value).toLowerCase() === to.toLowerCase());
  if (listed(info?.rejected)) return "rejected";
  if (listed(info?.accepted)) return "accepted";
  return "unconfirmed";
}

async function deliver(to: string, subject: string, html: string): Promise<MailOutcome> {
  const info = await mailTransport().sendMail({ to, from: process.env.SMTP_FROM, subject, html });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
  return recipientOutcome(info, to);
}

/** Where a password link lands: the storefront's own reset page, or the dashboard reset screen. */
export function passwordResetUrl(resetToken: string, identity: string, audience: "dashboard" | "storefront") {
  const origin = resolvePublicBaseUrl();
  if (audience === "dashboard") return `${origin}/dashboard/reset?token=${encodeURIComponent(resetToken)}`;
  return `${origin}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(identity)}`;
}

/**
 * The holder's own reset link, sent only to the account's mailbox. A member account gets the
 * storefront link first; an account with dashboard access also gets the dashboard link. Either
 * redeems the same native token once.
 */
export async function sendPasswordResetEmail(resetToken: string, to: string, surfaces: { storefront: boolean; dashboard: boolean }): Promise<MailOutcome> {
  const links: MailLink[] = [];
  if (surfaces.storefront || !surfaces.dashboard) links.push({ url: passwordResetUrl(resetToken, to, "storefront"), label: surfaces.dashboard ? "Reset on the member site" : "Set password" });
  if (surfaces.dashboard) links.push({ url: passwordResetUrl(resetToken, to, "dashboard"), label: surfaces.storefront ? "Reset for the staff dashboard" : "Set password" });
  return deliver(to, "Set your password", linkEmail({
    heading: "Use this link to set your password.",
    links,
    footer: "The link works once and expires soon. If you did not request it, you can ignore this email.",
  }));
}

/** Confirms a new sign-in email: the link goes to the new address and only switches it for the signed-in holder. */
export async function sendEmailChangeConfirmation(url: string, to: string): Promise<MailOutcome> {
  return deliver(to, "Confirm your new sign-in email", linkEmail({
    heading: "Confirm this address as your new sign-in email.",
    links: [{ url, label: "Confirm email" }],
    footer: "Open the link while signed in to your account. It expires in an hour. If you did not ask for this, ignore this email; nothing changes.",
  }));
}

/** Tells the previous address that the sign-in email changed (no link, no secret). */
export async function sendEmailChangedNotice(to: string): Promise<MailOutcome> {
  return deliver(to, "Your sign-in email was changed", linkEmail({
    heading: "The sign-in email for your account was changed.",
    links: [],
    footer: "If you made this change, there's nothing to do. If you didn't, contact the club right away.",
  }));
}
