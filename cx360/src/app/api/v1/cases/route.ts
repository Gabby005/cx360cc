import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { ApiError } from "@/lib/tenant";
import { createCase } from "@/lib/case-service";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireApiKey(req);
    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 25), 100);

    const cases = await prisma.case.findMany({
      where: { tenantId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ data: cases });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  customerId: z.string(),
  type: z.enum(["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"]).default("SERVICE_REQUEST"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  subject: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
});

// Same createCase() service backing the UI's Cases API and the Inbox's
// convert-to-case action — an external system creating a case via API key
// gets an identical SLA clock and case.created event, with zero drift
// between entry points.
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireApiKey(req);
    const body = createSchema.parse(await req.json());

    const customer = await prisma.customer.findFirst({ where: { id: body.customerId, tenantId } });
    if (!customer) return NextResponse.json({ error: "customerId not found for this tenant" }, { status: 404 });

    const created = await prisma.$transaction((tx) => createCase(tx, { ...body, tenantId }));
    return NextResponse.json({ data: created }, { status: 201 });
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
