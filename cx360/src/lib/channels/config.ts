/** Inbound channel settings (stored on the tenant). IDs only — tokens and secrets live in server variables. */
export type ChannelSettings = {
  email: { pollMailbox: boolean; mailbox: string }; // blank mailbox = the address email is sent from
  whatsapp: { phoneNumberId: string };
  meta: { pageId: string; instagram: boolean; messenger: boolean };
  /** Filled in by the "Connect X account" flow — not edited by hand. */
  x: { enabled: boolean; userId: string; username: string; webhookId: string };
};
export const DEFAULT_CHANNELS: ChannelSettings = { email: { pollMailbox: false, mailbox: "" }, whatsapp: { phoneNumberId: "" }, meta: { pageId: "", instagram: false, messenger: false }, x: { enabled: false, userId: "", username: "", webhookId: "" } };

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const o = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseChannelSettings(raw: unknown): ChannelSettings {
  const r = o(raw), e = o(r.email), w = o(r.whatsapp), m = o(r.meta), x = o(r.x);
  return {
    email: { pollMailbox: e.pollMailbox === true, mailbox: s(e.mailbox, 200) },
    whatsapp: { phoneNumberId: /^\d{5,25}$/.test(s(w.phoneNumberId, 25)) ? s(w.phoneNumberId, 25) : "" },
    meta: { pageId: /^\d{5,25}$/.test(s(m.pageId, 25)) ? s(m.pageId, 25) : "", instagram: m.instagram === true, messenger: m.messenger === true },
    x: { enabled: x.enabled === true, userId: /^\d{1,25}$/.test(s(x.userId, 25)) ? s(x.userId, 25) : "", username: s(x.username, 60).replace(/[^A-Za-z0-9_]/g, ""), webhookId: /^\d{1,25}$/.test(s(x.webhookId, 25)) ? s(x.webhookId, 25) : "" },
  };
}

/** Server variables each channel needs (names without the CX360_ prefix). */
export const CHANNEL_SECRETS = {
  inbound: ["INBOUND_TOKEN"], // email / SMS / voice webhooks
  meta: ["META_VERIFY_TOKEN", "META_APP_SECRET"], // WhatsApp, Instagram, Messenger webhooks
  whatsappSend: ["WHATSAPP_TOKEN"],
  metaSend: ["META_PAGE_TOKEN"], // Instagram + Messenger replies
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET", "TOKEN_KEY"], // X (Twitter) app + the key that protects saved sign-in tokens
} as const;

export const secretSet = (name: string, env: Record<string, string | undefined> = process.env) => !!env[`CX360_${name}`];
