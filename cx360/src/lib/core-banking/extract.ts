/** Turning whatever the core banking system answers (JSON or XML/SOAP) into plain CX360 values. */

// ---- XML (small, dependency-free; enough for SOAP/REST inquiry replies) --------------------------
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]));

/** Namespace prefixes are dropped (soap:Body → Body); attributes are ignored; repeated tags become lists. */
export function parseXml(xml: string): unknown {
  const src = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  type Node = { name: string; children: Record<string, unknown[]>; text: string };
  const root: Node = { name: "#root", children: {}, text: "" };
  const stack: Node[] = [root];
  const done = (n: Node): unknown => {
    const keys = Object.keys(n.children);
    if (keys.length === 0) return n.text.trim();
    const o: Record<string, unknown> = {};
    for (const k of keys) o[k] = n.children[k].length === 1 ? n.children[k][0] : n.children[k];
    return o;
  };
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(src)) && guard++ < 200_000) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[2] === "/") {
      if (stack.length > 1) {
        const n = stack.pop()!;
        (stack[stack.length - 1].children[n.name] ??= []).push(done(n));
      }
    } else {
      const name = m[3].replace(/^.*:/, "");
      if (m[5] === "/") (top.children[name] ??= []).push("");
      else stack.push({ name, children: {}, text: "" });
    }
  }
  while (stack.length > 1) {
    const n = stack.pop()!;
    (stack[stack.length - 1].children[n.name] ??= []).push(done(n));
  }
  return done(root);
}

export function parseReply(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  if (t[0] === "{" || t[0] === "[") {
    try { return JSON.parse(t); } catch { /* fall through to XML */ }
  }
  if (t[0] === "<") return parseXml(t);
  return null;
}

// ---- paths --------------------------------------------------------------------------------------
/** "data.accounts[0].balance" — keys match case-insensitively. Returns undefined when absent. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(p)];
    else if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      const k = p in o ? p : Object.keys(o).find((x) => x.toLowerCase() === p.toLowerCase());
      cur = k === undefined ? undefined : o[k];
    } else return undefined;
  }
  return cur;
}

/** The list at listPath; a single object counts as a list of one (XML collapses one-item lists). */
export function getList(value: unknown, listPath: string): unknown[] {
  const v = listPath ? getPath(value, listPath) : value;
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}

const text = (v: unknown, max: number) => (v === undefined || v === null || typeof v === "object" ? "" : String(v).trim().slice(0, max));
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bDR\b$/i.test(s);
  s = s.replace(/[^0-9.]/g, "");
  if (!s || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v < 1e11 ? v * 1000 : v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0)));
  if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})/.exec(s))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return new Date(Date.UTC(+m[3], mi, +m[1]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- mapping ------------------------------------------------------------------------------------
export type LiveAccount = { productName: string; accountRef: string | null; status: string; balance: number | null; currency: string };
export type LiveTxn = { type: "credit" | "debit"; amount: number; currency: string; description: string; transactionDate: string };

export function mapAccounts(reply: unknown, ep: { listPath: string; map: Record<string, string>; defaultCurrency: string }): LiveAccount[] {
  return getList(reply, ep.listPath).slice(0, 20).map((row) => ({
    productName: text(getPath(row, ep.map.productName), 80) || "Account",
    accountRef: text(getPath(row, ep.map.accountRef), 40) || null,
    status: text(getPath(row, ep.map.status), 30) || "active",
    balance: toNumber(getPath(row, ep.map.balance)),
    currency: (text(getPath(row, ep.map.currency), 3) || ep.defaultCurrency).toUpperCase(),
  }));
}

export function mapTransactions(reply: unknown, ep: { listPath: string; map: Record<string, string>; creditValues: string }, defaultCurrency = "NGN", limit = 5): LiveTxn[] {
  const credits = ep.creditValues.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out: LiveTxn[] = [];
  for (const row of getList(reply, ep.listPath)) {
    const amountRaw = toNumber(getPath(row, ep.map.amount));
    const date = toDate(getPath(row, ep.map.date));
    if (amountRaw === null || !date) continue; // skip rows we can't read rather than show wrong figures
    const typeVal = text(getPath(row, ep.map.type), 30).toLowerCase();
    const credit = typeVal ? credits.includes(typeVal) : amountRaw >= 0;
    out.push({
      type: credit ? "credit" : "debit",
      amount: Math.abs(amountRaw),
      currency: (text(getPath(row, ep.map.currency), 3) || defaultCurrency).toUpperCase(),
      description: text(getPath(row, ep.map.description), 120) || "Transaction",
      transactionDate: date.toISOString(),
    });
  }
  return out.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, limit);
}

export function mapProfile(reply: unknown, fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, p] of Object.entries(fields)) {
    const v = text(getPath(reply, p), 200);
    if (v) out[key] = v;
  }
  return out;
}
