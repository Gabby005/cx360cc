import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { STATUS_LABEL, OPEN_STATUSES } from "@/lib/case-status";
import { parseRange } from "@/lib/analytics-range";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { RangeFilter } from "@/components/analytics/range-filter";

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 86_400_000;
const ROW_LIMIT = 20_000;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
}
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function round1(n: number | null) {
  return n === null ? null : Math.round(n * 10) / 10;
}

type Acc = { assigned: number; resolved: number; open: number; resMs: number; slaMet: number };
const blank = (): Acc => ({ assigned: 0, resolved: 0, open: 0, resMs: 0, slaMet: 0 });
function summarise(a: Acc) {
  return {
    assigned: a.assigned,
    resolved: a.resolved,
    open: a.open,
    avgResolutionHrs: a.resolved ? round1(a.resMs / a.resolved / HOUR) : null,
    slaPct: a.resolved ? Math.round((a.slaMet / a.resolved) * 100) : null,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const ctx = await requireSession();
  const range = parseRange(searchParams);
  const { start, end } = range;
  const now = new Date();
  const inWindow = (d: Date | null) => !!d && d >= start && d < end;

  const [caseRows, openRows, feedbackRows, channelRows, units, memberships] = await Promise.all([
    // Every case created OR resolved in the window — one wide query, aggregated in JS below.
    prisma.case.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ createdAt: { gte: start, lt: end } }, { resolvedAt: { gte: start, lt: end } }],
      },
      select: {
        type: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        resolvedAt: true,
        resolutionDueAt: true,
        assignedToId: true,
        escalatedUnitId: true,
        caseCode: { select: { category: true } },
      },
      take: ROW_LIMIT,
    }),
    // Current backlog (not range-dependent): everything still needing work.
    prisma.case.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: ["CLOSED", "RESOLVED"] } },
      select: { priority: true, createdAt: true, resolutionDueAt: true, assignedToId: true },
      take: ROW_LIMIT,
    }),
    prisma.feedbackResponse.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: start, lt: end } },
      select: { score: true, survey: { select: { type: true } } },
      take: ROW_LIMIT,
    }),
    prisma.interaction.groupBy({
      by: ["channel", "direction"],
      where: { tenantId: ctx.tenantId, createdAt: { gte: start, lt: end } },
      _count: true,
    }),
    prisma.unit.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      select: { userId: true, user: { select: { name: true } }, team: { select: { name: true } } },
    }),
  ]);

  const truncated = caseRows.length >= ROW_LIMIT || openRows.length >= ROW_LIMIT;

  const createdIn = caseRows.filter((c) => inWindow(c.createdAt));
  const resolvedIn = caseRows.filter((c) => inWindow(c.resolvedAt));
  const slaMet = (c: { resolvedAt: Date | null; resolutionDueAt: Date | null }) =>
    !!c.resolvedAt && (!c.resolutionDueAt || c.resolvedAt <= c.resolutionDueAt);

  // ---- KPIs ----------------------------------------------------------------
  const avgResolutionHrs = round1(mean(resolvedIn.map((c) => (c.resolvedAt!.getTime() - c.createdAt.getTime()) / HOUR)));
  const avgFirstResponseMins = round1(
    mean(createdIn.filter((c) => c.respondedAt).map((c) => (c.respondedAt!.getTime() - c.createdAt.getTime()) / MIN))
  );
  const slaPct = resolvedIn.length ? Math.round((resolvedIn.filter(slaMet).length / resolvedIn.length) * 100) : null;
  const overdue = openRows.filter((c) => c.resolutionDueAt && c.resolutionDueAt < now).length;

  const kpis = {
    created: createdIn.length,
    resolved: resolvedIn.length,
    openNow: openRows.length,
    overdue,
    avgResolutionHrs,
    avgFirstResponseMins,
    slaPct,
  };

  // ---- Trends (follow the selected range) -----------------------------------
  const days: { key: string; label: string }[] = [];
  for (let i = 0; i < range.days; i++) {
    const d = new Date(start.getTime() + i * DAY);
    days.push({ key: dayKey(d), label: dayLabel(d) });
  }
  const createdByDay = new Map(days.map((d) => [d.key, 0]));
  const resolvedByDay = new Map(days.map((d) => [d.key, 0]));
  const slaMetByDay = new Map(days.map((d) => [d.key, 0]));

  for (const c of createdIn) createdByDay.set(dayKey(c.createdAt), (createdByDay.get(dayKey(c.createdAt)) ?? 0) + 1);
  for (const c of resolvedIn) {
    const k = dayKey(c.resolvedAt!);
    resolvedByDay.set(k, (resolvedByDay.get(k) ?? 0) + 1);
    if (slaMet(c)) slaMetByDay.set(k, (slaMetByDay.get(k) ?? 0) + 1);
  }

  const volumeTrend = days.map((d) => ({
    date: d.label,
    created: createdByDay.get(d.key) ?? 0,
    resolved: resolvedByDay.get(d.key) ?? 0,
  }));
  const slaTrend = days.map((d) => {
    const total = resolvedByDay.get(d.key) ?? 0;
    const met = slaMetByDay.get(d.key) ?? 0;
    return { date: d.label, complianceRate: total > 0 ? Math.round((met / total) * 100) : 0 };
  });

  // ---- Breakdowns -----------------------------------------------------------
  const statusCounts = new Map<string, number>();
  for (const c of createdIn) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  const statusBreakdown = [...statusCounts.entries()].map(([s, count]) => ({ label: STATUS_LABEL[s] ?? s, count }));

  const priorityCounts = new Map<string, number>();
  for (const c of openRows) priorityCounts.set(c.priority, (priorityCounts.get(c.priority) ?? 0) + 1);
  const priorityBreakdown = [...priorityCounts.entries()].map(([label, count]) => ({ label, count }));

  // Backlog aging — how long the currently-open cases have been waiting.
  const aging = [
    { label: "< 1 day", count: 0, tone: "ok" },
    { label: "1–3 days", count: 0, tone: "neutral" },
    { label: "3–7 days", count: 0, tone: "warning" },
    { label: "> 7 days", count: 0, tone: "breach" },
  ];
  for (const c of openRows) {
    const age = now.getTime() - c.createdAt.getTime();
    aging[age < DAY ? 0 : age < 3 * DAY ? 1 : age < 7 * DAY ? 2 : 3].count++;
  }

  // Department = the unit a case is escalated to. Open = still needs work; Closed = Resolved + Closed.
  const openSet = new Set<string>(OPEN_STATUSES);
  const deptMap = new Map<string, { name: string; open: number; closed: number }>();
  for (const u of units) if (u.active) deptMap.set(u.id, { name: u.name, open: 0, closed: 0 });
  const noUnit = { name: "No unit assigned", open: 0, closed: 0 };
  for (const c of createdIn) {
    let bucket = noUnit;
    if (c.escalatedUnitId) {
      let b = deptMap.get(c.escalatedUnitId);
      if (!b) {
        const u = units.find((x) => x.id === c.escalatedUnitId);
        b = { name: u ? `${u.name} (inactive)` : "Unknown unit", open: 0, closed: 0 };
        deptMap.set(c.escalatedUnitId, b);
      }
      bucket = b;
    }
    if (openSet.has(c.status)) bucket.open++;
    else bucket.closed++;
  }
  const departmentStats = [...deptMap.values(), ...(noUnit.open + noUnit.closed > 0 ? [noUnit] : [])].sort(
    (a, b) => b.open + b.closed - (a.open + a.closed) || a.name.localeCompare(b.name)
  );

  // Channels — interaction volume by channel and direction.
  const channelMap = new Map<string, { channel: string; inbound: number; outbound: number }>();
  for (const r of channelRows) {
    const e = channelMap.get(r.channel) ?? { channel: r.channel, inbound: 0, outbound: 0 };
    if (r.direction === "inbound") e.inbound += r._count;
    else e.outbound += r._count;
    channelMap.set(r.channel, e);
  }
  const channelStats = [...channelMap.values()].sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));

  // ---- Agent + team leaderboards ---------------------------------------------
  const byAgent = new Map<string, Acc>();
  const agentAcc = (id: string) => {
    let a = byAgent.get(id);
    if (!a) byAgent.set(id, (a = blank()));
    return a;
  };
  for (const c of createdIn) if (c.assignedToId) agentAcc(c.assignedToId).assigned++;
  for (const c of resolvedIn) {
    if (!c.assignedToId) continue;
    const a = agentAcc(c.assignedToId);
    a.resolved++;
    a.resMs += c.resolvedAt!.getTime() - c.createdAt.getTime();
    if (slaMet(c)) a.slaMet++;
  }
  for (const c of openRows) if (c.assignedToId) agentAcc(c.assignedToId).open++;

  const member = new Map(memberships.map((m) => [m.userId, { name: m.user.name, team: m.team?.name ?? "No team" }]));
  const agentStats = [...byAgent.entries()]
    .map(([id, a]) => ({ name: member.get(id)?.name ?? "Unknown user", team: member.get(id)?.team ?? "No team", ...summarise(a) }))
    .sort((a, b) => b.resolved - a.resolved || b.open - a.open);

  const byTeam = new Map<string, Acc & { agents: number }>();
  for (const [id, a] of byAgent) {
    const team = member.get(id)?.team ?? "No team";
    const t = byTeam.get(team) ?? { ...blank(), agents: 0 };
    t.agents++;
    t.assigned += a.assigned;
    t.resolved += a.resolved;
    t.open += a.open;
    t.resMs += a.resMs;
    t.slaMet += a.slaMet;
    byTeam.set(team, t);
  }
  const teamStats = [...byTeam.entries()]
    .map(([name, t]) => ({ name, agents: t.agents, ...summarise(t) }))
    .sort((a, b) => b.resolved - a.resolved || b.open - a.open);

  // ---- CSAT / NPS / CES rollups ---------------------------------------------
  const scores: Record<"CSAT" | "NPS" | "CES", number[]> = { CSAT: [], NPS: [], CES: [] };
  for (const r of feedbackRows) scores[r.survey.type].push(r.score);
  const csatN = scores.CSAT.length;
  const npsN = scores.NPS.length;
  const feedback = {
    csat: { n: csatN, pct: csatN ? Math.round((scores.CSAT.filter((s) => s >= 4).length / csatN) * 100) : null },
    nps: {
      n: npsN,
      score: npsN
        ? Math.round(((scores.NPS.filter((s) => s >= 9).length - scores.NPS.filter((s) => s <= 6).length) / npsN) * 100)
        : null,
    },
    ces: { n: scores.CES.length, avg: round1(mean(scores.CES)) },
  };

  // ---- Top drivers (complaints / requests / enquiries by category) ------------
  function topN(type: "COMPLAINT" | "SERVICE_REQUEST" | "INQUIRY", n = 5) {
    const counts = new Map<string, number>();
    for (const c of createdIn) {
      if (c.type !== type || !c.caseCode) continue;
      counts.set(c.caseCode.category, (counts.get(c.caseCode.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }
  const topDrivers = { COMPLAINT: topN("COMPLAINT"), SERVICE_REQUEST: topN("SERVICE_REQUEST"), INQUIRY: topN("INQUIRY") };

  const canExport = ctx.role === "ADMIN" || ctx.role === "SUPERVISOR";

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1600px]">
      <h1 className="text-lg font-semibold mb-1">Analytics</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-4">
        Live trends from your own case data, for the {range.label}.
      </p>

      <RangeFilter rangeKey={range.key} from={range.from} to={range.to} canExport={canExport} />

      {truncated && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
          This range has more than {ROW_LIMIT.toLocaleString()} cases, so figures are based on a sample. Narrow the date range for exact numbers.
        </p>
      )}

      <AnalyticsCharts
        rangeLabel={range.label}
        kpis={kpis}
        volumeTrend={volumeTrend}
        slaTrend={slaTrend}
        statusBreakdown={statusBreakdown}
        priorityBreakdown={priorityBreakdown}
        aging={aging}
        channelStats={channelStats}
        agentStats={agentStats}
        teamStats={teamStats}
        feedback={feedback}
        topDrivers={topDrivers}
        departmentStats={departmentStats}
      />
    </div>
  );
}
