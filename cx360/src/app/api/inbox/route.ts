import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const status = req.nextUrl.searchParams.get("status") ?? "NEW";
    const channel = req.nextUrl.searchParams.get("channel");

    const interactions = await prisma.interaction.findMany({
      where: {
        tenantId: ctx.tenantId,
        direction: "inbound",
        ...(status !== "all" ? { status: status as any } : {}),
        ...(channel ? { channel: channel as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, segment: true, sentimentAvg: true } },
        agent: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ interactions });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Ingest endpoint for inbound messages. In production this is the shape a
 * real channel adapter (Twilio/WhatsApp Business API webhook, an inbound
 * email parser, a telephony CTI event) would call after mapping its own
 * payload to { channel, customerId, summary, transcript }. Until those
 * adapters are wired (Phase 2 — they need live provider credentials), the
 * Inbox UI's "Simulate incoming message" action calls this same endpoint,
 * so the triage → reply → convert-to-case pipeline downstream of it is
 * exercised for real, not mocked.
 */
const ingestSchema = z.object({
  customerId: z.string(),
  channel: z.enum(["VOICE", "EMAIL", "SMS", "WHATSAPP", "CHAT", "PORTAL", "SOCIAL"]),
  summary: z.string().min(1),
  transcript: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = ingestSchema.parse(await req.json());

    const interaction = await prisma.interaction.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: body.customerId,
        channel: body.channel,
        direction: "inbound",
        status: "NEW",
        summary: body.summary,
        transcript: body.transcript,
      },
    });

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
