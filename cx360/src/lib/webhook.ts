import crypto from "crypto";
import { checkGatewayUrl } from "@/lib/delivery/config";

export type WebhookDeliveryResult = { ok: boolean; status?: number; error?: string };

export const sign = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

/** Exactly what the receiving system gets, so docs, tests and delivery stay identical. */
export function buildWebhookRequest(secret: string, type: string, payload: unknown, deliveryId?: string, sentAt = new Date()) {
  const body = JSON.stringify({ id: deliveryId, type, payload, sentAt: sentAt.toISOString() });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "CX360-Webhooks/1",
    "X-CX360-Event": type,
    "X-CX360-Signature": sign(secret, body),
  };
  if (deliveryId) headers["X-CX360-Delivery"] = deliveryId;
  return { body, headers };
}

/**
 * Delivers one signed webhook. Signature is HMAC-SHA256 over the raw JSON body
 * using the subscription's secret, sent as `X-CX360-Signature`. Public https
 * destinations only (checked again here, not just when the webhook was saved),
 * redirects are not followed, and it is bounded by a timeout so one dead
 * endpoint can't stall a job or an admin's "Send test event" click.
 */
export async function deliverWebhook(
  url: string,
  secret: string,
  type: string,
  payload: unknown,
  deliveryId?: string
): Promise<WebhookDeliveryResult> {
  const bad = checkGatewayUrl(url);
  if (bad) return { ok: false, error: bad };
  const { body, headers } = buildWebhookRequest(secret, type, payload, deliveryId);
  try {
    const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, error: "The endpoint redirected; webhooks don't follow redirects. Use the final address." };
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `The endpoint answered HTTP ${res.status}` };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "The endpoint didn't answer within 8 seconds." : `Couldn't reach the endpoint: ${err instanceof Error ? err.message : "delivery failed"}` };
  }
}
