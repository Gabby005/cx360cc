import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const KNOWN_TRIGGERS = [
  "customer.created",
  "case.created",
  "case.assigned",
  "case.resolved",
  "sla.warning",
  "sla.breached",
  "complaint.created",
  "feedback.received",
] as const;

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "gt", "gte", "lt", "lte", "contains", "in"]),
  value: z.any(),
});

const actionSchema = z.object({
  type: z.enum(["set_status", "set_priority", "assign_case", "add_case_note", "notify"]),
  params: z.record(z.any()),
});

const createSchema = z.object({
  name: z.string().min(1),
  triggerType: z.enum(KNOWN_TRIGGERS),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
  enabled: z.boolean().default(true),
});

export async function GET() {
  try {
    const ctx = await requireSession();
    const rules = await prisma.workflowRule.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    return NextResponse.json({ rules });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR"); // supervisors and admins can configure automation

    const body = createSchema.parse(await req.json());
    const rule = await prisma.workflowRule.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        triggerType: body.triggerType,
        conditions: body.conditions,
        actions: body.actions,
        enabled: body.enabled,
      },
    });
    return NextResponse.json({ rule }, { status: 201 });
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
