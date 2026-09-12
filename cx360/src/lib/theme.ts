/**
 * Converts an admin-chosen brand hex color into CSS custom properties
 * injected at the top of the page (see buildBrandStyleTag). Tailwind's
 * `brand` color tokens (tailwind.config.ts) reference these variables
 * via `rgb(var(--brand-rgb) / <alpha-value>)` instead of static hex, so
 * every `bg-brand`, `text-brand`, `bg-brand/10` etc. utility across the
 * whole app picks up the tenant's color at runtime — no rebuild needed
 * when a tenant changes their brand color.
 *
 * Semantic status colors (sla-ok/warning/breach) are deliberately NOT
 * tied to brand customization — a "breach" should always read as red
 * regardless of brand color, for safety/clarity.
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToTriplet([r, g, b]: [number, number, number]): string {
  return `${r} ${g} ${b}`;
}

function lighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  ];
}

function darken([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [Math.round(r * (1 - amount)), Math.round(g * (1 - amount)), Math.round(b * (1 - amount))];
}

const HEX_PATTERN = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(hex: string): boolean {
  return HEX_PATTERN.test(hex);
}

export function buildBrandStyleTag(hex: string): string {
  const safe = isValidHexColor(hex) ? hex : "#5B5FEF";
  const base = hexToRgb(safe);
  const light = lighten(base, 0.88); // very light tint, for pill/badge backgrounds
  const dark = darken(base, 0.15); // hover state

  return `:root{--brand-rgb:${rgbToTriplet(base)};--brand-light-rgb:${rgbToTriplet(light)};--brand-dark-rgb:${rgbToTriplet(dark)};}`;
}

/** A handful of curated presets shown in the Admin branding picker, alongside a free-form hex input. */
export const BRAND_PRESETS = [
  { name: "Indigo", hex: "#5B5FEF" },
  { name: "Emerald", hex: "#10B981" },
  { name: "Rose", hex: "#E11D48" },
  { name: "Amber", hex: "#D97706" },
  { name: "Sky", hex: "#0284C7" },
  { name: "Violet", hex: "#7C3AED" },
];
