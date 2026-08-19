const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio",
]);

const ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
const TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
const MAX_LOGO_LENGTH = 50_000;

/**
 * Allowlist sanitizer for inline storefront SVG. It deliberately rejects all
 * executable markup, external loads, and style attributes before the value can
 * reach dangerouslySetInnerHTML.
 */
export function sanitizeGymLogoSvg(value: unknown): string {
  if (typeof value !== "string") return "";
  const source = value.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > MAX_LOGO_LENGTH) {
    return "";
  }
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }

  let tagCount = 0;
  let match: RegExpExecArray | null;
  TAG_PATTERN.lastIndex = 0;
  while ((match = TAG_PATTERN.exec(source))) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) continue;

    const attributes = match[2];
    let consumed = "";
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch: RegExpExecArray | null;
    while ((attributeMatch = ATTRIBUTE_PATTERN.exec(attributes))) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const attributeValue = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(attributeValue)) return "";
      if (/url\(/i.test(attributeValue) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(attributeValue)) return "";
    }

    if (attributes.replace(consumed, "").replace(/\//g, "").trim()) return "";
  }

  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}
