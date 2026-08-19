"use server";

import crypto from "node:crypto";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";

export type ContactFormState = {
  status: "idle" | "sent" | "error";
  message: string | null;
  reference: string | null;
};

function contactReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `GYM-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function submitContactFormAction(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    return {
      status: "error",
      message: "Online inquiry delivery is not configured. No message was accepted; use the published phone or email instead.",
      reference: null,
    };
  }

  const reference = contactReference();
  const topic = String(formData.get("topic") || "General support").trim();
  const data = {
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    topic: `${topic} · ${reference}`,
    message: String(formData.get("message") || ""),
  };

  try {
    await gymClient.request(gql`
      mutation SubmitContactForm($data: ContactFormInput!) {
        submitContactForm(data: $data)
      }
    `, { data });
    return {
      status: "sent",
      message: "Thanks — your message was delivered to the front desk.",
      reference,
    };
  } catch {
    return {
      status: "error",
      message: "We could not confirm delivery, so this message was not accepted. Please use the published phone or email instead.",
      reference: null,
    };
  }
}
