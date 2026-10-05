import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inboundAuthorized, tenantFromRequest } from "@/lib/channels/http";
import { ingestInbound } from "@/lib/channels/ingest";
import { emailAddress, isAutoReply, stripHtml, stripQuoted } from "@/lib/channels/text";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  from: z.string().min(3).max(300),
  fromName: z.string().max(200).optional(),
  subject: z.string().max(500).default(""),
  text: z.string().max(200_000).optional(),
  html: z.string().max(400_000).optional(),
  messageId: z.string().min(1).max(300),
  date: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

/**
 * Email from any mail system (a Power Automate flow, a mail gateway, an
 * "email to webhook" rule): POST JSON with the x-cx360-token header.
 * For Microsoft 365 the Inbound email job reads the mailbox directly instead.
 */
export async function POST(req: NextRequest) {
  try {
    if (!inboundAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenant = await tenantFromRequest(req);
    if (!tenant) return NextResponse.json({ error: "Unknown tenant — add ?tenant=<your-slug> to the address" }, { status: 400 });
    const b = schema.parse(await req.json());
    const from = emailAddress(b.from);
    if (isAutoReply({ subject: b.subject, headers: b.headers, from: from.address })) return NextResponse.json({ ok: true, skipped: "auto-reply" });
    const body = stripQuoted(b.text ?? (b.html ? stripHtml(b.html) : "")) || "(no text)";
    const r = await ingestInbound(tenant.id, { channel: "EMAIL", externalId: b.messageId, contact: from.address, name: b.fromName || from.name || undefined, subject: b.subject, body, receivedAt: b.date && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date) : undefined });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    await recordError("channel:email", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
