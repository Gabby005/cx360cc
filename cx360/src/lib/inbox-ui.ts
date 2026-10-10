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

/** Team codes: the colour tags are named by the team (Team A, Team B, ...) and can be edited by supervisors. */
export type TeamTag = { key: string; name: string; color: string };

export const TAG_PALETTE = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#64748B", "#0F172A", "#92400E", "#65A30D"];

export const DEFAULT_TAGS: TeamTag[] = [
  { key: "red", name: "Team A", color: "#DC2626" },
  { key: "blue", name: "Team B", color: "#2563EB" },
  { key: "green", name: "Team C", color: "#16A34A" },
  { key: "orange", name: "Team D", color: "#EA580C" },
  { key: "purple", name: "Team E", color: "#7C3AED" },
  { key: "pink", name: "Team F", color: "#DB2777" },
];

export const TAG_KEY_RE = /^[a-z0-9_]{1,40}$/;
export const TAG_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
export const MAX_TAGS = 20;

/** Reads the saved team codes; falls back to Team A–F when nothing has been saved. */
export function resolveTags(json: unknown): TeamTag[] {
  if (!Array.isArray(json)) return DEFAULT_TAGS;
  const out: TeamTag[] = [];
  for (const t of json) {
    const r = t as Partial<TeamTag> | null;
    if (r && typeof r.key === "string" && TAG_KEY_RE.test(r.key) && typeof r.name === "string" && r.name.trim() && typeof r.color === "string" && TAG_COLOR_RE.test(r.color)) {
      out.push({ key: r.key, name: r.name.trim().slice(0, 24), color: r.color });
    }
  }
  return out.length ? out : DEFAULT_TAGS;
}

/** The team code for a message's tag key (older colour tags and removed teams still show something sensible). */
export function tagFor(tags: TeamTag[], key: string | null | undefined): TeamTag | null {
  if (!key) return null;
  const found = tags.find((t) => t.key === key);
  if (found) return found;
  const legacy = COLOR_INFO[key as ColorTag];
  if (legacy) return { key, name: legacy.label, color: legacy.hex };
  return { key, name: "Removed team", color: "#94A3B8" };
}
