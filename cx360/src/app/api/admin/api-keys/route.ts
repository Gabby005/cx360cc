import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { generateApiKey } from "@/lib/api-key";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true, revokedAt: true },
    });
    return NextResponse.json({ keys });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({ name: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = createSchema.parse(await req.json());

    const { raw, hash } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: { tenantId: ctx.tenantId, name: body.name, keyHash: hash },
    });

    // The raw key is returned exactly once, in this response, and never
    // again — only its hash is persisted.
    return NextResponse.json(
      { key: { id: key.id, name: key.name, createdAt: key.createdAt }, rawKey: raw },
      { status: 201 }
    );
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
