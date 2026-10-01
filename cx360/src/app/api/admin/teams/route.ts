import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const teams = await prisma.team.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ teams });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({ name: z.string().trim().min(2, "Team name is too short").max(60) });

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const { name } = createSchema.parse(await req.json());

    const existing = await prisma.team.findFirst({
      where: { tenantId: ctx.tenantId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "A team with that name already exists.");

    const team = await prisma.team.create({ data: { tenantId: ctx.tenantId, name }, select: { id: true, name: true } });
    return NextResponse.json({ team }, { status: 201 });
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
