import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.caseCode.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const code = await prisma.caseCode.update({ where: { id: existing.id }, data: { active: body.active } });
    return NextResponse.json({ code });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
