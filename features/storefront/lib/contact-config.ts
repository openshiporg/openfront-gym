import { displayWeeklyHours } from "@/features/keystone/lib/gym-hours";

/** Gym Settings hours are authoritative; contact-topic prose is not a second timetable. */
export function publishedHours(hours?: unknown) {
  return displayWeeklyHours(hours);
}

export function contactTopicsWithHours(
  topics: Array<{ title: string; details: string[] }>,
  hours?: unknown,
) {
  const entries = publishedHours(hours);
  const details = entries.length ? entries.map(([day, value]) => `${day} · ${value}`) : ["Hours not published"];
  const isHours = (title?: string) => /^(?:(?:opening|business|gym|club)\s+)?hours$/i.test(title?.trim() || "");
  const first = topics.findIndex(topic => isHours(topic.title));
  const result = topics.filter((topic, index) => !isHours(topic.title) || index === first)
    .map(topic => isHours(topic.title) ? { ...topic, details } : topic);
  return first < 0 ? [...result, { title: "Hours", details }] : result;
}

export function isConfiguredPublicEmail(value?: string | null) {
  const email = value?.trim() || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return !(
    domain.endsWith(".invalid") ||
    domain.endsWith(".example") ||
    domain.endsWith(".test") ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org"
  );
}

export function publicSupportEmail(value?: string | null) {
  return isConfiguredPublicEmail(value) ? value!.trim() : null;
}

export function sanitizeContactTopics(
  topics: Array<{ title?: string; details?: string[] }> | null | undefined,
  emailConfigured: boolean,
) {
  if (!Array.isArray(topics)) return [];
  return topics.map((topic) => {
    if (!emailConfigured && topic.title?.trim().toLowerCase() === "email") {
      return { ...topic, details: ["Contact email not configured"] };
    }
    return topic;
  });
}

/** Contact form topics; `key` is what storefront links pass as `?topic=` to preselect one. */
export const CONTACT_TOPICS = [
  { key: "membership", label: "Membership" },
  { key: "booking", label: "Class booking" },
  { key: "training", label: "Personal training" },
  { key: "account", label: "Account and sign-in" },
  { key: "tour", label: "Visit or tour" },
  { key: "trial", label: "Drop-in or trial visit" },
  { key: "general", label: "Something else" },
] as const;

export type ContactTopicKey = (typeof CONTACT_TOPICS)[number]["key"];

export function contactTopicLabel(key?: string | null) {
  return CONTACT_TOPICS.find((topic) => topic.key === key)?.label ?? CONTACT_TOPICS[0].label;
}

/** Link to the contact page with a topic preselected and the page the customer was on. */
export function contactPath(topic?: ContactTopicKey | null, from?: string | null) {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  if (from && from.startsWith("/") && !from.startsWith("//")) params.set("from", from);
  const query = params.toString();
  return query ? `/contact?${query}` : "/contact";
}

/** Google Maps search link for a published street address. */
export function mapLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
