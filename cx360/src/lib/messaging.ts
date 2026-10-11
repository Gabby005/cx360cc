/**
 * Messaging settings: the signature added to every agent email, and the
 * automatic "we got your message" replies per channel.
 * Stored as JSON in Tenant.messagingSettings; every field has a safe default.
 */
export const AUTO_CHANNELS = ["EMAIL", "WHATSAPP", "SMS", "INSTAGRAM", "MESSENGER", "X", "VOICE"] as const;
export type AutoChannel = (typeof AUTO_CHANNELS)[number];

export const AUTO_LABEL: Record<AutoChannel, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  INSTAGRAM: "Instagram",
  MESSENGER: "Facebook",
  X: "X (Twitter)",
  VOICE: "Missed phone call (sent as SMS)",
};

export type MessagingSettings = {
  signature: { enabled: boolean; bankName: string; surveyUrl: string };
  autoReply: { cooldownHours: number; channels: Record<AutoChannel, { enabled: boolean; text: string }> };
};

const DEFAULT_TEXT: Record<AutoChannel, string> = {
  EMAIL: "Thank you for contacting {bank}. We have received your email and an agent will respond shortly. Please reply on this same mail trail.",
  WHATSAPP: "Thank you for contacting {bank}. We have received your message and an agent will respond shortly.",
  SMS: "Thank you for contacting {bank}. We have received your message and will respond shortly.",
  INSTAGRAM: "Thank you for contacting {bank}. We have received your message and an agent will respond shortly.",
  MESSENGER: "Thank you for contacting {bank}. We have received your message and an agent will respond shortly.",
  X: "Thank you for contacting {bank}. We have received your message and an agent will respond shortly.",
  VOICE: "Sorry we missed your call to {bank}. An agent will call you back shortly.",
};

export function defaultMessaging(): MessagingSettings {
  const channels = {} as MessagingSettings["autoReply"]["channels"];
  for (const c of AUTO_CHANNELS) channels[c] = { enabled: false, text: DEFAULT_TEXT[c] };
  return { signature: { enabled: true, bankName: "PremiumTrust Bank", surveyUrl: "" }, autoReply: { cooldownHours: 6, channels } };
}

const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);

export function parseMessaging(raw: unknown): MessagingSettings {
  const d = defaultMessaging();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const sig = (r.signature ?? {}) as Record<string, unknown>;
  d.signature = {
    enabled: sig.enabled === false ? false : true,
    bankName: str(sig.bankName, 80, d.signature.bankName) || d.signature.bankName,
    surveyUrl: str(sig.surveyUrl, 500, ""),
  };
  const ar = (r.autoReply ?? {}) as Record<string, any>;
  const h = Number(ar.cooldownHours);
  d.autoReply.cooldownHours = Number.isFinite(h) ? Math.min(72, Math.max(1, Math.round(h))) : 6;
  for (const c of AUTO_CHANNELS) {
    const x = (ar.channels?.[c] ?? {}) as Record<string, unknown>;
    d.autoReply.channels[c] = { enabled: x.enabled === true, text: str(x.text, 600, DEFAULT_TEXT[c]) || DEFAULT_TEXT[c] };
  }
  return d;
}

export const isHttpUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u);

/** Adds the bank's sign-off to an agent's email. The survey link goes on its own line so mail apps make it clickable. */
export function withSignature(body: string, agentName: string, s: MessagingSettings): string {
  if (!s.signature.enabled) return body;
  const lines = [
    body.replace(/\s+$/, ""),
    "",
    `Thank you for choosing ${s.signature.bankName}`,
    "Please reply via the same mail trail",
    "",
    "Regards,",
    agentName,
  ];
  if (isHttpUrl(s.signature.surveyUrl)) lines.push("", "Tell us how we did:", s.signature.surveyUrl);
  return lines.join("\n");
}

export const autoReplyText = (text: string, bank: string) => text.replaceAll("{bank}", bank);

/** Mail that must never get an automatic answer (robots, bounces, no-reply boxes) — stops reply loops. */
export const isRobotAddress = (a: string) => /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)([._-]|@)/i.test(a);
