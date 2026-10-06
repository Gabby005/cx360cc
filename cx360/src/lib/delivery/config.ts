/**
 * How CX360 reaches the bank's own email and SMS systems.
 *
 * Settings (URLs, field layout, sender names) are stored in
 * Tenant.deliverySettings and edited in Admin → Notification centre →
 * Delivery. SECRETS (API keys, client secrets) are never stored there: a
 * setting refers to one as {{secret:NAME}}, and the server reads it from the
 * environment variable CX360_NAME that the bank's IT team sets in Netlify.
 */

export type Header = { name: string; value: string };

export type HttpEmailConfig = {
  provider: "http";
  url: string;
  headers: Header[];
  contentType: "json" | "form";
  body: string;
  sender: string; // from address
  fromName: string;
  successContains: string;
};
export type GraphEmailConfig = {
  provider: "graph"; // Microsoft 365 / Exchange Online. Secret: CX360_GRAPH_CLIENT_SECRET
  azureTenantId: string;
  clientId: string;
  sender: string; // the mailbox the app sends as
  fromName: string;
};
export type EmailConfig = { provider: "none" } | HttpEmailConfig | GraphEmailConfig;

export type PhoneFormat = "digits" | "plus" | "asis"; // 2348031234567 | +2348031234567 | as stored
export type HttpSmsConfig = {
  provider: "http";
  url: string;
  method: "POST" | "GET";
  headers: Header[];
  contentType: "json" | "form";
  body: string; // for GET: leave empty and put {{placeholders}} in the URL query
  senderId: string;
  phoneFormat: PhoneFormat;
  countryCode: string; // used to turn 0803… into 234803…
  successContains: string;
};
export type SmsConfig = { provider: "none" } | HttpSmsConfig;

export type DeliverySettings = { email: EmailConfig; sms: SmsConfig };

export const DEFAULT_DELIVERY: DeliverySettings = { email: { provider: "none" }, sms: { provider: "none" } };

export const GRAPH_SECRET = "GRAPH_CLIENT_SECRET";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const headers = (v: unknown): Header[] =>
  Array.isArray(v)
    ? v
        .filter((h): h is Header => !!h && typeof h.name === "string" && typeof h.value === "string")
        .slice(0, 10)
        .map((h) => ({ name: h.name.slice(0, 40), value: h.value.slice(0, 500) }))
    : [];

/** Reads whatever is stored and always returns a complete, safe settings object. */
export function parseDeliverySettings(raw: unknown): DeliverySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { email?: Record<string, unknown>; sms?: Record<string, unknown> };
  const e = r.email ?? {};
  const s = r.sms ?? {};

  let email: EmailConfig = { provider: "none" };
  if (e.provider === "http") {
    email = {
      provider: "http",
      url: str(e.url, 500),
      headers: headers(e.headers),
      contentType: e.contentType === "form" ? "form" : "json",
      body: str(e.body, 4000),
      sender: str(e.sender, 200),
      fromName: str(e.fromName, 100),
      successContains: str(e.successContains, 100),
    };
  } else if (e.provider === "graph") {
    email = { provider: "graph", azureTenantId: str(e.azureTenantId, 64), clientId: str(e.clientId, 64), sender: str(e.sender, 200), fromName: str(e.fromName, 100) };
  }

  let sms: SmsConfig = { provider: "none" };
  if (s.provider === "http") {
    sms = {
      provider: "http",
      url: str(s.url, 500),
      method: s.method === "GET" ? "GET" : "POST",
      headers: headers(s.headers),
      contentType: s.contentType === "form" ? "form" : "json",
      body: str(s.body, 4000),
      senderId: str(s.senderId, 20),
      phoneFormat: s.phoneFormat === "plus" || s.phoneFormat === "asis" ? s.phoneFormat : "digits",
      countryCode: /^\d{1,4}$/.test(str(s.countryCode, 4)) ? str(s.countryCode, 4) : "234",
      successContains: str(s.successContains, 100),
    };
  }
  return { email, sms };
}

export const connected = (c: EmailConfig | SmsConfig) => c.provider !== "none";

// ---- secrets ----------------------------------------------------------------

export const SECRET_RE = /\{\{\s*secret:([A-Z0-9_]{1,40})\s*\}\}/g;

/** Names (without the CX360_ prefix) of every secret a config refers to. */
export function secretsUsed(settings: DeliverySettings): string[] {
  const texts: string[] = [];
  for (const c of [settings.email, settings.sms]) {
    if (c.provider === "http") texts.push(c.url, c.body, ...c.headers.map((h) => h.value));
  }
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(SECRET_RE)) names.add(m[1]);
  if (settings.email.provider === "graph") names.add(GRAPH_SECRET);
  return [...names];
}

export const secretEnvName = (name: string) => `CX360_${name}`;

/** Which referenced secrets exist on the server (names only — values are never read out). */
export function secretStatus(settings: DeliverySettings, env: Record<string, string | undefined> = process.env): Record<string, boolean> {
  return Object.fromEntries(secretsUsed(settings).map((n) => [n, !!env[secretEnvName(n)]]));
}

// ---- safety checks ----------------------------------------------------------

/** Only public https endpoints; no localhost or private network addresses (guards the server from being pointed at internal services). */
export function checkGatewayUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.replace(SECRET_RE, "x").replace(/\{\{[^}]*\}\}/g, "x"));
  } catch {
    return "That isn't a valid web address.";
  }
  // Self-hosted inside the bank network: the SMS gateway, core banking and webhooks are internal addresses.
  // IT switches this on with the server variable CX360_ALLOW_INTERNAL_URLS=true.
  if (process.env.CX360_ALLOW_INTERNAL_URLS === "true") return u.protocol === "https:" || u.protocol === "http:" ? null : "The address must start with http:// or https://";
  if (u.protocol !== "https:") return "The address must start with https://";
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return "Internal addresses can't be used — the gateway must be reachable from the internet.";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "Private network addresses can't be used from the internet-hosted app.";
  }
  if (h.startsWith("[") || h.includes(":")) return "Use a host name rather than an IPv6 address.";
  return null;
}

const SENSITIVE_HEADER = /^(authorization|x-api-key|api-key|apikey|x-auth-token|auth-token|token|secret|x-secret|password)$/i;
const SENSITIVE_BODY = /(api[_-]?key|apikey|secret|password|passwd|token|authorization)["']?\s*[:=]\s*["']?(?!\{\{)[^"'&\s,}]{6,}/i;

/** Catches secrets pasted straight into a setting instead of using {{secret:NAME}}. */
export function findPastedSecret(c: { headers: Header[]; body: string; url: string }): string | null {
  for (const h of c.headers) {
    if (SENSITIVE_HEADER.test(h.name) && !/\{\{\s*secret:/.test(h.value)) {
      return `The "${h.name}" header looks like it holds a secret. Don't paste it here — write {{secret:NAME}} and set the real value as the server variable CX360_NAME.`;
    }
  }
  // Placeholders like {{secret:NAME}} are the *right* way to do this, so blank them out before scanning.
  const scan = `${c.body}\n${c.url}`.replace(/\{\{[^}]*\}\}/g, "X");
  if (SENSITIVE_BODY.test(scan)) return "Part of the message body or address looks like a pasted secret (key, token or password). Use {{secret:NAME}} instead and set the real value as the server variable CX360_NAME.";
  return null;
}

// ---- phone numbers ----------------------------------------------------------

/** Turns 0803 123 4567 / +234 803… / 2348031234567 into the format the gateway expects. */
export function normalizePhone(raw: string, format: PhoneFormat, countryCode: string): string {
  if (format === "asis") return raw.trim();
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = countryCode + d.slice(1);
  else if (!d.startsWith(countryCode) && d.length <= 10) d = countryCode + d;
  return format === "plus" ? `+${d}` : d;
}
