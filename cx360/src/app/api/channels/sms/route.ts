import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inboundAuthorized, tenantFromRequest } from "@/lib/channels/http";
import { ingestInbound } from "@/lib/channels/ingest";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  from: z.string().min(5).max(30),
  text: z.string().min(1).max(2000),
  messageId: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
});

/** Replies customers send to the bank's SMS number. The SMS gateway forwards each one here (JSON, x-cx360-token header). */
export async function POST(req: NextRequest) {
  try {
    if (!inboundAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenant = await tenantFromRequest(req);
    if (!tenant) return NextResponse.json({ error: "Unknown tenant — add ?tenant=<your-slug> to the address" }, { status: 400 });
    const b = schema.parse(await req.json());
    // No id from the gateway? Build a stable one so an immediate retry doesn't create a duplicate.
    const externalId = b.messageId ?? `sms:${b.from}:${b.date ?? ""}:${b.text.slice(0, 40)}`;
    const r = await ingestInbound(tenant.id, { channel: "SMS", externalId, contact: b.from, body: b.text, receivedAt: b.date && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date) : undefined });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    await recordError("channel:sms", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
