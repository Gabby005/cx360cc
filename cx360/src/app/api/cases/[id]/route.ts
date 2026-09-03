import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const found = await prisma.case.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: {
        customer: true,
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        slaPolicy: true,
        interactions: { orderBy: { createdAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      },
    });
    if (!found) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json({ case: found });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["NEW", "OPEN", "PENDING_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"]).optional(),
  assignedToId: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.case.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!existing) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const now = new Date();
    const data: Record<string, unknown> = { ...body };

    // First response/resolution timestamps drive the SLA clock stage
    // transitions — stamp them the moment status implies the milestone.
    if (body.status && !existing.respondedAt && ["OPEN", "PENDING_CUSTOMER"].includes(body.status)) {
      data.respondedAt = now;
    }
    if (body.status === "RESOLVED" && !existing.resolvedAt) {
      data.resolvedAt = now;
    }
    if (body.status === "CLOSED" && !existing.closedAt) {
      data.closedAt = now;
    }

    const events: { type: string; payload: Record<string, unknown> }[] = [];
    if (body.assignedToId && body.assignedToId !== existing.assignedToId) {
      events.push({ type: "case.assigned", payload: { caseId: existing.id, assignedToId: body.assignedToId } });
    }
    if (body.status === "RESOLVED" && existing.status !== "RESOLVED") {
      events.push({ type: "case.resolved", payload: { caseId: existing.id } });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.case.update({ where: { id: existing.id }, data });
      for (const e of events) {
        await tx.event.create({ data: { tenantId: ctx.tenantId, type: e.type, payload: e.payload } });
      }
      return u;
    });

    return NextResponse.json({ case: updated });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
