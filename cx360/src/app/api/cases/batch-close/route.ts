import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { logCaseActivity, notifyCaseClosed } from "@/lib/case-service";

const filterSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  status: z.enum(["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED", "RESOLVED"]).optional(),
});

function buildWhere(tenantId: string, filter: z.infer<typeof filterSchema>) {
  return {
    tenantId,
    status: filter.status ? filter.status : { notIn: ["CLOSED" as const] },
    createdAt: { gte: new Date(filter.fromDate), lte: new Date(filter.toDate) },
  };
}

/** Preview: how many cases would this batch-close affect? Doesn't change anything. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const filter = filterSchema.parse({
      fromDate: req.nextUrl.searchParams.get("fromDate"),
      toDate: req.nextUrl.searchParams.get("toDate"),
      status: req.nextUrl.searchParams.get("status") ?? undefined,
    });

    const count = await prisma.case.count({ where: buildWhere(ctx.tenantId, filter) });
    return NextResponse.json({ count });
  } catch (err) {
    return handleError(err);
  }
}

/** Execute: closes every matching case, logging one audit entry per case. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const filter = filterSchema.parse(await req.json());
    const where = buildWhere(ctx.tenantId, filter);

    const matching = await prisma.case.findMany({ where, select: { id: true, status: true } });
    if (matching.length === 0) {
      return NextResponse.json({ closed: 0 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.case.updateMany({
        where: { id: { in: matching.map((c) => c.id) } },
        data: { status: "CLOSED", closedAt: now },
      });

      for (const c of matching) {
        await logCaseActivity(tx, {
          tenantId: ctx.tenantId,
          caseId: c.id,
          actorId: ctx.userId,
          action: "batch_closed",
          before: { status: c.status },
          after: { status: "CLOSED" },
        });
        await notifyCaseClosed(tx, ctx.tenantId, c.id);
      }
    });

    return NextResponse.json({ closed: matching.length });
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
