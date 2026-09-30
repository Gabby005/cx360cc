import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { STATUS_LABEL, OPEN_STATUSES } from "@/lib/case-status";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";

const DAYS = 14;
const DRIVER_DAYS = 30;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function AnalyticsPage() {
  const ctx = await requireSession();

  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - (DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);

  const driverStart = new Date();
  driverStart.setDate(driverStart.getDate() - DRIVER_DAYS);

  const [byStatus, byPriority, trendCases, driverCases, byUnitStatus, units] = await Promise.all([
    prisma.case.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId }, _count: true }),
    prisma.case.groupBy({
      by: ["priority"],
      where: { tenantId: ctx.tenantId, status: { notIn: ["CLOSED", "RESOLVED"] } },
      _count: true,
    }),
    // One wide query, then aggregate per-day in JS — cheaper than 14+ separate count queries.
    prisma.case.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ createdAt: { gte: trendStart } }, { resolvedAt: { gte: trendStart } }],
      },
      select: { createdAt: true, resolvedAt: true, resolutionDueAt: true },
    }),
    prisma.case.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: driverStart }, caseCodeId: { not: null } },
      select: { type: true, caseCode: { select: { category: true } } },
    }),
    // Tickets per department (unit) x status — aggregated to open/closed below.
    prisma.case.groupBy({ by: ["escalatedUnitId", "status"], where: { tenantId: ctx.tenantId }, _count: true }),
    // All units, so a newly created department shows up (with 0/0) straight away.
    prisma.unit.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build the last 14 day buckets up front so days with zero activity still show as 0, not a gap.
  const days: { key: string; label: string }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(trendStart);
    d.setDate(d.getDate() + i);
    days.push({ key: dayKey(d), label: dayLabel(d) });
  }

  const createdByDay = new Map(days.map((d) => [d.key, 0]));
  const resolvedByDay = new Map(days.map((d) => [d.key, 0]));
  const slaMetByDay = new Map(days.map((d) => [d.key, 0]));
  const slaTotalByDay = new Map(days.map((d) => [d.key, 0]));

  for (const c of trendCases) {
    const createdKey = dayKey(c.createdAt);
    if (createdByDay.has(createdKey)) createdByDay.set(createdKey, createdByDay.get(createdKey)! + 1);

    if (c.resolvedAt) {
      const resolvedKey = dayKey(c.resolvedAt);
      if (resolvedByDay.has(resolvedKey)) {
        resolvedByDay.set(resolvedKey, resolvedByDay.get(resolvedKey)! + 1);
        slaTotalByDay.set(resolvedKey, slaTotalByDay.get(resolvedKey)! + 1);
        if (!c.resolutionDueAt || c.resolvedAt <= c.resolutionDueAt) {
          slaMetByDay.set(resolvedKey, slaMetByDay.get(resolvedKey)! + 1);
        }
      }
    }
  }

  const volumeTrend = days.map((d) => ({
    date: d.label,
    created: createdByDay.get(d.key) ?? 0,
    resolved: resolvedByDay.get(d.key) ?? 0,
  }));

  const slaTrend = days.map((d) => {
    const total = slaTotalByDay.get(d.key) ?? 0;
    const met = slaMetByDay.get(d.key) ?? 0;
    return { date: d.label, complianceRate: total > 0 ? Math.round((met / total) * 100) : 0 };
  });

  const statusBreakdown = byStatus.map((s) => ({ label: STATUS_LABEL[s.status] ?? s.status, count: s._count }));
  const priorityBreakdown = byPriority.map((p) => ({ label: p.priority, count: p._count }));

  // Department = the unit a case is escalated to. Open = still needs work;
  // Closed = Resolved + Closed. Cases with no unit are grouped separately.
  const openSet = new Set<string>(OPEN_STATUSES);
  const deptMap = new Map<string, { name: string; open: number; closed: number }>();
  for (const u of units) if (u.active) deptMap.set(u.id, { name: u.name, open: 0, closed: 0 });
  const noUnit = { name: "No unit assigned", open: 0, closed: 0 };
  for (const row of byUnitStatus) {
    const bucket = row.escalatedUnitId
      ? (deptMap.get(row.escalatedUnitId) ??
        (() => {
          // Inactive/removed unit that still has cases — keep its history visible.
          const u = units.find((x) => x.id === row.escalatedUnitId);
          const b = { name: u ? `${u.name} (inactive)` : "Unknown unit", open: 0, closed: 0 };
          deptMap.set(row.escalatedUnitId!, b);
          return b;
        })())
      : noUnit;
    if (openSet.has(row.status)) bucket.open += row._count;
    else bucket.closed += row._count;
  }
  const departmentStats = [...deptMap.values(), ...(noUnit.open + noUnit.closed > 0 ? [noUnit] : [])].sort(
    (a, b) => b.open + b.closed - (a.open + a.closed) || a.name.localeCompare(b.name)
  );

  function topN(type: "COMPLAINT" | "SERVICE_REQUEST" | "INQUIRY", n = 5) {
    const counts = new Map<string, number>();
    for (const c of driverCases) {
      if (c.type !== type || !c.caseCode) continue;
      counts.set(c.caseCode.category, (counts.get(c.caseCode.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  const topDrivers = {
    COMPLAINT: topN("COMPLAINT"),
    SERVICE_REQUEST: topN("SERVICE_REQUEST"),
    INQUIRY: topN("INQUIRY"),
  };

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1600px]">
      <h1 className="text-lg font-semibold mb-1">Analytics</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Live trends from your own case data. Executive dashboards and CSAT/NPS rollups are Phase 2.
      </p>

      <AnalyticsCharts
        volumeTrend={volumeTrend}
        slaTrend={slaTrend}
        statusBreakdown={statusBreakdown}
        priorityBreakdown={priorityBreakdown}
        topDrivers={topDrivers}
        departmentStats={departmentStats}
      />
    </div>
  );
}
