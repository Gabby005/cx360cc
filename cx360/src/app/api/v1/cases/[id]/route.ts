import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { ApiError } from "@/lib/tenant";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireApiKey(req);
    const kase = await prisma.case.findFirst({
      where: { id: params.id, tenantId },
      include: { customer: true, assignedTo: { select: { id: true, name: true } }, slaPolicy: true },
    });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json({ data: kase });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
