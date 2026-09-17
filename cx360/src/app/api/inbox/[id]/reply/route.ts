import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

const replySchema = z.object({ message: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = replySchema.parse(await req.json());

    const original = await prisma.interaction.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [, reply] = await prisma.$transaction([
      prisma.interaction.update({
        where: { id: original.id },
        data: { status: original.status === "NEW" ? "IN_PROGRESS" : original.status, agentId: ctx.userId },
      }),
      prisma.interaction.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: original.customerId,
          agentId: ctx.userId,
          channel: original.channel,
          direction: "outbound",
          status: "IN_PROGRESS",
          summary: body.message,
          caseId: original.caseId,
        },
      }),
    ]);

    return NextResponse.json({ reply }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
