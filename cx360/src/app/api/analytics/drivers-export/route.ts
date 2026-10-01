import { NextRequest, NextResponse } from "next/server";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { parseRange } from "@/lib/analytics-range";
import { getTopDrivers, DRIVER_LIMIT, type DriverList } from "@/lib/analytics-drivers";
import { buildXlsx, type Sheet } from "@/lib/xlsx-lite";

function toSheet(name: string, list: DriverList): Sheet {
  return {
    name,
    colWidths: [8, 36, 36, 10, 12],
    percentCols: [4],
    rows: [
      ["Rank", "Category", "Subcategory", "Cases", "% of total"],
      ...list.rows.map((r, i) => [i + 1, r.category, r.subcategory ?? "", r.count, list.total ? r.count / list.total : 0]),
    ],
  };
}

/** Top 30 engagement drivers for complaints, requests and enquiries — one sheet each. Supervisor+ only. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");

    const sp = req.nextUrl.searchParams;
    const range = parseRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
    const drivers = await getTopDrivers(ctx.tenantId, range.start, range.end, DRIVER_LIMIT);

    const file = buildXlsx([
      toSheet("Complaints", drivers.COMPLAINT),
      toSheet("Requests", drivers.SERVICE_REQUEST),
      toSheet("Enquiries", drivers.INQUIRY),
    ]);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cx360-top-drivers-${range.from}_to_${range.to}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
