"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

const COLORS = {
  brand: "#5B5FEF",
  ok: "#16A34A",
  warning: "#D97706",
  breach: "#DC2626",
  neutral: "#94A3B8",
};

type VolumePoint = { date: string; created: number; resolved: number };
type SlaPoint = { date: string; complianceRate: number };
type BreakdownItem = { label: string; count: number };
type DepartmentItem = { name: string; open: number; closed: number };
type Kpis = {
  created: number;
  resolved: number;
  openNow: number;
  overdue: number;
  avgResolutionHrs: number | null;
  avgFirstResponseMins: number | null;
  slaPct: number | null;
};
type AgingItem = { label: string; count: number; tone: string };
type ChannelItem = { channel: string; inbound: number; outbound: number };
type PerfRow = {
  name: string;
  assigned: number;
  resolved: number;
  open: number;
  avgResolutionHrs: number | null;
  slaPct: number | null;
};
type AgentRow = PerfRow & { team: string };
type TeamRow = PerfRow & { agents: number };
type Feedback = {
  csat: { n: number; pct: number | null };
  nps: { n: number; score: number | null };
  ces: { n: number; avg: number | null };
};

const TONE: Record<string, string> = { ok: COLORS.ok, neutral: COLORS.neutral, warning: COLORS.warning, breach: COLORS.breach };

function fmtHours(h: number | null) {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}
function fmtMins(m: number | null) {
  if (m === null) return "—";
  if (m < 60) return `${m}m`;
  return fmtHours(m / 60);
}
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export function AnalyticsCharts({
  rangeLabel,
  kpis,
  aging,
  channelStats,
  agentStats,
  teamStats,
  feedback,
  volumeTrend,
  slaTrend,
  statusBreakdown,
  priorityBreakdown,
  departmentStats,
}: {
  rangeLabel: string;
  kpis: Kpis;
  aging: AgingItem[];
  channelStats: ChannelItem[];
  agentStats: AgentRow[];
  teamStats: TeamRow[];
  feedback: Feedback;
  volumeTrend: VolumePoint[];
  slaTrend: SlaPoint[];
  statusBreakdown: BreakdownItem[];
  priorityBreakdown: BreakdownItem[];
  departmentStats: DepartmentItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Cases created" value={String(kpis.created)} />
        <Kpi label="Cases resolved" value={String(kpis.resolved)} />
        <Kpi label="Open now" value={String(kpis.openNow)} sub={kpis.overdue > 0 ? `${kpis.overdue} overdue` : "none overdue"} subTone={kpis.overdue > 0 ? "breach" : "ok"} />
        <Kpi label="Avg resolution time" value={fmtHours(kpis.avgResolutionHrs)} />
        <Kpi label="Avg first response" value={fmtMins(kpis.avgFirstResponseMins)} />
        <Kpi label="SLA compliance" value={pct(kpis.slaPct)} sub="resolved within target" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">Case volume trend</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Created vs resolved, {rangeLabel}</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={volumeTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="created" stroke={COLORS.brand} strokeWidth={2} dot={false} name="Created" />
            <Line type="monotone" dataKey="resolved" stroke={COLORS.ok} strokeWidth={2} dot={false} name="Resolved" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">SLA compliance trend</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">
          % of cases resolved within their SLA target, {rangeLabel}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={slaTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => `${v}%`} />
            <Line type="monotone" dataKey="complianceRate" stroke={COLORS.warning} strokeWidth={2} dot={{ r: 3 }} name="Compliance" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">Tickets per department</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">
          Open vs closed, by the unit each case is escalated to (cases created in the {rangeLabel}). Closed includes resolved cases.
        </p>
        {departmentStats.length === 0 ? (
          <p className="text-xs text-ink-950/40 dark:text-surface/40">No departments or cases yet.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-3">
              <ResponsiveContainer width="100%" height={Math.max(220, departmentStats.length * 44)}>
                <BarChart data={departmentStats} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.7} width={140} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="open" name="Open" fill={COLORS.warning} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="closed" name="Closed" fill={COLORS.ok} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="xl:col-span-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-950/50 dark:text-surface/50 text-left">
                    <th className="font-medium pb-2">Department</th>
                    <th className="font-medium pb-2 text-right">Open</th>
                    <th className="font-medium pb-2 text-right">Closed</th>
                    <th className="font-medium pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentStats.map((d) => (
                    <tr key={d.name} className="border-t border-line-light dark:border-line-dark">
                      <td className="py-2 pr-2 truncate max-w-[180px]">{d.name}</td>
                      <td className="py-2 text-right font-mono">{d.open}</td>
                      <td className="py-2 text-right font-mono">{d.closed}</td>
                      <td className="py-2 text-right font-mono font-medium">{d.open + d.closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Cases by status</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Cases created in the {rangeLabel}</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusBreakdown} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.7} width={110} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill={COLORS.brand} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Open cases by priority</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Current backlog, all ages</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={priorityBreakdown} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.7} width={80} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {priorityBreakdown.map((p, i) => (
                  <Cell
                    key={i}
                    fill={p.label === "CRITICAL" ? COLORS.breach : p.label === "HIGH" ? COLORS.warning : COLORS.neutral}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Backlog aging</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">How long open cases have been waiting</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={aging}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" name="Open cases" radius={[4, 4, 0, 0]}>
                {aging.map((a, i) => (
                  <Cell key={i} fill={TONE[a.tone] ?? COLORS.neutral} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Channel volume</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Inbound vs outbound interactions, {rangeLabel}</p>
          {channelStats.length === 0 ? (
            <p className="text-xs text-ink-950/40 dark:text-surface/40">No interactions in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channelStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis dataKey="channel" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="inbound" name="Inbound" fill={COLORS.brand} radius={[4, 4, 0, 0]} />
                <Bar dataKey="outbound" name="Outbound" fill={COLORS.neutral} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Agent leaderboard</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Resolved in the {rangeLabel}; open is the current load</p>
          <PerfTable rows={agentStats} nameHeader="Agent" sub={(r) => (r as AgentRow).team} empty="No assigned cases yet." />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Team performance</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Agents grouped by team</p>
          <PerfTable rows={teamStats} nameHeader="Team" sub={(r) => `${(r as TeamRow).agents} agent${(r as TeamRow).agents === 1 ? "" : "s"}`} empty="No team data yet." />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">Customer feedback</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">
          CSAT, NPS and CES from survey responses, {rangeLabel}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi label="CSAT" value={feedback.csat.pct === null ? "—" : `${feedback.csat.pct}%`} sub={`${feedback.csat.n} response${feedback.csat.n === 1 ? "" : "s"} · scores 4–5`} />
          <Kpi label="NPS" value={feedback.nps.score === null ? "—" : String(feedback.nps.score)} sub={`${feedback.nps.n} response${feedback.nps.n === 1 ? "" : "s"}`} />
          <Kpi label="CES (avg)" value={feedback.ces.avg === null ? "—" : String(feedback.ces.avg)} sub={`${feedback.ces.n} response${feedback.ces.n === 1 ? "" : "s"}`} />
        </div>
        {feedback.csat.n + feedback.nps.n + feedback.ces.n === 0 && (
          <p className="text-xs text-ink-950/40 dark:text-surface/40 mt-3">
            No survey responses in this period. Scores appear here as soon as responses arrive.
          </p>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: "ok" | "breach" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-950/50 dark:text-surface/50">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && (
        <p
          className="text-xs mt-0.5 text-ink-950/50 dark:text-surface/50"
          style={subTone ? { color: subTone === "breach" ? COLORS.breach : COLORS.ok } : undefined}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function PerfTable({
  rows,
  nameHeader,
  sub,
  empty,
}: {
  rows: PerfRow[];
  nameHeader: string;
  sub: (r: PerfRow) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-ink-950/40 dark:text-surface/40">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-950/50 dark:text-surface/50 text-left">
            <th className="font-medium pb-2">{nameHeader}</th>
            <th className="font-medium pb-2 text-right">Resolved</th>
            <th className="font-medium pb-2 text-right">Open</th>
            <th className="font-medium pb-2 text-right">Avg time</th>
            <th className="font-medium pb-2 text-right">SLA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-line-light dark:border-line-dark">
              <td className="py-2 pr-2">
                <div className="truncate max-w-[180px]">{r.name}</div>
                <div className="text-xs text-ink-950/40 dark:text-surface/40">{sub(r)}</div>
              </td>
              <td className="py-2 text-right font-mono">{r.resolved}</td>
              <td className="py-2 text-right font-mono">{r.open}</td>
              <td className="py-2 text-right font-mono">{fmtHours(r.avgResolutionHrs)}</td>
              <td className="py-2 text-right font-mono">{pct(r.slaPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
