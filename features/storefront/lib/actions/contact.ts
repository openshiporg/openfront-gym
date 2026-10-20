"use server";

import crypto from "node:crypto";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export type ContactFormState = {
  status: "idle" | "sent" | "error";
  message: string | null;
  reference: string | null;
};

function contactReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `GYM-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function failureMessage(error: unknown) {
  const message = String((error as any)?.response?.errors?.[0]?.message ?? (error as any)?.message ?? "").toLowerCase();
  if (message.includes("too many")) return "Too many messages were sent from this email. Try again in 15 minutes, or call the club.";
  if (message.includes("invalid or too long")) return "Check your details: name, a valid email and a message are required.";
  return "Your message could not be sent. Try again, or call or email the club.";
}

export async function submitContactFormAction(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const reference = contactReference();
  // Hidden field left empty by people; automated form fillers usually complete it.
  if (String(formData.get("website") || "").trim()) {
    return { status: "sent", message: "Message sent", reference };
  }

  const from = String(formData.get("from") || "");
  const data = {
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    topic: String(formData.get("topic") || "General support").trim(),
    message: String(formData.get("message") || ""),
    reference,
    sourcePath: from ? safeStorefrontReturnPath(from, "") : "",
  };

  try {
    await gymClient.request(gql`
      mutation SubmitContactForm($data: ContactFormInput!) {
        submitContactForm(data: $data)
      }
    `, { data });
    return {
      status: "sent",
      message: "Message sent",
      reference,
    };
  } catch (error) {
    return {
      status: "error",
      message: failureMessage(error),
      reference: null,
    };
  }
}
