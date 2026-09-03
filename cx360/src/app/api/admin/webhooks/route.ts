import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export const EVENT_TYPES = [
  "customer.created",
  "case.created",
  "case.assigned",
  "case.resolved",
  "sla.warning",
  "sla.breached",
  "complaint.created",
  "feedback.received",
] as const;

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
  url: z.string().url(),
  events: z.array(z.enum(EVENT_TYPES)).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = createSchema.parse(await req.json());

    const secret = crypto.randomBytes(24).toString("hex");
    const webhook = await prisma.webhookSubscription.create({
      data: { tenantId: ctx.tenantId, url: body.url, events: body.events, secret },
    });

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
