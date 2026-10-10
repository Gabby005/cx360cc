import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { reuseCase } from "@/lib/case-service";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");
    // "Reuse this ticket" creates a NEW ticket (new number) copied from the closed one.
    const created = await prisma.$transaction((tx) => reuseCase(tx, ctx.tenantId, params.id, ctx.userId), { timeout: 15_000 });
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
