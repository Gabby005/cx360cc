import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { FIELD_KEY_RE, MAX_SUMMARY_FIELDS, parseSummaryFields } from "@/lib/customer-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { customerSummaryFields: true } });
    return NextResponse.json({ fields: parseSummaryFields(t?.customerSummaryFields) });
  } catch (err) {
    return handleError(err);
  }
}

const putSchema = z.object({
  fields: z
    .array(
      z.object({
        key: z.string().regex(FIELD_KEY_RE, "Field keys use letters, numbers and underscores, and start with a letter."),
        label: z.string().trim().min(1, "Every field needs a label").max(40),
        sensitive: z.boolean(),
      })
    )
    .max(MAX_SUMMARY_FIELDS, `Up to ${MAX_SUMMARY_FIELDS} fields.`),
});

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const { fields } = putSchema.parse(await req.json());

    const keys = fields.map((f) => f.key.toLowerCase());
    if (new Set(keys).size !== keys.length) throw new ApiError(400, "Each field key can only be used once.");

    await prisma.$transaction([
      prisma.tenant.update({ where: { id: ctx.tenantId }, data: { customerSummaryFields: fields as unknown as Prisma.InputJsonValue } }),
      prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          action: "updated",
          entity: "CustomerSummaryConfig",
          entityId: ctx.tenantId,
          after: { fields: fields.map((f) => f.key) },
        },
      }),
    ]);
    return NextResponse.json({ fields });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
