import { GRAPH_SECRET, secretEnvName, type GraphEmailConfig } from "./config";
import type { GatewayMessage, SendResult } from "./http-gateway";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 10_000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const addresses = (s: string) => s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);

async function timed(doFetch: FetchLike, url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await doFetch(url, { ...init, signal: ctrl.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends email as a Microsoft 365 mailbox via Microsoft Graph (app-only access).
 * The bank's IT registers an app in Entra ID with the "Mail.Send" application
 * permission, then gives us the tenant ID, client ID and mailbox in settings,
 * and the client secret as the server variable CX360_GRAPH_CLIENT_SECRET.
 */
export async function sendViaGraph(cfg: GraphEmailConfig, msg: GatewayMessage, opts: { env?: Env; fetchImpl?: FetchLike } = {}): Promise<SendResult> {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const secret = env[secretEnvName(GRAPH_SECRET)];
  if (!secret) return { ok: false, error: `The server variable ${secretEnvName(GRAPH_SECRET)} isn't set. Ask whoever manages Netlify to add it.` };
  if (!/^[0-9a-f-]{36}$/i.test(cfg.azureTenantId) || !/^[0-9a-f-]{36}$/i.test(cfg.clientId)) return { ok: false, error: "The Microsoft tenant ID and client ID must be the 36-character IDs from Entra ID." };
  if (!cfg.sender) return { ok: false, error: "No sending mailbox is set." };

  try {
    const key = `${cfg.azureTenantId}:${cfg.clientId}`;
    let cached = tokenCache.get(key);
    if (!cached || cached.expiresAt < Date.now() + 60_000) {
      const tokenRes = await timed(doFetch, `https://login.microsoftonline.com/${cfg.azureTenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: cfg.clientId, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString(),
      });
      const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        return { ok: false, error: `Microsoft sign-in failed (HTTP ${tokenRes.status}): ${(tokenJson.error_description ?? "").split("\r")[0].slice(0, 200)}`.replace(secret, "***") };
      }
      cached = { token: tokenJson.access_token, expiresAt: Date.now() + (tokenJson.expires_in ?? 3000) * 1000 };
      tokenCache.set(key, cached);
    }

    const mailRes = await timed(doFetch, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cached.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: msg.subject ?? "",
          body: { contentType: "Text", content: msg.message },
          toRecipients: addresses(msg.to).map((address) => ({ emailAddress: { address } })),
          ccRecipients: (msg.cc ?? []).map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    });
    if (mailRes.status === 401) tokenCache.delete(key);
    if (mailRes.status !== 202 && !mailRes.ok) {
      const j = (await mailRes.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: `Microsoft Graph answered HTTP ${mailRes.status}: ${(j.error?.message ?? "").slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, error: name === "AbortError" ? `Microsoft didn't answer within ${TIMEOUT_MS / 1000} seconds.` : `Couldn't reach Microsoft: ${(err as Error)?.message ?? "unknown error"}` };
  }
}
