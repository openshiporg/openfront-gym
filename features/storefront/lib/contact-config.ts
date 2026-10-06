/** Gym Settings hours are authoritative; contact-topic prose is not a second timetable. */
export function publishedHours(hours?: Record<string, string> | null) {
  return Object.entries(hours || {}).filter(([, value]) => typeof value === "string" && value.trim());
}

export function contactTopicsWithHours(
  topics: Array<{ title: string; details: string[] }>,
  hours?: Record<string, string> | null,
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
