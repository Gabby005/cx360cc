import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { ApiError } from "@/lib/tenant";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireApiKey(req);
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, tenantId },
      include: { products: true, cases: { select: { id: true, subject: true, status: true } } },
    });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ data: customer });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
