import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { parseRange } from "@/lib/analytics-range";
import { STATUS_LABEL } from "@/lib/case-status";
import { buildXlsx, type Cell } from "@/lib/xlsx-lite";
import { buildCaseWhere, getMe, isSupervisor, parseScope, EXPORT_MAX_ROWS, type Filters } from "@/lib/case-scope";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "Africa/Lagos";
const BATCH = 2000;
const EXPORTS_PER_WINDOW = 6; // per person, per 10 minutes — protects the database from repeated big downloads
const WINDOW_MS = 10 * 60_000;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dt = (d: Date | null) => (d ? fmt.format(d).replace(", ", " ") : "");

/**
 * Excel export of the tickets in the current Cases view (same scope + filters
 * as the page). Built to stay light: date-bounded (default last 30 days, max
 * 92), capped at 10,000 rows, read in batches, and rate-limited per person.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const sp = req.nextUrl.searchParams;
    const filters: Filters = {
      scope: sp.get("scope") ?? undefined,
      status: sp.get("status") ?? undefined,
      q: sp.get("q") ?? undefined,
      group: sp.get("group") ?? undefined,
    };
    const scope = parseScope(filters.scope, ctx);
    filters.scope = scope;

    // Everyone may export their own / team / department tickets; the bank-wide list is supervisor-level.
    if (scope === "all" && !isSupervisor(ctx)) {
      throw new ApiError(403, "Exporting every ticket requires a supervisor or admin role. Choose My tickets or My team & department.");
    }

    // Date window: explicit from/to if given, otherwise the last 30 days. Never unbounded.
    const today = new Date().toISOString().slice(0, 10);
    let from = sp.get("from");
    let to = sp.get("to");
    if (from && !to) to = today;
    if (to && !from) from = new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    const range = parseRange(from && to ? { range: "custom", from, to } : { range: "30" });

    // Per-person rate limit (uses the audit trail, which is indexed for this).
    const recent = await prisma.auditLog.count({
      where: {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        action: "exported",
        createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
      },
    });
    if (recent >= EXPORTS_PER_WINDOW) {
      throw new ApiError(429, "You've downloaded several reports in the last few minutes. Please wait a little and try again.");
    }

    const me = await getMe(ctx);
    const where = await buildCaseWhere(ctx, me, filters, { start: range.start, end: range.end });
    if (!where) throw new ApiError(400, "Nothing to export for this view yet.");

    const rows: Cell[][] = [];
    let cursor: string | undefined;
    let truncated = false;

    while (rows.length < EXPORT_MAX_ROWS) {
      const take = Math.min(BATCH, EXPORT_MAX_ROWS - rows.length + 1);
      const batch = await prisma.case.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          caseNumber: true,
          subject: true,
          type: true,
          priority: true,
          status: true,
          isTransactional: true,
          transactionAmount: true,
          transactionCurrency: true,
          createdAt: true,
          respondedAt: true,
          resolvedAt: true,
          closedAt: true,
          resolutionDueAt: true,
          customer: { select: { firstName: true, lastName: true } },
          createdBy: { select: { name: true } },
          assignedTo: { select: { name: true } },
          escalatedUnit: { select: { name: true } },
          caseCode: { select: { category: true, subcategory: true } },
        },
      });
      if (batch.length === 0) break;

      for (const c of batch) {
        if (rows.length >= EXPORT_MAX_ROWS) {
          truncated = true;
          break;
        }
        rows.push([
          c.caseNumber,
          c.subject,
          c.type.replace("_", " ").toLowerCase(),
          c.caseCode?.category ?? "",
          c.caseCode?.subcategory ?? "",
          c.priority,
          STATUS_LABEL[c.status] ?? c.status,
          `${c.customer.firstName} ${c.customer.lastName}`,
          c.createdBy?.name ?? "",
          c.assignedTo?.name ?? "",
          c.escalatedUnit?.name ?? "",
          c.isTransactional ? "Yes" : "No",
          c.transactionAmount === null ? null : Number(c.transactionAmount),
          c.transactionCurrency ?? "",
          dt(c.createdAt),
          dt(c.respondedAt),
          dt(c.resolvedAt),
          dt(c.closedAt),
          dt(c.resolutionDueAt),
          c.resolvedAt ? (!c.resolutionDueAt || c.resolvedAt <= c.resolutionDueAt ? "Yes" : "No") : "",
        ]);
        cursor = c.id;
      }
      if (truncated || batch.length < take) break;
    }

    // Landed exactly on the cap: check whether anything lies beyond it.
    if (!truncated && rows.length >= EXPORT_MAX_ROWS && cursor) {
      const more = await prisma.case.findFirst({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        cursor: { id: cursor },
        skip: 1,
        select: { id: true },
      });
      truncated = !!more;
    }

    const header: Cell[] = [
      "Case number", "Subject", "Type", "Category", "Subcategory", "Priority", "Status", "Customer",
      "Logged by", "Assigned to", "Department", "Transactional", "Amount", "Currency",
      "Created", "First response", "Resolved", "Closed", "Resolution due", "Resolved within SLA",
    ];

    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    const scopeLabel = { mine: "My tickets", logged: "Logged by me", assigned: "Assigned to me", unit: "My team & department", all: "All tickets" }[scope];
    const about: Cell[][] = [
      ["Report", "CX360 tickets"],
      ["View", scopeLabel],
      ["Status filter", filters.status ?? "open"],
      ["Search", filters.q ?? ""],
      ["Created between", `${range.from} to ${range.to}`],
      ["Tickets in this file", rows.length],
      ["Note", truncated ? `Limited to the first ${EXPORT_MAX_ROWS.toLocaleString()} tickets — narrow the dates to get the rest.` : "Complete for the selected filters."],
      ["Generated by", user?.name ?? ""],
      ["Generated at", `${dt(new Date())} (${TZ})`],
    ];

    const file = buildXlsx([
      { name: "Tickets", rows: [header, ...rows], colWidths: [24, 40, 16, 22, 26, 10, 22, 24, 20, 20, 22, 13, 14, 10, 17, 17, 17, 17, 17, 18] },
      { name: "About this report", rows: [["Item", "Value"], ...about], colWidths: [22, 70] },
    ]);

    // Audit trail (also feeds the rate limit). Never block the download on this.
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          action: "exported",
          entity: "CaseExport",
          entityId: ctx.userId,
          after: { scope, status: filters.status ?? "open", from: range.from, to: range.to, rows: rows.length, truncated },
        },
      });
    } catch (e) {
      console.error("export audit failed", e);
    }

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cx360-tickets-${scope}-${range.from}_to_${range.to}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
