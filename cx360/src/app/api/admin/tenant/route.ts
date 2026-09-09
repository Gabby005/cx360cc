import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const patchSchema = z.object({
  caseNumberPrefix: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Use uppercase letters/numbers only, e.g. PTB"),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { caseNumberPrefix: body.caseNumberPrefix },
    });

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
