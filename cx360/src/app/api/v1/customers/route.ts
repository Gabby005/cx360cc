import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { ApiError } from "@/lib/tenant";

/**
 * External, API-key-authenticated surface (v1). This is the integration
 * point for core banking / ERP systems per the brief's Integration Hub
 * requirement — separate from the session-authenticated routes the web
 * app itself uses, but built on the exact same Prisma models, so a
 * customer created via this API shows up in the Customer 360 UI
 * immediately and vice versa.
 */
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireApiKey(req);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 25), 100);

    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return NextResponse.json({
      data: customers,
      nextCursor: customers.length === limit ? customers[customers.length - 1].id : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  segment: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireApiKey(req);
    const body = createSchema.parse(await req.json());

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { ...body, tenantId, customFields: body.customFields as unknown as Prisma.InputJsonValue },
      });
      await tx.event.create({
        data: { tenantId, type: "customer.created", payload: { customerId: created.id, source: "api" } },
      });
      return created;
    });

    return NextResponse.json({ data: customer }, { status: 201 });
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
