import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Storefront photos that ship with the app under public/images. A record's own image wins; when
 * it has none, the asset named after the record (by slug) is used if that file exists, and the
 * caller falls back to its photo-less design otherwise. Never a random image.
 *
 *   public/images/classes/<class-type-slug>.jpg   e.g. classes/spin-class.jpg
 *   public/images/plans/<membership-tier-slug>.jpg  e.g. plans/unlimited-monthly.jpg
 *   public/images/coach-<instructor-name-slug>.jpg  e.g. coach-sarah-johnson.jpg
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");
const seen = new Map<string, boolean>();

export function mediaSlug(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicAsset(relative: string): string | null {
  if (!seen.has(relative)) seen.set(relative, existsSync(path.join(PUBLIC_DIR, relative)));
  return seen.get(relative) ? `/${relative}` : null;
}

function named(folder: string, prefix: string, name: string | null | undefined) {
  const slug = mediaSlug(name);
  return slug ? publicAsset(`images/${folder}${prefix}${slug}.jpg`) : null;
}

export const classTypePhoto = (name: string | null | undefined) => named("classes/", "", name);
export const membershipPlanPhoto = (name: string | null | undefined) => named("plans/", "", name);
export const coachPhoto = (own: string | null | undefined, name: string | null | undefined) => own || named("", "coach-", name);
