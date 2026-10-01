/**
 * Extra customer details shown on the customer summary card (new-case page),
 * chosen by a Super Admin — e.g. BVN, date of birth, address — as available
 * from the core banking system (Flexcube).
 *
 * Values are read from the customer's `customFields` by `key` (case-insensitive).
 * Until Flexcube is connected, supply them via the customers API; once it is
 * connected, the sync fills `customFields` and the card shows live values.
 */
export type SummaryField = { key: string; label: string; sensitive: boolean };

export const MAX_SUMMARY_FIELDS = 12;
export const FIELD_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** One-click suggestions in the admin screen. */
export const SUGGESTED_FIELDS: SummaryField[] = [
  { key: "bvn", label: "BVN", sensitive: true },
  { key: "dob", label: "Date of birth", sensitive: false },
  { key: "address", label: "Address", sensitive: false },
  { key: "nin", label: "NIN", sensitive: true },
  { key: "gender", label: "Gender", sensitive: false },
  { key: "occupation", label: "Occupation", sensitive: false },
  { key: "branch", label: "Home branch", sensitive: false },
  { key: "accountOfficer", label: "Account officer", sensitive: false },
];

export function parseSummaryFields(raw: unknown): SummaryField[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryField[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { key, label, sensitive } = r as Record<string, unknown>;
    if (typeof key !== "string" || !FIELD_KEY_RE.test(key)) continue;
    out.push({ key, label: typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : key, sensitive: sensitive === true });
    if (out.length >= MAX_SUMMARY_FIELDS) break;
  }
  return out;
}
