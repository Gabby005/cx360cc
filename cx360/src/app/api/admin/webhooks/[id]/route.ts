import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import crypto from "crypto";
import { recordAudit } from "@/lib/audit";
import { EVENT_TYPES } from "@/lib/event-catalog";
import { checkGatewayUrl } from "@/lib/delivery/config";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  active: z.boolean().optional(),
  url: z.string().trim().url("Enter a full web address").max(500).optional(),
  events: z.array(z.string().refine((e) => EVENT_TYPES.includes(e), "Unknown event")).min(1, "Choose at least one event").optional(),
  rotateSecret: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.webhookSubscription.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.url) {
      const bad = checkGatewayUrl(body.url);
      if (bad) throw new ApiError(400, bad);
    }
    const newSecret = body.rotateSecret ? crypto.randomBytes(24).toString("hex") : undefined;
    const updated = await prisma.webhookSubscription.update({
      where: { id: existing.id },
      data: { ...(body.active !== undefined ? { active: body.active } : {}), ...(body.url ? { url: body.url } : {}), ...(body.events ? { events: body.events } : {}), ...(newSecret ? { secret: newSecret } : {}) },
    });
    const action = newSecret ? "webhook_secret_rotated" : body.url || body.events ? "webhook_updated" : updated.active ? "webhook_enabled" : "webhook_disabled";
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action, entity: "Webhook", entityId: existing.id, before: { url: existing.url, events: existing.events, active: existing.active }, after: { url: updated.url, events: updated.events, active: updated.active } });
    // A rotated secret is shown once, in this response only.
    return NextResponse.json({ webhook: { ...updated, secret: newSecret ?? `${updated.secret.slice(0, 6)}${"•".repeat(10)}` }, newSecret });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const existing = await prisma.webhookSubscription.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.webhookSubscription.delete({ where: { id: existing.id } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "webhook_deleted", entity: "Webhook", entityId: existing.id, before: { url: existing.url, events: existing.events } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
