import crypto from "crypto";

/**
 * X (Twitter) direct messages.
 *  - Incoming: X's webhook (Activity API, event "dm.received") posts here.
 *  - Outgoing: POST /2/dm_conversations/with/:id/messages with the connected account's token.
 *  - Sign-in: OAuth 2.0 with PKCE; access tokens are short-lived and refreshed (see token-store.ts).
 * Encrypted "X Chat" messages can't be read through this route.
 */
const API = "https://api.x.com";
const TIMEOUT_MS = 10_000;
export const X_SCOPES = "dm.read dm.write tweet.read users.read offline.access";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type SendResult = { ok: boolean; error?: string };
const defaultFetch: FetchLike = (u, i) => fetch(u, i);

const b64 = (buf: Buffer) => buf.toString("base64");
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Answer to X's periodic "is this really your endpoint" check. */
export function xCrcResponse(crcToken: string, clientSecret: string): string {
  return "sha256=" + b64(crypto.createHmac("sha256", clientSecret).update(crcToken).digest());
}

/** Signature header on each event: "sha256=" + base64(HMAC-SHA256(raw body, client secret)). */
export function verifyXSignature(rawBody: string, header: string | null, clientSecret: string): boolean {
  if (!header || !clientSecret) return false;
  const expected = "sha256=" + b64(crypto.createHmac("sha256", clientSecret).update(rawBody).digest());
  return safeEq(expected, header);
}

export type XMessage = { externalId: string; contact: string; name?: string; body: string; receivedAt?: Date; toId: string };

const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asArr = (v: unknown) => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Customer messages from an X event body. Handles the Activity API envelope and the older flat shape. */
export function parseXWebhook(payload: unknown): XMessage[] {
  const root = asObj(payload);
  const data = asObj(root.data);
  const inner = Object.keys(data).length ? asObj(data.payload) : root;
  if (Object.keys(data).length && str(data.event_type) && str(data.event_type) !== "dm.received") return [];
  const users = asObj(inner.users);
  const out: XMessage[] = [];
  for (const ev of asArr(inner.direct_message_events)) {
    const e = asObj(ev);
    if (str(e.type) && str(e.type) !== "message_create") continue;
    const mc = asObj(e.message_create);
    const sender = str(mc.sender_id), to = str(asObj(mc.target).recipient_id), id = str(e.id);
    if (!sender || !to || !id || sender === to) continue;
    const md = asObj(mc.message_data);
    const attachment = asObj(md.attachment);
    const text = str(md.text) || (Object.keys(attachment).length ? "[Attachment]" : "");
    if (!text) continue;
    const u = asObj(users[sender]);
    const ts = Number(str(e.created_timestamp));
    out.push({
      externalId: id,
      contact: sender,
      name: str(u.name) || (str(u.screen_name) ? `@${str(u.screen_name)}` : undefined),
      body: text,
      receivedAt: Number.isFinite(ts) && ts > 0 ? new Date(ts) : undefined,
      toId: to,
    });
  }
  return out;
}

async function timed(f: FetchLike, url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: ctrl.signal, redirect: "manual" });
  } finally {
    clearTimeout(t);
  }
}
const describe = (err: unknown) => ((err as { name?: string })?.name === "AbortError" ? "X didn't answer within 10 seconds." : `Couldn't reach X: ${(err as Error)?.message ?? "unknown error"}`);

export async function sendX(accessToken: string, participantId: string, text: string, f: FetchLike = defaultFetch): Promise<SendResult> {
  if (!/^\d{1,25}$/.test(participantId)) return { ok: false, error: "This customer has no valid X user id." };
  try {
    const res = await timed(f, `${API}/2/dm_conversations/with/${participantId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ text: text.slice(0, 9000) }),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
    return { ok: false, error: `X answered HTTP ${res.status}${j.detail || j.title ? `: ${(j.detail ?? j.title ?? "").replace(accessToken, "***").slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

// ---- Sign-in (OAuth 2.0 + PKCE) ---------------------------------------------------------

export function newPkce() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: crypto.randomBytes(16).toString("hex") };
}

export function xAuthorizeUrl(a: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({ response_type: "code", client_id: a.clientId, redirect_uri: a.redirectUri, scope: X_SCOPES, state: a.state, code_challenge: a.challenge, code_challenge_method: "S256" });
  return `https://x.com/i/oauth2/authorize?${q.toString()}`;
}

export type XTokens = { accessToken: string; refreshToken: string | null; expiresAt: number };
type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string; detail?: string };

async function tokenCall(clientId: string, clientSecret: string, body: Record<string, string>, f: FetchLike): Promise<{ ok: true; tokens: XTokens } | { ok: false; error: string }> {
  try {
    const res = await timed(f, `${API}/2/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64") },
      body: new URLSearchParams(body).toString(),
    });
    const j = (await res.json().catch(() => ({}))) as TokenReply;
    if (!res.ok || !j.access_token) return { ok: false, error: `X sign-in answered HTTP ${res.status}${j.error_description || j.detail || j.error ? `: ${String(j.error_description ?? j.detail ?? j.error).slice(0, 200)}` : ""}` };
    return { ok: true, tokens: { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000 } };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export const exchangeXCode = (clientId: string, clientSecret: string, code: string, redirectUri: string, verifier: string, f: FetchLike = defaultFetch) =>
  tokenCall(clientId, clientSecret, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId }, f);

export const refreshXToken = (clientId: string, clientSecret: string, refreshToken: string, f: FetchLike = defaultFetch) =>
  tokenCall(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }, f);

/** App-only token, needed to register the webhook. */
export async function xAppToken(clientId: string, clientSecret: string, f: FetchLike = defaultFetch): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const r = await tokenCall(clientId, clientSecret, { grant_type: "client_credentials" }, f);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, token: r.tokens.accessToken };
}

export async function xMe(accessToken: string, f: FetchLike = defaultFetch): Promise<{ ok: true; id: string; username: string } | { ok: false; error: string }> {
  try {
    const res = await timed(f, `${API}/2/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = (await res.json().catch(() => ({}))) as { data?: { id?: string; username?: string }; detail?: string };
    if (!res.ok || !j.data?.id) return { ok: false, error: `X answered HTTP ${res.status}${j.detail ? `: ${j.detail.slice(0, 200)}` : ""}` };
    return { ok: true, id: j.data.id, username: j.data.username ?? "" };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

/** Registers (or finds) the webhook, then subscribes the connected account's incoming DMs to it. */
export async function registerXWebhook(a: { appToken: string; userToken: string; userId: string; url: string }, f: FetchLike = defaultFetch): Promise<{ ok: true; webhookId: string } | { ok: false; error: string }> {
  try {
    let webhookId = "";
    const create = await timed(f, `${API}/2/webhooks`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.appToken}` }, body: JSON.stringify({ url: a.url }) });
    const cj = (await create.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string };
    if (create.ok && cj.data?.id) webhookId = cj.data.id;
    else {
      // Already registered? Look it up.
      const list = await timed(f, `${API}/2/webhooks`, { headers: { Authorization: `Bearer ${a.appToken}` } });
      const lj = (await list.json().catch(() => ({}))) as { data?: { id?: string; url?: string }[] };
      webhookId = lj.data?.find((w) => w.url === a.url)?.id ?? "";
      if (!webhookId) return { ok: false, error: `X would not register the webhook (HTTP ${create.status}${cj.detail ? `: ${cj.detail.slice(0, 200)}` : ""}). Check the address is public https and that CX360_X_CLIENT_SECRET is set.` };
    }
    const sub = await timed(f, `${API}/2/activity/subscriptions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.userToken}` }, body: JSON.stringify({ event_type: "dm.received", filter: { user_id: a.userId }, webhook_id: webhookId }) });
    if (!sub.ok) {
      const sj = (await sub.json().catch(() => ({}))) as { detail?: string };
      // A repeat registration is fine.
      if (!/already|duplicate|exist/i.test(sj.detail ?? "")) return { ok: false, error: `Webhook registered, but X refused the DM subscription (HTTP ${sub.status}${sj.detail ? `: ${sj.detail.slice(0, 200)}` : ""}).` };
    }
    return { ok: true, webhookId };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}
