import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { deliverWebhook } from "@/lib/webhook";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const sub = await prisma.webhookSubscription.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await deliverWebhook(sub.url, sub.secret, "test.ping", {
      message: "This is a test event from CX360.",
      subscriptionId: sub.id,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
