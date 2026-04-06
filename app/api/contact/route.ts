import { NextResponse } from "next/server";
import { createTransport } from "nodemailer";

function getRedirectUrl(request: Request, status: "sent" | "error") {
  const url = new URL("/contact", request.url);
  url.searchParams.set("status", status);
  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const topic = String(formData.get("topic") || "General support").trim();
  const message = String(formData.get("message") || "").trim();

  if (!firstName || !lastName || !email || !message) {
    return NextResponse.redirect(getRedirectUrl(request, "error"), 303);
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    return NextResponse.redirect(getRedirectUrl(request, "error"), 303);
  }

  try {
    const transport = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    });

    const to = process.env.CONTACT_FORM_TO || process.env.SMTP_FROM;
    const senderName = `${firstName} ${lastName}`.trim();

    await transport.sendMail({
      to,
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

    return NextResponse.redirect(getRedirectUrl(request, "sent"), 303);
  } catch (error) {
    console.error("Contact form submission failed:", error);
    return NextResponse.redirect(getRedirectUrl(request, "error"), 303);
  }
}
