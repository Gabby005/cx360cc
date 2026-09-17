import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const q = req.nextUrl.searchParams.get("q")?.trim();

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        segment: true,
        sentimentAvg: true,
        _count: { select: { cases: true } },
      },
    });

    return NextResponse.json({ customers });
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
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = createSchema.parse(await req.json());

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { ...body, tenantId: ctx.tenantId },
      });
      await tx.event.create({
        data: {
          tenantId: ctx.tenantId,
          type: "customer.created",
          payload: { customerId: created.id },
        },
      });
      return created;
    });

    return NextResponse.json({ customer }, { status: 201 });
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
