import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Put a failed (or sent) delivery back in the queue; the next minute's run sends it. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const d = await prisma.webhookDelivery.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Cloned rather than revived, so the old attempt stays in the history and the 24-hour retry window starts fresh.
    const copy = await prisma.webhookDelivery.create({ data: { tenantId: d.tenantId, subscriptionId: d.subscriptionId, eventId: d.eventId, type: d.type, payload: d.payload as object } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "webhook_delivery_resent", entity: "Webhook", entityId: d.subscriptionId, after: { type: d.type, deliveryId: copy.id } });
    return NextResponse.json({ ok: true, id: copy.id });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
