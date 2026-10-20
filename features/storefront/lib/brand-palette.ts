/**
 * Derives accessible storefront accent colours from the tenant's published brand hue.
 * Presentation-only: the hue is the only input, and every output meets WCAG AA for its role.
 */
const WHITE = { r: 255, g: 255, b: 255 }; // --sf-canvas (light) and text on the accent fill
const INK = { r: 12, g: 13, b: 15 }; // --sf-ink (light)
const DARK_CANVAS = { r: 11, g: 12, b: 14 }; // --sf-canvas (dark)
const NIGHT_RAISED = { r: 29, g: 32, b: 36 }; // --sf-raised (dark), the darkest surface accent text sits on

type Rgb = { r: number; g: number; b: number };

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function luminance({ r, g, b }: Rgb) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** Walks lightness in one direction until the colour reaches the target contrast against every surface. */
function accessibleLightness(h: number, s: number, start: number, surfaces: Rgb[], step: number, target = 4.6) {
  let l = start;
  while (l > 6 && l < 96 && surfaces.some((surface) => contrast(hslToRgb(h, s, l), surface) < target)) l += step;
  return l;
}

export function normalizeBrandHue(value: unknown, fallback = 16) {
  const hue = Number(value);
  return Number.isFinite(hue) ? Math.min(359, Math.max(0, Math.round(hue))) : fallback;
}

export function brandPalette(hueInput: unknown) {
  const h = normalizeBrandHue(hueInput);
  // Button fill: prefer white text on a deep accent; hues that only pass when muddy (yellows) use ink text instead.
  const whiteFillL = accessibleLightness(h, 82, 48, [WHITE], -1, 4.5);
  const useWhite = whiteFillL >= 34;
  const fillL = useWhite ? whiteFillL : accessibleLightness(h, 88, 52, [INK], 1, 4.5);
  const textLight = accessibleLightness(h, 80, 44, [WHITE], -1);
  const textDark = accessibleLightness(h, 90, 60, [DARK_CANVAS, NIGHT_RAISED], 1);
  return {
    hue: h,
    fill: hsl(h, useWhite ? 82 : 88, fillL),
    onFill: useWhite ? "#ffffff" : "#0c0d0f",
    textLight: hsl(h, 80, textLight),
    textDark: hsl(h, 90, textDark),
  };
}

/** CSS custom properties for :root so portalled dialogs and menus share the tenant accent. */
export function brandPaletteCss(hueInput: unknown) {
  const p = brandPalette(hueInput);
  return `:root{--brand-hue:${p.hue};--sf-accent-fill:${p.fill};--sf-accent-on:${p.onFill};--sf-accent-text-light:${p.textLight};--sf-accent-text-dark:${p.textDark};}`;
}
