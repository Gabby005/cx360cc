import { checkGatewayUrl, normalizePhone, secretEnvName } from "@/lib/delivery/config";
import type { AccountsEndpoint, CoreBankingSettings, Endpoint, ProfileEndpoint, TransactionsEndpoint } from "./config";
import { mapAccounts, mapProfile, mapTransactions, parseReply, type LiveAccount, type LiveTxn } from "./extract";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 6_000;
const MAX_REPLY = 1_000_000;
const CACHE_MS = 60_000;
const BREAKER_FAILS = 3;
const BREAKER_MS = 60_000;

export type Vars = { customerId?: string; lookup?: string; phone?: string; email?: string; accountRef?: string; limit?: number };
export type CallResult = { ok: true; reply: unknown; raw: string } | { ok: false; error: string; raw?: string };

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const jsonEsc = (s: string) => JSON.stringify(s).slice(1, -1);

/** Fills {{placeholders}} for where they land (JSON text, XML text, form field, URL, header) so odd characters can't break the request. */
export function fillCoreTemplate(tpl: string, vars: Record<string, string>, where: "json" | "xml" | "form" | "url" | "header", env: Env, onSecret?: (v: string) => void, onMissing?: (name: string) => void): string {
  return tpl.replace(/\{\{\s*([A-Za-z_:][A-Za-z0-9_:]*)\s*\}\}/g, (match, key: string) => {
    let v: string;
    if (key.startsWith("secret:")) {
      const val = env[secretEnvName(key.slice(7))];
      if (!val) { onMissing?.(secretEnvName(key.slice(7))); return ""; }
      onSecret?.(val);
      v = val;
    } else if (key in vars) v = vars[key];
    else return match;
    switch (where) {
      case "json": return jsonEsc(v);
      case "xml": return xmlEsc(v);
      case "form": case "url": return encodeURIComponent(v);
      default: return v.replace(/[\r\n]/g, "");
    }
  });
}

export async function callEndpoint(ep: Endpoint, vars: Vars, opts: { env?: Env; fetchImpl?: FetchLike } = {}): Promise<CallResult> {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const v: Record<string, string> = {
    customerId: vars.customerId ?? "", lookup: vars.lookup ?? "", phone: vars.phone ?? "",
    phone_intl: vars.phone ? normalizePhone(vars.phone, "digits", "234") : "",
    email: vars.email ?? "", accountRef: vars.accountRef ?? "", limit: String(vars.limit ?? 5),
  };
  const secrets: string[] = [];
  let missing: string | undefined;
  const onSecret = (s: string) => secrets.push(s);
  const onMissing = (n: string) => { missing ??= n; };
  const scrub = (t: string) => secrets.reduce((a, s) => (s ? a.split(s).join("***") : a), t);

  const bad = checkGatewayUrl(ep.url);
  if (bad) return { ok: false, error: bad };
  const url = fillCoreTemplate(ep.url, v, "url", env, onSecret, onMissing);
  const headers: Record<string, string> = {};
  for (const h of ep.headers) headers[h.name] = fillCoreTemplate(h.value, v, "header", env, onSecret, onMissing);
  let body: string | undefined;
  if (ep.method === "POST") {
    body = fillCoreTemplate(ep.body, v, ep.contentType === "xml" ? "xml" : ep.contentType === "form" ? "form" : "json", env, onSecret, onMissing);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = ep.contentType === "xml" ? "text/xml; charset=utf-8" : ep.contentType === "form" ? "application/x-www-form-urlencoded" : "application/json";
  }
  if (missing) return { ok: false, error: `The server variable ${missing} isn't set. Ask whoever manages Netlify to add it.` };
  const finalBad = checkGatewayUrl(url);
  if (finalBad) return { ok: false, error: finalBad };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url, { method: ep.method, headers, body, signal: ctrl.signal, redirect: "manual" });
    const raw = (await res.text().catch(() => "")).slice(0, MAX_REPLY);
    if (res.status < 200 || res.status >= 300) return { ok: false, error: scrub(`The core banking system answered HTTP ${res.status}`), raw: scrub(raw.slice(0, 500)) };
    const reply = parseReply(raw);
    if (reply === null) return { ok: false, error: "The reply wasn't JSON or XML that CX360 could read.", raw: scrub(raw.slice(0, 500)) };
    return { ok: true, reply, raw: scrub(raw) };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, error: scrub(name === "AbortError" ? `The core banking system didn't answer within ${TIMEOUT_MS / 1000} seconds.` : `Couldn't reach the core banking system: ${(err as Error)?.message ?? "unknown error"}`) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- protection for the core: short cache + circuit breaker (per server instance) ---------------
const cache = new Map<string, { at: number; value: unknown }>();
const breaker = new Map<string, { fails: number; openUntil: number }>();

const cached = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await fn();
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
};
export const breakerOpen = (tenant: string) => (breaker.get(tenant)?.openUntil ?? 0) > Date.now();
function note(tenant: string, ok: boolean) {
  const b = breaker.get(tenant) ?? { fails: 0, openUntil: 0 };
  if (ok) breaker.set(tenant, { fails: 0, openUntil: 0 });
  else { b.fails += 1; if (b.fails >= BREAKER_FAILS) { b.openUntil = Date.now() + BREAKER_MS; b.fails = 0; } breaker.set(tenant, b); }
}

export type LiveResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function liveAccounts(tenantId: string, s: CoreBankingSettings, vars: Vars, opts?: Parameters<typeof callEndpoint>[2]): Promise<LiveResult<LiveAccount[]>> {
  if (!s.enabled || !s.accounts) return { ok: false, error: "Live core banking isn't switched on." };
  if (breakerOpen(tenantId)) return { ok: false, error: "Live lookups are paused for a minute after repeated failures." };
  const ep: AccountsEndpoint = s.accounts;
  return cached(`${tenantId}:a:${vars.customerId}`, async () => {
    const r = await callEndpoint(ep, vars, opts);
    note(tenantId, r.ok);
    return r.ok ? ({ ok: true, data: mapAccounts(r.reply, ep) } as LiveResult<LiveAccount[]>) : ({ ok: false, error: r.error } as LiveResult<LiveAccount[]>);
  });
}

export async function liveTransactions(tenantId: string, s: CoreBankingSettings, vars: Vars, defaultCurrency: string, opts?: Parameters<typeof callEndpoint>[2]): Promise<LiveResult<LiveTxn[]>> {
  if (!s.enabled || !s.transactions) return { ok: true, data: [] };
  if (breakerOpen(tenantId)) return { ok: false, error: "Live lookups are paused for a minute after repeated failures." };
  const ep: TransactionsEndpoint = s.transactions;
  return cached(`${tenantId}:t:${vars.customerId}:${vars.accountRef}`, async () => {
    const r = await callEndpoint(ep, { ...vars, limit: 5 }, opts);
    note(tenantId, r.ok);
    return r.ok ? ({ ok: true, data: mapTransactions(r.reply, ep, defaultCurrency, 5) } as LiveResult<LiveTxn[]>) : ({ ok: false, error: r.error } as LiveResult<LiveTxn[]>);
  });
}

export async function liveProfile(tenantId: string, s: CoreBankingSettings, vars: Vars, opts?: Parameters<typeof callEndpoint>[2]): Promise<LiveResult<Record<string, string>>> {
  if (!s.enabled || !s.profile) return { ok: true, data: {} };
  if (breakerOpen(tenantId)) return { ok: false, error: "Live lookups are paused for a minute after repeated failures." };
  const ep: ProfileEndpoint = s.profile;
  return cached(`${tenantId}:p:${vars.customerId}`, async () => {
    const r = await callEndpoint(ep, vars, opts);
    note(tenantId, r.ok);
    return r.ok ? ({ ok: true, data: mapProfile(r.reply, ep.fields) } as LiveResult<Record<string, string>>) : ({ ok: false, error: r.error } as LiveResult<Record<string, string>>);
  });
}
