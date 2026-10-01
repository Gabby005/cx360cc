import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Categories → subcategories available to pick from in the batch-close dialog. */
export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const codes = await prisma.caseCode.findMany({
      where: { tenantId: ctx.tenantId },
      select: { category: true, subcategory: true },
      orderBy: [{ category: "asc" }, { subcategory: "asc" }],
    });

    const map = new Map<string, Set<string>>();
    for (const c of codes) {
      const set = map.get(c.category) ?? new Set<string>();
      if (c.subcategory) set.add(c.subcategory);
      map.set(c.category, set);
    }
    return NextResponse.json({
      categories: [...map.entries()].map(([category, subs]) => ({ category, subcategories: [...subs] })),
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
