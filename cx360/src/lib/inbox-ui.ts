/** Priority flags and tracking colours for Inbox messages (safe to import in the browser). */

export const FLAGS = ["URGENT", "HIGH", "LOW"] as const;
export type FlagKey = (typeof FLAGS)[number];

export const FLAG_INFO: Record<FlagKey, { label: string; color: string; rank: number }> = {
  URGENT: { label: "Urgent", color: "#DC2626", rank: 3 },
  HIGH: { label: "High", color: "#EA580C", rank: 2 },
  LOW: { label: "Low", color: "#64748B", rank: 0 },
};
/** Sort rank: urgent first, then high, then normal (no flag), then low. */
export const flagRank = (f: string | null | undefined) => (f && FLAG_INFO[f as FlagKey] ? FLAG_INFO[f as FlagKey].rank : 1);

export const COLOR_TAGS = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "grey"] as const;
export type ColorTag = (typeof COLOR_TAGS)[number];

export const COLOR_INFO: Record<ColorTag, { label: string; hex: string }> = {
  red: { label: "Red", hex: "#DC2626" },
  orange: { label: "Orange", hex: "#EA580C" },
  yellow: { label: "Yellow", hex: "#CA8A04" },
  green: { label: "Green", hex: "#16A34A" },
  blue: { label: "Blue", hex: "#2563EB" },
  purple: { label: "Purple", hex: "#7C3AED" },
  pink: { label: "Pink", hex: "#DB2777" },
  grey: { label: "Grey", hex: "#64748B" },
};
export const colorHex = (c: string | null | undefined) => (c && COLOR_INFO[c as ColorTag] ? COLOR_INFO[c as ColorTag].hex : null);
