import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { parseRange } from "@/lib/analytics-range";

const MAX_ROWS = 50_000;

/** CSV-escape a cell, and neutralise spreadsheet formula injection (=, +, -, @ at the start). */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    // Bulk case export is a supervisor-level capability.
    requirePermission(ctx, "SUPERVISOR");

    const sp = req.nextUrl.searchParams;
    const range = parseRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });

    const cases = await prisma.case.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: range.start, lt: range.end } },
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        caseNumber: true,
        type: true,
        priority: true,
        status: true,
        isTransactional: true,
        createdAt: true,
        respondedAt: true,
        resolvedAt: true,
        resolutionDueAt: true,
        caseCode: { select: { category: true } },
        escalatedUnit: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    });

    const header = [
      "Case number",
      "Type",
      "Priority",
      "Status",
      "Category",
      "Transactional",
      "Escalated unit",
      "Assigned agent",
      "Created",
      "First response",
      "Resolved",
      "Resolution due",
      "Resolved within SLA",
    ];

    const lines = [header.map(cell).join(",")];
    for (const c of cases) {
      const sla = c.resolvedAt ? (!c.resolutionDueAt || c.resolvedAt <= c.resolutionDueAt ? "Yes" : "No") : "";
      lines.push(
        [
          c.caseNumber,
          c.type,
          c.priority,
          c.status,
          c.caseCode?.category ?? "",
          c.isTransactional ? "Yes" : "No",
          c.escalatedUnit?.name ?? "",
          c.assignedTo?.name ?? "",
          c.createdAt,
          c.respondedAt,
          c.resolvedAt,
          c.resolutionDueAt,
          sla,
        ]
          .map(cell)
          .join(",")
      );
    }

    return new NextResponse("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cx360-cases-${range.from}_to_${range.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
