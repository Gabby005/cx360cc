import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const TYPES = ["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"] as const;

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const type = req.nextUrl.searchParams.get("type");
    const codes = await prisma.caseCode.findMany({
      where: { tenantId: ctx.tenantId, ...(type ? { type: type as any } : {}) },
      orderBy: [{ type: "asc" }, { category: "asc" }, { subcategory: "asc" }],
    });

    return NextResponse.json({ codes });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  type: z.enum(TYPES),
  code: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const body = createSchema.parse(await req.json());

    const existing = await prisma.caseCode.findFirst({ where: { tenantId: ctx.tenantId, code: body.code } });
    if (existing) {
      return NextResponse.json({ error: `Code "${body.code}" already exists.` }, { status: 409 });
    }

    const code = await prisma.caseCode.create({ data: { ...body, tenantId: ctx.tenantId } });
    return NextResponse.json({ code }, { status: 201 });
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
