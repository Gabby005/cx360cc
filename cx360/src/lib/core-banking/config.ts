import { secretEnvName, type Header } from "@/lib/delivery/config";

/**
 * How CX360 reads live customer data from the bank's core banking system
 * (Flexcube, T24, or an integration layer in front of them). Read-only, on
 * demand, never stored: balances and transactions are fetched when an agent
 * opens a customer and kept only in a 60-second in-memory cache.
 *
 * Passwords/API keys are never stored in these settings — write
 * {{secret:NAME}} and set the server variable CX360_NAME.
 */
export type ContentType = "json" | "form" | "xml";
export type Endpoint = { url: string; method: "GET" | "POST"; headers: Header[]; contentType: ContentType; body: string };

export type ProfileEndpoint = Endpoint & { fields: Record<string, string> }; // summary-field key → path in the reply
export type AccountsEndpoint = Endpoint & {
  listPath: string;
  map: { productName: string; accountRef: string; status: string; balance: string; currency: string };
  defaultCurrency: string;
};
export type TransactionsEndpoint = Endpoint & {
  listPath: string;
  map: { type: string; amount: string; currency: string; description: string; date: string };
  creditValues: string; // reply values meaning "money in", comma separated, e.g. CR,C,Credit
};
export type CoreBankingSettings = {
  enabled: boolean;
  lookupKey: string; // name of the customer detail holding the core banking customer number (e.g. cif) → {{lookup}}
  profile: ProfileEndpoint | null;
  accounts: AccountsEndpoint | null;
  transactions: TransactionsEndpoint | null;
};

export const DEFAULT_CORE: CoreBankingSettings = { enabled: false, lookupKey: "cif", profile: null, accounts: null, transactions: null };

const str = (v: unknown, max = 1000) => (typeof v === "string" ? v.slice(0, max) : "");
const path = (v: unknown) => str(v, 120).trim();

function endpoint(e: Record<string, unknown>): Endpoint {
  const headers: Header[] = Array.isArray(e.headers)
    ? e.headers.filter((h): h is Header => !!h && typeof (h as Header).name === "string" && typeof (h as Header).value === "string").slice(0, 10).map((h) => ({ name: h.name.slice(0, 40), value: h.value.slice(0, 500) }))
    : [];
  return {
    url: str(e.url, 500),
    method: e.method === "POST" ? "POST" : "GET",
    headers,
    contentType: e.contentType === "form" ? "form" : e.contentType === "xml" ? "xml" : "json",
    body: str(e.body, 6000),
  };
}
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Reads whatever is stored and always returns a complete, safe settings object. */
export function parseCoreSettings(raw: unknown): CoreBankingSettings {
  const r = obj(raw);
  if (!r) return { ...DEFAULT_CORE };
  const p = obj(r.profile), a = obj(r.accounts), t = obj(r.transactions);
  const lk = str(r.lookupKey, 40).trim();

  let profile: ProfileEndpoint | null = null;
  if (p) {
    const f = obj(p.fields) ?? {};
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(f).slice(0, 12)) if (/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)) fields[k] = path(v);
    profile = { ...endpoint(p), fields };
  }
  const m = (o: Record<string, unknown> | null, k: string) => path(o?.[k]);
  const am = obj(a?.map), tm = obj(t?.map);
  return {
    enabled: r.enabled === true,
    lookupKey: /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(lk) ? lk : "cif",
    profile,
    accounts: a ? { ...endpoint(a), listPath: path(a.listPath), map: { productName: m(am, "productName"), accountRef: m(am, "accountRef"), status: m(am, "status"), balance: m(am, "balance"), currency: m(am, "currency") }, defaultCurrency: str(a.defaultCurrency, 3).toUpperCase() || "NGN" } : null,
    transactions: t ? { ...endpoint(t), listPath: path(t.listPath), map: { type: m(tm, "type"), amount: m(tm, "amount"), currency: m(tm, "currency"), description: m(tm, "description"), date: m(tm, "date") }, creditValues: str(t.creditValues, 100) || "CR,C,Credit" } : null,
  };
}

export const endpoints = (s: CoreBankingSettings) => [s.profile, s.accounts, s.transactions].filter((e): e is NonNullable<typeof e> => !!e);

export const SECRET_RE = /\{\{\s*secret:([A-Z0-9_]{1,40})\s*\}\}/g;
export function coreSecretsUsed(s: CoreBankingSettings): string[] {
  const names = new Set<string>();
  for (const e of endpoints(s)) for (const t of [e.url, e.body, ...e.headers.map((h) => h.value)]) for (const m of t.matchAll(SECRET_RE)) names.add(m[1]);
  return [...names];
}
export const coreSecretStatus = (s: CoreBankingSettings, env: Record<string, string | undefined> = process.env) =>
  Object.fromEntries(coreSecretsUsed(s).map((n) => [n, !!env[secretEnvName(n)]]));
