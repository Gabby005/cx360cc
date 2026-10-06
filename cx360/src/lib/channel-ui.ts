/** One list of customer channels, in the order they're shown everywhere (tiles, filters, reports). */
export const CHANNEL_ORDER = ["VOICE", "WHATSAPP", "EMAIL", "SMS", "INSTAGRAM", "MESSENGER", "X", "CHAT", "PORTAL", "SOCIAL"] as const;
export type ChannelKey = (typeof CHANNEL_ORDER)[number];

export const CHANNEL_LABEL: Record<string, string> = {
  VOICE: "Phone",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  INSTAGRAM: "Instagram",
  MESSENGER: "Messenger",
  X: "X (Twitter)",
  CHAT: "Web chat",
  PORTAL: "Portal",
  SOCIAL: "Other social",
};

/** Chart colours (also used for tile accents). */
export const CHANNEL_COLOR: Record<string, string> = {
  VOICE: "#5B5FEF",
  WHATSAPP: "#16A34A",
  EMAIL: "#0EA5E9",
  SMS: "#D97706",
  INSTAGRAM: "#DB2777",
  MESSENGER: "#2563EB",
  X: "#0F172A",
  CHAT: "#7C3AED",
  PORTAL: "#64748B",
  SOCIAL: "#94A3B8",
};

export const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c;
