import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const units = await prisma.unit.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } });
    return NextResponse.json({ units });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = createSchema.parse(await req.json());

    const existing = await prisma.unit.findFirst({ where: { tenantId: ctx.tenantId, email: body.email } });
    if (existing) {
      return NextResponse.json({ error: `A unit with email "${body.email}" already exists.` }, { status: 409 });
    }

    const unit = await prisma.unit.create({ data: { ...body, tenantId: ctx.tenantId } });
    return NextResponse.json({ unit }, { status: 201 });
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
