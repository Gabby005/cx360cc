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
