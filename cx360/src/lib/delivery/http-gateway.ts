import { checkGatewayUrl, normalizePhone, secretEnvName, SECRET_RE, type HttpEmailConfig, type HttpSmsConfig } from "./config";

export type GatewayMessage = {
  channel: "email" | "sms";
  to: string; // email address(es) comma-separated, or a phone number
  cc?: string[];
  subject?: string;
  message: string;
};
export type SendResult = { ok: boolean; error?: string };

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 10_000;

const jsonInner = (v: string) => JSON.stringify(v).slice(1, -1);
const splitAddresses = (s: string) => s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);

/**
 * Builds the HTTP request for a message from the admin's settings.
 *
 * Placeholders: {{to}} {{message}} {{sender}} {{senderId}} {{fromName}} {{subject}} {{cc}}
 * plus {{to_json}} / {{cc_json}} (ready-made JSON lists) and {{secret:NAME}}.
 * Values are escaped for where they land (JSON text, form field, URL) so a
 * quote or ampersand in a customer's message can't break the request.
 */
export function buildHttpRequest(
  cfg: HttpEmailConfig | HttpSmsConfig,
  msg: GatewayMessage,
  env: Env
): { url: string; init: RequestInit; secretValues: string[]; missingSecret?: string } {
  const secretValues: string[] = [];
  let missingSecret: string | undefined;

  const to = msg.channel === "sms" && "phoneFormat" in cfg ? normalizePhone(msg.to, cfg.phoneFormat, cfg.countryCode) : msg.to;
  const sender = "sender" in cfg ? cfg.sender : "";
  const base: Record<string, string> = {
    to,
    message: msg.message,
    subject: msg.subject ?? "",
    cc: (msg.cc ?? []).join(", "),
    sender,
    senderId: "senderId" in cfg ? cfg.senderId : "",
    fromName: "fromName" in cfg ? cfg.fromName : "",
  };
  const rawLists: Record<string, string> = {
    to_json: JSON.stringify(msg.channel === "email" ? splitAddresses(msg.to) : [to]),
    cc_json: JSON.stringify(msg.cc ?? []),
  };

  type Where = "json" | "form" | "url" | "header";
  const fill = (tpl: string, where: Where) =>
    tpl.replace(/\{\{\s*([A-Za-z_:][A-Za-z0-9_:]*)\s*\}\}/g, (match, key: string) => {
      if (key.startsWith("secret:")) {
        const name = key.slice(7);
        const v = env[secretEnvName(name)];
        if (!v) {
          missingSecret ??= secretEnvName(name);
          return "";
        }
        secretValues.push(v);
        return where === "json" ? jsonInner(v) : where === "form" || where === "url" ? encodeURIComponent(v) : v.replace(/[\r\n]/g, "");
      }
      if (key in rawLists) return where === "json" ? rawLists[key] : match;
      if (!(key in base)) return match;
      const v = base[key];
      if (where === "json") return jsonInner(v);
      if (where === "form" || where === "url") return encodeURIComponent(v);
      return v.replace(/[\r\n]/g, "");
    });

  const isGet = "method" in cfg && cfg.method === "GET";
  const url = fill(cfg.url, "url");
  const headers: Record<string, string> = {};
  for (const h of cfg.headers) headers[h.name] = fill(h.value, "header");

  let body: string | undefined;
  if (!isGet) {
    body = fill(cfg.body, cfg.contentType === "json" ? "json" : "form");
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      headers["Content-Type"] = cfg.contentType === "json" ? "application/json" : "application/x-www-form-urlencoded";
    }
  }
  return { url, init: { method: isGet ? "GET" : "POST", headers, body }, secretValues, missingSecret };
}

/** Sends one message through the bank's HTTP gateway. Never throws. */
export async function sendViaHttp(
  cfg: HttpEmailConfig | HttpSmsConfig,
  msg: GatewayMessage,
  opts: { env?: Env; fetchImpl?: FetchLike } = {}
): Promise<SendResult> {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));

  const bad = checkGatewayUrl(cfg.url);
  if (bad) return { ok: false, error: bad };

  const { url, init, secretValues, missingSecret } = buildHttpRequest(cfg, msg, env);
  if (missingSecret) return { ok: false, error: `The server variable ${missingSecret} isn't set. Ask whoever manages Netlify to add it.` };
  const finalBad = checkGatewayUrl(url);
  if (finalBad) return { ok: false, error: finalBad };

  const scrub = (t: string) => secretValues.reduce((acc, s) => (s ? acc.split(s).join("***") : acc), t);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url, { ...init, signal: ctrl.signal, redirect: "manual" });
    const text = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status < 200 || res.status >= 300) return { ok: false, error: scrub(`The gateway answered HTTP ${res.status}${text ? `: ${text}` : ""}`) };
    if (cfg.successContains && !text.toLowerCase().includes(cfg.successContains.toLowerCase())) {
      return { ok: false, error: scrub(`The gateway answered OK but the reply didn't contain "${cfg.successContains}": ${text}`) };
    }
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, error: scrub(name === "AbortError" ? `The gateway didn't answer within ${TIMEOUT_MS / 1000} seconds.` : `Couldn't reach the gateway: ${(err as Error)?.message ?? "unknown error"}`) };
  } finally {
    clearTimeout(timer);
  }
}

export { SECRET_RE };
