import crypto from "crypto";
import type { Channel } from "@prisma/client";

/** Meta (WhatsApp Business, Instagram, Messenger) webhook handling and sending. */

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 10_000;

/** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(raw body, app secret). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type MetaMessage = {
  channel: Extract<Channel, "WHATSAPP" | "INSTAGRAM" | "MESSENGER">;
  externalId: string;
  contact: string; // WhatsApp number, or the Instagram/Messenger-scoped id
  name?: string;
  body: string;
  receivedAt?: Date;
  /** WhatsApp phone-number id / Page id the message was sent to, so other numbers' traffic can be ignored. */
  toId: string;
};

const asObj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asArr = (v: unknown) => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

const NON_TEXT: Record<string, string> = { image: "[Image]", audio: "[Voice note]", video: "[Video]", document: "[Document]", sticker: "[Sticker]", location: "[Location]", contacts: "[Contact card]", reaction: "" };

/** Pulls customer messages out of a Meta webhook body. Anything else (delivery receipts, echoes, reactions) is skipped. */
export function parseMetaWebhook(payload: unknown): MetaMessage[] {
  const p = asObj(payload);
  const out: MetaMessage[] = [];
  const object = str(p.object);

  if (object === "whatsapp_business_account") {
    for (const entry of asArr(p.entry)) for (const ch of asArr(asObj(entry).changes)) {
      const v = asObj(asObj(ch).value);
      const toId = str(asObj(v.metadata).phone_number_id);
      const names = new Map(asArr(v.contacts).map((c) => [str(asObj(c).wa_id), str(asObj(asObj(c).profile).name)]));
      for (const raw of asArr(v.messages)) {
        const m = asObj(raw);
        const type = str(m.type);
        let body = type === "text" ? str(asObj(m.text).body) : type === "button" ? str(asObj(m.button).text) : type === "interactive" ? str(asObj(asObj(m.interactive).button_reply).title) || str(asObj(asObj(m.interactive).list_reply).title) : NON_TEXT[type] ?? `[${type || "message"}]`;
        const caption = str(asObj(m[type]).caption);
        if (caption && NON_TEXT[type]) body = `${body} ${caption}`;
        if (!body || !str(m.id) || !str(m.from)) continue;
        out.push({ channel: "WHATSAPP", externalId: str(m.id), contact: str(m.from), name: names.get(str(m.from)) || undefined, body, receivedAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined, toId });
      }
    }
    return out;
  }

  if (object === "instagram" || object === "page") {
    const channel = object === "instagram" ? "INSTAGRAM" : "MESSENGER";
    for (const entry of asArr(p.entry)) {
      const e = asObj(entry);
      for (const raw of asArr(e.messaging)) {
        const ev = asObj(raw);
        const msg = asObj(ev.message);
        if (!msg.mid || msg.is_echo === true) continue; // our own replies echo back; ignore
        const attachments = asArr(msg.attachments);
        const body = str(msg.text) || (attachments.length ? `[${str(asObj(attachments[0]).type) || "attachment"}]` : "");
        const sender = str(asObj(ev.sender).id);
        if (!body || !sender) continue;
        out.push({ channel, externalId: str(msg.mid), contact: sender, body, receivedAt: ev.timestamp ? new Date(Number(ev.timestamp)) : undefined, toId: str(asObj(ev.recipient).id) || str(e.id) });
      }
    }
  }
  return out;
}

export type SendResult = { ok: boolean; error?: string };
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function post(url: string, token: string, body: unknown, f: FetchLike): Promise<SendResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: ctrl.signal, redirect: "manual" });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    return { ok: false, error: `Meta answered HTTP ${res.status}${j.error?.message ? `: ${j.error.message.replace(token, "***").slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: (err as { name?: string })?.name === "AbortError" ? "Meta didn't answer within 10 seconds." : `Couldn't reach Meta: ${(err as Error)?.message ?? "unknown error"}` };
  } finally {
    clearTimeout(t);
  }
}

export async function sendMeta(
  channel: "whatsapp" | "instagram" | "messenger",
  args: { to: string; message: string; phoneNumberId?: string },
  opts: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike } = {}
): Promise<SendResult> {
  const env = opts.env ?? process.env;
  const f: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const text = args.message.slice(0, channel === "whatsapp" ? 4000 : 1000);
  if (channel === "whatsapp") {
    const token = env.CX360_WHATSAPP_TOKEN;
    if (!token) return { ok: false, error: "The server variable CX360_WHATSAPP_TOKEN isn't set." };
    if (!args.phoneNumberId) return { ok: false, error: "The WhatsApp phone number ID isn't set (Admin → Channels)." };
    return post(`${GRAPH}/${args.phoneNumberId}/messages`, token, { messaging_product: "whatsapp", to: args.to.replace(/\D/g, ""), type: "text", text: { body: text } }, f);
  }
  const token = env.CX360_META_PAGE_TOKEN;
  if (!token) return { ok: false, error: "The server variable CX360_META_PAGE_TOKEN isn't set." };
  return post(`${GRAPH}/me/messages`, token, { recipient: { id: args.to }, messaging_type: "RESPONSE", message: { text } }, f);
}

/** Free-form replies are only allowed within 24 hours of the customer's last message. */
export const REPLY_WINDOW_MS = 24 * 3_600_000;
