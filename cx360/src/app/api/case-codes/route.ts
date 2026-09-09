import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

const typeSchema = z.enum(["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"]);

/**
 * Active case codes for one interaction type — this is what the
 * Category/Subcategory dropdowns in case-creation forms call. Read-only
 * and available to any authenticated role (not admin-gated), since every
 * agent needs this to log a case; only *managing* the taxonomy is
 * restricted (see /api/admin/case-codes).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const type = typeSchema.parse(req.nextUrl.searchParams.get("type"));

    const codes = await prisma.caseCode.findMany({
      where: { tenantId: ctx.tenantId, type, active: true },
      orderBy: [{ category: "asc" }, { subcategory: "asc" }],
      select: { id: true, code: true, category: true, subcategory: true },
    });

    return NextResponse.json({ codes });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid or missing type" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
