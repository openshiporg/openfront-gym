import { LOGO_ICONS } from "../../platform/store-settings/lib/untitled-logo-registry";

export const DEFAULT_STOREFRONT_HUE = 16;

/** Unsaved tenants use the donor library, without writing settings. */
export const DEFAULT_GYM_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === "boltshift")!.lightSvg;
/** Rotates the library blue to Kinetic orange; independent of brandHue. */
export const DEFAULT_LIBRARY_LOGO_COLOR = "151";

/** Saved logo color is a CSS hue rotation in degrees, as in E-commerce and Restaurant. */
export const DEFAULT_GYM_LOGO_COLOR = "0";

/**
 * Keep operator-provided hues finite and inside one CSS hue turn. This module
 * is browser-safe. SVG sanitization lives in ../utils/gymLogo, which the
 * model, upsert mutation and public projection all enforce.
 */
export function normalizeStorefrontHue(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STOREFRONT_HUE;
  const rounded = Math.round(numeric);
  return ((rounded % 360) + 360) % 360;
}

/** True when a submitted logo color is a finite number of degrees. */
export function isGymLogoColor(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Number(value.trim()));
}

/** Donor `normalizeStoreLogoColor`: any finite degree value folded into [0, 360). */
export function normalizeGymLogoColor(value: unknown): string {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_GYM_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_GYM_LOGO_COLOR;
  return String(((numeric % 360) + 360) % 360);
}

// CSS named colours (CSS Color 4), so a mark painted fill="red" has a real hue.
const NAMED_COLORS: Record<string, string> = Object.fromEntries(
  ("aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 " +
  "blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 " +
  "chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b " +
  "darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b " +
  "darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f " +
  "darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 " +
  "deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 " +
  "fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f " +
  "grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa " +
  "lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff " +
  "lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a " +
  "lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 " +
  "lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd " +
  "mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a " +
  "mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 " +
  "navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 " +
  "palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 " +
  "peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f " +
  "royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d " +
  "silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f " +
  "steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 " +
  "white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32").split(" ").map((entry) => entry.split(":") as [string, string]),
);

type Rgba = { r: number; g: number; b: number; a: number };

const channel = (value: string, scale: number) => {
  const text = value.trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(text.endsWith("%") ? number / 100 : number / scale, 0), 1);
};

function hslToRgb(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  if (!delta) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/**
 * A rendered SVG paint value as a colour, or null for paints without a hue of their own:
 * currentColor/inherit (themed by the surface), none/transparent, and url(#id) references
 * (their gradient stops are paints in their own right).
 */
export function parsePaint(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16) / 255);
    return { r, g, b, a: full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (fn) {
    const parts = fn[2].replace(/\s*\/\s*/, ",").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : channel(parts[3], 1);
    if (alpha === null) return null;
    if (fn[1].startsWith("rgb")) {
      const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, 255));
      return r === null || g === null || b === null ? null : { r, g, b, a: alpha };
    }
    const h = Number.parseFloat(parts[0]), sat = channel(parts[1], 100), light = channel(parts[2], 100);
    if (!Number.isFinite(h) || sat === null || light === null) return null;
    return { ...hslToRgb(((h % 360) + 360) % 360, sat, light), a: alpha };
  }
  const named = NAMED_COLORS[text];
  return named ? parsePaint(`#${named}`) : null;
}

const PAINT_ATTRIBUTE = /\b(fill|stroke|stop-color)(\s*=\s*)("([^"]*)"|'([^']*)')/gi;

function paints(svg: string) {
  return [...svg.matchAll(PAINT_ATTRIBUTE)].map((match) => match[4] ?? match[5] ?? "");
}

/** Hue of a logo's own dominant colour, or null for marks painted only with currentColor/greys. */
export function logoBaseHue(svg: string): number | null {
  const counts = new Map<number, number>();
  for (const value of paints(svg)) {
    const color = parsePaint(value);
    if (!color || color.a === 0) continue;
    const { h, s } = rgbToHsl(color);
    if (s < 0.25) continue;
    const hue = Math.round(h) % 360;
    counts.set(hue, (counts.get(hue) || 0) + 1);
  }
  let best: number | null = null;
  for (const [hue, count] of counts) if (best === null || count > (counts.get(best) || 0)) best = hue;
  return best;
}

const hex2 = (value: number) => Math.round(Math.min(Math.max(value, 0), 1) * 255).toString(16).padStart(2, "0");

/** One paint value turned around the colour wheel; paints without their own hue are unchanged. */
export function rotatePaint(value: string, degrees: number) {
  const color = parsePaint(value);
  if (!color || !degrees) return value;
  const { h, s, l } = rgbToHsl(color);
  if (!s) return value;
  const { r, g, b } = hslToRgb((h + degrees + 360) % 360, s, l);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${color.a < 1 ? hex2(color.a) : ""}`;
}

/**
 * The mark as the storefront renders it: every explicit fill, stroke and gradient stop turned by
 * the saved rotation in the markup itself, while currentColor parts take the themed accent from
 * the surface. Nothing is rotated twice, and fragment references such as url(#id) are untouched.
 */
export function themedLogoSvg(svg: string, degrees: number) {
  if (!degrees) return svg;
  return svg.replace(PAINT_ATTRIBUTE, (whole, name: string, equals: string, quoted: string, double?: string, single?: string) => {
    const value = double ?? single ?? "";
    const turned = rotatePaint(value, degrees);
    if (turned === value) return whole;
    const quote = quoted[0];
    return `${name}${equals}${quote}${turned}${quote}`;
  });
}

export type StorefrontBrandSource = { logoIcon?: string | null; logoColor?: string | null };

/**
 * The storefront theme comes from the saved logo colour, as in Restaurant: the logo's own
 * colour turned by `logoColor` degrees is the accent hue every storefront surface derives its
 * accessible shades from. Explicit paints are turned in the markup (`svg`); a mark drawn with
 * currentColor takes the accent, so for such a mark `logoColor` is the accent hue itself. The
 * legacy brandHue column is kept but no longer chooses the theme.
 */
export function resolveStorefrontBrand(settings: StorefrontBrandSource | null | undefined) {
  const source = settings?.logoIcon || DEFAULT_GYM_LOGO_ICON;
  const rotation = Number(settings?.logoIcon ? normalizeGymLogoColor(settings.logoColor) : DEFAULT_LIBRARY_LOGO_COLOR);
  const base = logoBaseHue(source);
  return {
    svg: themedLogoSvg(source, rotation),
    themeHue: Math.round(base === null ? rotation : (base + rotation) % 360) % 360,
  };
}
