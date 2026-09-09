import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

const createSchema = z.object({
  body: z.string().min(1),
  internal: z.boolean().default(true),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const parsed = createSchema.parse(await req.json());

    const kase = await prisma.case.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const note = await prisma.caseNote.create({
      data: { caseId: kase.id, authorId: ctx.userId, body: parsed.body, internal: parsed.internal },
      include: { author: { select: { name: true } } },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
