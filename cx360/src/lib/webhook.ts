import crypto from "crypto";

export type WebhookDeliveryResult = { ok: boolean; status?: number; error?: string };

/**
 * Delivers a signed webhook payload. Signature is HMAC-SHA256 over the raw
 * JSON body using the subscription's secret, sent as `X-CX360-Signature` —
 * the receiving end verifies by recomputing the same HMAC and comparing.
 * Bounded with a timeout so one slow/dead endpoint can't stall a caller
 * (the scheduled dispatcher sweeping many events, or an admin's "Send test
 * event" click waiting on a response).
 */
export async function deliverWebhook(
  url: string,
  secret: string,
  type: string,
  payload: unknown
): Promise<WebhookDeliveryResult> {
  const body = JSON.stringify({ type, payload, sentAt: new Date().toISOString() });
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CX360-Signature": signature },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delivery failed" };
  }
}
