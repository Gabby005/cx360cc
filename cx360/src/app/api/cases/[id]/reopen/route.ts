import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { reopenCase } from "@/lib/case-service";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const updated = await prisma.$transaction((tx) => reopenCase(tx, ctx.tenantId, params.id, ctx.userId));
    return NextResponse.json({ case: updated });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
