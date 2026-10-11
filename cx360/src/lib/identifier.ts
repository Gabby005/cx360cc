/** How to identify a customer on each channel: phone number, email, or social handle. */
type Cust = { email?: string | null; phone?: string | null; customFields?: unknown } | null | undefined;

const SOCIAL: Record<string, { idKey: string; handleKey: string; label: string; prefix: string }> = {
  INSTAGRAM: { idKey: "instagramId", handleKey: "instagramHandle", label: "Instagram handle", prefix: "@" },
  X: { idKey: "xId", handleKey: "xHandle", label: "X handle", prefix: "@" },
  MESSENGER: { idKey: "messengerId", handleKey: "facebookName", label: "Facebook name", prefix: "" },
};

export type Identifier = { label: string; value: string | null; editKey?: string; editLabel?: string };

export function identifierFor(channel: string, contact: string | null | undefined, c: Cust): Identifier {
  const cf = (c?.customFields ?? {}) as Record<string, unknown>;
  const soc = SOCIAL[channel];
  if (soc) {
    const h = typeof cf[soc.handleKey] === "string" ? (cf[soc.handleKey] as string) : null;
    return { label: soc.label, value: h ? `${soc.prefix}${h.replace(/^@/, "")}` : null, editKey: soc.handleKey, editLabel: soc.label };
  }
  if (channel === "EMAIL") return { label: "Email", value: contact ?? c?.email ?? null };
  if (channel === "WHATSAPP") return { label: "WhatsApp number", value: contact ?? c?.phone ?? null };
  if (channel === "SMS" || channel === "VOICE") return { label: "Phone", value: contact ?? c?.phone ?? null };
  return { label: "Contact", value: contact ?? c?.phone ?? c?.email ?? null };
}
