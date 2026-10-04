import type { DeliverySettings } from "./config";
import { sendViaHttp, type GatewayMessage, type SendResult } from "./http-gateway";
import { sendViaGraph } from "./graph-mail";

export * from "./config";
export type { GatewayMessage, SendResult };

type Opts = Parameters<typeof sendViaHttp>[2];

/** Sends one message through whichever provider the settings choose for its channel. Never throws. */
export async function deliver(settings: DeliverySettings, msg: GatewayMessage, opts?: Opts): Promise<SendResult & { skipped?: boolean }> {
  if (msg.channel === "email") {
    const c = settings.email;
    if (c.provider === "none") return { ok: false, skipped: true, error: "No email service is connected." };
    return c.provider === "graph" ? sendViaGraph(c, msg, opts) : sendViaHttp(c, msg, opts);
  }
  const c = settings.sms;
  if (c.provider === "none") return { ok: false, skipped: true, error: "No SMS gateway is connected." };
  return sendViaHttp(c, msg, opts);
}
