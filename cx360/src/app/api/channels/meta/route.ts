import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/channels/http";
import { parseChannelSettings } from "@/lib/channels/config";
import { ingestInbound } from "@/lib/channels/ingest";
import { parseMetaWebhook, verifyMetaSignature } from "@/lib/channels/meta";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/** Meta's one-time "verify this address" handshake (WhatsApp, Instagram and Messenger all use it). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.CX360_META_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Messages from WhatsApp Business, Instagram DMs and Facebook Messenger.
 * Every request is signed by Meta (X-Hub-Signature-256) and checked against
 * CX360_META_APP_SECRET. Always answers 200 quickly once the signature is
 * good, so Meta doesn't retry (duplicates are ignored anyway).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.CX360_META_APP_SECRET ?? "")) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  try {
    const tenant = await tenantFromRequest(req);
    if (!tenant) return NextResponse.json({ error: "Unknown tenant — add ?tenant=<your-slug> to the address" }, { status: 400 });
    const ch = parseChannelSettings(tenant.channelSettings);
    let stored = 0;
    for (const m of parseMetaWebhook(JSON.parse(raw))) {
      // Only the numbers/pages this organisation connected (other assets on the same Meta app are ignored).
      if (m.channel === "WHATSAPP" && (!ch.whatsapp.phoneNumberId || m.toId !== ch.whatsapp.phoneNumberId)) continue;
      if (m.channel === "INSTAGRAM" && !ch.meta.instagram) continue;
      if (m.channel === "MESSENGER" && (!ch.meta.messenger || (ch.meta.pageId && m.toId !== ch.meta.pageId))) continue;
      const r = await ingestInbound(tenant.id, {
        channel: m.channel, externalId: m.externalId, contact: m.contact, name: m.name, body: m.body, receivedAt: m.receivedAt,
        socialKey: m.channel === "INSTAGRAM" ? "instagramId" : m.channel === "MESSENGER" ? "messengerId" : undefined,
      });
      if (!r.duplicate) stored++;
    }
    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    await recordError("channel:meta", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
