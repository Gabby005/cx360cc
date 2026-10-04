import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Mark an error resolved (or re-open it). It re-opens by itself if it happens again. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = (await req.json().catch(() => ({}))) as { resolved?: boolean };
    await prisma.errorLog.update({ where: { id: params.id }, data: { resolved: body.resolved !== false } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
