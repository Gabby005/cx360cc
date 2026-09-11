import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { createCase } from "@/lib/case-service";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const status = req.nextUrl.searchParams.get("status");
    const assignedToMe = req.nextUrl.searchParams.get("assignedToMe") === "true";

    const cases = await prisma.case.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status: status as any } : {}),
        ...(assignedToMe ? { assignedToId: ctx.userId } : {}),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 100,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true } },
        slaPolicy: true,
        queue: { select: { name: true } },
      },
    });

    return NextResponse.json({ cases });
  } catch (err) {
    return handleError(err);
  }
}

const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;

const createSchema = z
  .object({
    customerId: z.string(),
    type: z.enum(["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"]).default("SERVICE_REQUEST"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    subject: z.string().min(1),
    description: z.string().min(1, "A comment/description is required for every case."),
    category: z.string().optional(),
    caseCodeId: z.string().optional(),
    isTransactional: z.boolean().default(false),
    transactionAmount: z.number().positive().optional(),
    transactionCurrency: z.enum(CURRENCIES).optional(),
    escalatedUnitId: z.string().optional(),
    queueId: z.string().optional(),
  })
  .refine((data) => !data.isTransactional || (data.transactionAmount && data.transactionCurrency), {
    message: "Amount and currency are required for a transactional case.",
    path: ["transactionAmount"],
  });

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = createSchema.parse(await req.json());

    const created = await prisma.$transaction((tx) =>
      createCase(tx, { ...body, tenantId: ctx.tenantId, actorId: ctx.userId })
    );

    return NextResponse.json({ case: created }, { status: 201 });
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
