import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { EVENT_TYPES } from "@/lib/event-catalog";
import { checkGatewayUrl } from "@/lib/delivery/config";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const webhooks = await prisma.webhookSubscription.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });
    // Secret is shown once at creation; mask it in subsequent list reads.
    return NextResponse.json({
      webhooks: webhooks.map((w) => ({ ...w, secret: `${w.secret.slice(0, 6)}${"•".repeat(10)}` })),
    });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  url: z.string().trim().url("Enter a full web address, e.g. https://your-system.example.com/hook").max(500),
  events: z.array(z.string().refine((e) => EVENT_TYPES.includes(e), "Unknown event")).min(1, "Choose at least one event"),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = createSchema.parse(await req.json());

    const bad = checkGatewayUrl(body.url);
    if (bad) throw new ApiError(400, bad);

    const secret = crypto.randomBytes(24).toString("hex");
    const webhook = await prisma.webhookSubscription.create({
      data: { tenantId: ctx.tenantId, url: body.url, events: body.events, secret },
    });

    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "webhook_created", entity: "Webhook", entityId: webhook.id, after: { url: body.url, events: body.events } });
    return NextResponse.json({ webhook }, { status: 201 });
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
