import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { loadTemplates, buildCustomerMessages, caseVars } from "@/lib/notify";
import { sendNotificationsBulk, type SendNotificationInput } from "@/lib/notifications";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

/** One run closes at most this many tickets, so a single click can never overload the database. Run again for the rest. */
const MAX_BATCH = 1000;
const DAY = 86_400_000;

const STATUSES = ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED", "RESOLVED"] as const;

const filterSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a From date"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a To date"),
  category: z.string().trim().max(120).optional(),
  subcategory: z.string().trim().max(120).optional(),
  status: z.enum(STATUSES).optional(),
});
type Filter = z.infer<typeof filterSchema>;

/** Builds the filter. Returns null when the chosen category/subcategory matches no case codes (so nothing can match). */
async function buildWhere(tenantId: string, f: Filter): Promise<Prisma.CaseWhereInput | null> {
  const from = new Date(`${f.fromDate}T00:00:00.000Z`);
  const to = new Date(`${f.toDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new ApiError(400, "The To date must be on or after the From date.");

  const where: Prisma.CaseWhereInput = {
    tenantId,
    status: f.status ?? { not: "CLOSED" },
    createdAt: { gte: from, lt: new Date(to.getTime() + DAY) }, // the whole "To" day is included
  };

  if (f.category) {
    const codes = await prisma.caseCode.findMany({
      where: { tenantId, category: f.category, ...(f.subcategory ? { subcategory: f.subcategory } : {}) },
      select: { id: true },
    });
    if (codes.length === 0) return null;
    where.caseCodeId = { in: codes.map((c) => c.id) };
  }
  return where;
}

function parseQuery(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const val = (k: string) => sp.get(k) || undefined;
  return filterSchema.parse({
    fromDate: val("fromDate"),
    toDate: val("toDate"),
    category: val("category"),
    subcategory: val("subcategory"),
    status: val("status"),
  });
}

/** Preview: how many tickets would this close, and which ones (first 5)? Changes nothing. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const where = await buildWhere(ctx.tenantId, parseQuery(req));
    if (!where) return NextResponse.json({ count: 0, willClose: 0, sample: [], maxBatch: MAX_BATCH });

    const [count, sample] = await Promise.all([
      prisma.case.count({ where }),
      prisma.case.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 5,
        select: { caseNumber: true, subject: true, status: true },
      }),
    ]);
    return NextResponse.json({ count, willClose: Math.min(count, MAX_BATCH), sample, maxBatch: MAX_BATCH });
  } catch (err) {
    return handleError(err);
  }
}

const execSchema = filterSchema.extend({ confirm: z.literal(true) });

/** Execute: closes the matching tickets (oldest first, up to MAX_BATCH), with one audit entry each and one customer notification each. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const { confirm: _confirm, ...filter } = execSchema.parse(await req.json());
    const where = await buildWhere(ctx.tenantId, filter);
    if (!where) return NextResponse.json({ closed: 0, remaining: 0 });

    const matching = await prisma.case.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: MAX_BATCH,
      select: {
        id: true,
        caseNumber: true,
        subject: true,
        status: true,
        priority: true,
        type: true,
        category: true,
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        assignedTo: { select: { name: true, email: true } },
      },
    });
    if (matching.length === 0) return NextResponse.json({ closed: 0, remaining: 0 });

    const ids = matching.map((c) => c.id);
    const now = new Date();

    // Same editable "closed" templates as single closes; customers whose ticket was already marked Resolved
    // have been told, so they aren't messaged again.
    const [templates, tenant] = await Promise.all([
      loadTemplates(prisma, ctx.tenantId),
      prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    ]);
    const notifications: SendNotificationInput[] = [];
    for (const c of matching) {
      if (c.status === "RESOLVED") continue;
      notifications.push(
        ...buildCustomerMessages(templates, "closed", {
          tenantId: ctx.tenantId,
          vars: caseVars({ tenantName: tenant?.name ?? "", kase: c, customer: c.customer, owner: c.assignedTo }),
          relatedCaseId: c.id,
          email: c.customer.email,
          phone: c.customer.phone,
        })
      );
    }

    // A handful of bulk statements instead of thousands of single ones.
    await prisma.$transaction(
      async (tx) => {
        await tx.case.updateMany({
          where: { id: { in: ids }, tenantId: ctx.tenantId, status: { not: "CLOSED" } },
          data: { status: "CLOSED", closedAt: now },
        });
        await tx.auditLog.createMany({
          data: matching.map((c) => ({
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            action: "batch_closed",
            entity: "Case",
            entityId: c.id,
            before: { status: c.status },
            after: { status: "CLOSED" },
          })),
        });
        await sendNotificationsBulk(tx, notifications);
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            action: "batch_close_run",
            entity: "CaseBatch",
            entityId: ctx.userId,
            after: { filter, closed: matching.length } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 }
    );

    const remaining = await prisma.case.count({ where });
    return NextResponse.json({ closed: matching.length, remaining });
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
