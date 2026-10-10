import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { FLAGS, TAG_KEY_RE } from "@/lib/inbox-ui";
import { isKnownTagKey } from "@/lib/inbox-data";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

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
  assignToMe: z.boolean().optional(),
  flag: z.enum(FLAGS).nullable().optional(),
  colorTag: z.string().regex(TAG_KEY_RE).nullable().optional(),
  /** true = mark read, false = mark unread (a closed message marked unread comes back to the open queue) */
  read: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");
    const { assignToMe, read, ...body } = patchSchema.parse(await req.json());

    const existing = await prisma.interaction.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.colorTag && !(await isKnownTagKey(ctx.tenantId, body.colorTag))) {
      return NextResponse.json({ error: "That team code does not exist." }, { status: 400 });
    }

    const data: Prisma.InteractionUncheckedUpdateInput = { ...body };
    if (assignToMe) data.agentId = ctx.userId;
    if (read === true) data.readAt = existing.readAt ?? new Date();
    if (read === false) {
      data.readAt = null;
      if (existing.status === "CLOSED" && body.status === undefined) data.status = "NEW";
    }
    // Closing a message counts as having read it.
    if (body.status === "CLOSED" && read === undefined && !existing.readAt) data.readAt = new Date();

    const updated = await prisma.interaction.update({ where: { id: existing.id }, data });
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
