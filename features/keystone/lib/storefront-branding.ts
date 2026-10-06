export const DEFAULT_STOREFRONT_HUE = 16;

/**
 * Keep operator-provided hues finite and inside one CSS hue turn. This module
 * is browser-safe; SVG sanitization remains a server-only concern.
 */
export function normalizeStorefrontHue(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STOREFRONT_HUE;
  const rounded = Math.round(numeric);
  return ((rounded % 360) + 360) % 360;
}
