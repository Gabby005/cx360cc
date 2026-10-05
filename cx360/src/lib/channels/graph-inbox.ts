import { dropGraphToken, getGraphToken } from "@/lib/delivery/graph-mail";
import { emailAddress, isAutoReply, stripHtml, stripQuoted } from "./text";
import type { InboundMessage } from "./ingest";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 10_000;

/**
 * Reads unread mail from a Microsoft 365 mailbox via Microsoft Graph (app-only).
 * IT grants the same Entra app used for sending the extra "Mail.ReadWrite"
 * application permission (read + mark as read). Each message is handed to
 * `handle`; when it returns true the message is marked read so it is never
 * picked up twice. Failures leave it unread, so the next run retries.
 */
export async function pollMailbox(
  cfg: { azureTenantId: string; clientId: string },
  mailbox: string,
  ownAddresses: string[],
  handle: (m: InboundMessage) => Promise<boolean>,
  opts: { max?: number; fetchImpl?: FetchLike; deadline?: number } = {}
): Promise<{ ok: boolean; processed: number; skipped: number; error?: string }> {
  const f: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const tok = await getGraphToken(cfg, { fetchImpl: f });
  if (!tok.ok) return { ok: false, processed: 0, skipped: 0, error: tok.error };

  const call = async (url: string, init: RequestInit) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await f(url, { ...init, headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json", Prefer: 'outlook.body-content-type="text"' }, signal: ctrl.signal, redirect: "manual" });
    } finally {
      clearTimeout(t);
    }
  };

  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
  const select = "id,internetMessageId,subject,from,body,receivedDateTime,internetMessageHeaders";
  let res: Response;
  try {
    res = await call(`${base}/mailFolders/inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime asc&$top=${opts.max ?? 25}&$select=${select}`, { method: "GET" });
  } catch (err) {
    return { ok: false, processed: 0, skipped: 0, error: `Couldn't reach Microsoft: ${(err as Error)?.message ?? "unknown error"}` };
  }
  if (res.status === 401) dropGraphToken(cfg);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, processed: 0, skipped: 0, error: `Microsoft Graph answered HTTP ${res.status}: ${(j.error?.message ?? "").slice(0, 200)} (does the app have the Mail.ReadWrite permission for ${mailbox}?)` };
  }
  const data = (await res.json()) as { value?: Record<string, unknown>[] };
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  let processed = 0, skipped = 0;

  for (const msg of data.value ?? []) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const id = String(msg.id ?? "");
    const fromAddr = String(((msg.from as { emailAddress?: { address?: string; name?: string } } | undefined)?.emailAddress?.address) ?? "").toLowerCase();
    const fromName = String(((msg.from as { emailAddress?: { name?: string } } | undefined)?.emailAddress?.name) ?? "");
    const headers = Object.fromEntries(((msg.internetMessageHeaders as { name: string; value: string }[] | undefined) ?? []).map((h) => [h.name, h.value]));
    const subject = String(msg.subject ?? "");
    let keep = false;

    if (!fromAddr || own.has(fromAddr) || isAutoReply({ subject, headers, from: fromAddr })) {
      skipped++;
      keep = true; // nothing to ingest, but still mark read
    } else {
      const bodyObj = msg.body as { content?: string; contentType?: string } | undefined;
      const raw = bodyObj?.contentType === "html" ? stripHtml(bodyObj.content ?? "") : String(bodyObj?.content ?? "");
      const body = stripQuoted(raw) || "(no text)";
      try {
        keep = await handle({
          channel: "EMAIL",
          externalId: String(msg.internetMessageId || id),
          contact: emailAddress(fromAddr).address,
          name: fromName && fromName.toLowerCase() !== fromAddr ? fromName : undefined,
          subject,
          body,
          receivedAt: msg.receivedDateTime ? new Date(String(msg.receivedDateTime)) : undefined,
        });
        if (keep) processed++;
      } catch {
        keep = false;
      }
    }
    if (keep) {
      await call(`${base}/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) }).catch(() => {});
    }
  }
  return { ok: true, processed, skipped };
}
