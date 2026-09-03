import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const item = await prisma.interaction.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: { customer: true, agent: { select: { id: true, name: true } }, case: { select: { id: true, subject: true } } },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The rest of the thread with this customer on this channel, so the
    // agent sees full context, not just the single inbound message.
    const thread = await prisma.interaction.findMany({
      where: { tenantId: ctx.tenantId, customerId: item.customerId, channel: item.channel },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return NextResponse.json({ item, thread });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "LINKED", "CLOSED"]).optional(),
  agentId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.interaction.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.interaction.update({ where: { id: existing.id }, data: body });
    return NextResponse.json({ interaction: updated });
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
