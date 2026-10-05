import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inboundAuthorized, tenantFromRequest } from "@/lib/channels/http";
import { ingestInbound } from "@/lib/channels/ingest";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  callId: z.string().min(1).max(200),
  from: z.string().min(3).max(40), // caller number (ANI) — for outbound calls, the customer's number is "to"
  to: z.string().max(40).optional(),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  durationSec: z.number().int().min(0).max(86_400).default(0),
  startedAt: z.string().optional(),
  agentEmail: z.string().max(200).optional(),
  disposition: z.string().max(60).optional(), // e.g. answered, missed, abandoned
});

/**
 * Call log from the phone system (Avaya or any PBX/CTI middleware): one POST
 * per finished call. Answered calls are stored as history on the customer;
 * missed/abandoned inbound calls land in the Inbox so someone calls back.
 */
export async function POST(req: NextRequest) {
  try {
    if (!inboundAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenant = await tenantFromRequest(req);
    if (!tenant) return NextResponse.json({ error: "Unknown tenant — add ?tenant=<your-slug> to the address" }, { status: 400 });
    const b = schema.parse(await req.json());
    const outbound = b.direction === "outbound";
    const customerNumber = outbound ? (b.to ?? b.from) : b.from;
    const missed = !outbound && (b.durationSec === 0 || /miss|abandon|no.?answer|unanswered/i.test(b.disposition ?? ""));
    const mins = Math.floor(b.durationSec / 60), secs = b.durationSec % 60;
    const body = `${outbound ? "Outgoing" : "Incoming"} call${missed ? " — MISSED" : ` — ${mins}m ${String(secs).padStart(2, "0")}s`}${b.disposition ? ` (${b.disposition})` : ""}`;
    const r = await ingestInbound(tenant.id, {
      channel: "VOICE",
      externalId: b.callId,
      contact: customerNumber,
      body,
      receivedAt: b.startedAt && !Number.isNaN(Date.parse(b.startedAt)) ? new Date(b.startedAt) : undefined,
      direction: outbound ? "outbound" : "inbound",
      durationSec: b.durationSec,
      agentEmail: b.agentEmail,
      historyOnly: !missed,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    await recordError("channel:voice", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
