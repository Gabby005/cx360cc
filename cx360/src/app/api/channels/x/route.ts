import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/channels/http";
import { parseChannelSettings } from "@/lib/channels/config";
import { ingestInbound } from "@/lib/channels/ingest";
import { parseXWebhook, verifyXSignature, xCrcResponse } from "@/lib/channels/x";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/** X's "is this really your endpoint?" check: answer with a signature of the token it sends. */
export async function GET(req: NextRequest) {
  const crc = req.nextUrl.searchParams.get("crc_token");
  const secret = process.env.CX360_X_CLIENT_SECRET;
  if (!crc || !secret) return NextResponse.json({ error: "Not available" }, { status: 400 });
  return NextResponse.json({ response_token: xCrcResponse(crc, secret) });
}

/** Direct messages sent to the connected X account. Each request is signed by X and checked against CX360_X_CLIENT_SECRET. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.CX360_X_CLIENT_SECRET ?? "";
  const header = req.headers.get("x-twitter-webhooks-signature-oauth2") ?? req.headers.get("x-twitter-webhooks-signature");
  if (!verifyXSignature(raw, header, secret)) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  try {
    const tenant = await tenantFromRequest(req);
    if (!tenant) return NextResponse.json({ error: "Unknown tenant — add ?tenant=<your-slug> to the address" }, { status: 400 });
    const ch = parseChannelSettings(tenant.channelSettings);
    if (!ch.x.enabled) return NextResponse.json({ ok: true, skipped: "X is switched off" });
    let stored = 0;
    for (const m of parseXWebhook(JSON.parse(raw))) {
      if (ch.x.userId && m.toId !== ch.x.userId) continue; // not our account
      const r = await ingestInbound(tenant.id, { channel: "X", externalId: m.externalId, contact: m.contact, name: m.name, body: m.body, receivedAt: m.receivedAt, socialKey: "xId" });
      if (!r.duplicate) stored++;
    }
    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    await recordError("channel:x", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
