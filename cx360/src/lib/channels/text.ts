/** Small, pure helpers for turning incoming messages into clean Inbox items. */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cuts the quoted earlier conversation off an email reply so agents see only what's new. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) => {
    const t = l.trim();
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}$/i.test(t)) return true;
    if (/^_{5,}$/.test(t) && /^(from|sent):/i.test((lines[i + 1] ?? "").trim())) return true;
    if (/^on .{5,200}wrote:?$/i.test(t)) return true;
    if (/^on .{5,200}$/i.test(t) && /wrote:?$/i.test((lines[i + 1] ?? "").trim())) return true;
    if (/^from:\s.+/i.test(t) && /^(sent|date):\s/i.test((lines[i + 1] ?? "").trim())) return true;
    return false;
  });
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).filter((l) => !/^\s*>/.test(l));
  const out = kept.join("\n").trim();
  return out || text.trim(); // never return nothing
}

/** "PTB/COM/E0006/000123" anywhere in a subject or body. */
export const CASE_NUMBER_RE = /\b([A-Z0-9]{2,8}\/[A-Z]{3}\/[A-Z0-9]{1,10}\/\d{4,9})\b/;
export const extractCaseNumber = (s: string): string | null => CASE_NUMBER_RE.exec(s)?.[1] ?? null;

/** Out-of-office, bounce and bulk mail must not become tickets or trigger loops. */
export function isAutoReply(input: { subject?: string; headers?: Record<string, string>; from?: string }): boolean {
  const h = Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (/(bulk|junk|list|auto_reply)/.test(h["precedence"] ?? "")) return true;
  if (h["x-auto-response-suppress"] || h["x-autoreply"] || h["x-autorespond"]) return true;
  if (/^(mailer-daemon|postmaster)@/i.test(input.from ?? "")) return true;
  if (/^(automatic reply|auto(matic)? ?reply|out of office|undeliverable|delivery status notification)/i.test((input.subject ?? "").trim())) return true;
  return false;
}

/** Last 10 digits of a phone number — matches 0803…, +234803… and 234803… to each other. */
export function phoneKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function emailAddress(raw: string): { address: string; name: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  const address = (m ? m[2] : raw).trim().toLowerCase();
  return { address, name: (m?.[1] ?? "").trim() };
}
