import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: {
        products: true,
        interactions: { orderBy: { createdAt: "desc" }, take: 20 },
        cases: {
          orderBy: { createdAt: "desc" },
          include: { slaPolicy: true, assignedTo: { select: { name: true } } },
        },
        feedback: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
