import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const existing = await prisma.apiKey.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "api_key_revoked", entity: "ApiKey", entityId: existing.id, after: { name: existing.name } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  scopes: z.array(z.enum(["read", "write"])).min(1, "Choose at least one permission").optional(),
});

/** Rename a key or change its permissions (takes effect on the key's next request). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.apiKey.findFirst({ where: { id: params.id, tenantId: ctx.tenantId, revokedAt: null } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.apiKey.update({
      where: { id: existing.id },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.scopes ? { scopes: [...new Set(body.scopes)] } : {}) },
      select: { id: true, name: true, scopes: true },
    });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "api_key_updated", entity: "ApiKey", entityId: existing.id, before: { name: existing.name, scopes: existing.scopes }, after: { name: updated.name, scopes: updated.scopes } });
    return NextResponse.json({ key: updated });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
