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
type DriverItem = { category: string; count: number };

export function AnalyticsCharts({
  volumeTrend,
  slaTrend,
  statusBreakdown,
  priorityBreakdown,
  topDrivers,
}: {
  volumeTrend: VolumePoint[];
  slaTrend: SlaPoint[];
  statusBreakdown: BreakdownItem[];
  priorityBreakdown: BreakdownItem[];
  topDrivers: { COMPLAINT: DriverItem[]; SERVICE_REQUEST: DriverItem[]; INQUIRY: DriverItem[] };
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">Case volume trend</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">Created vs resolved, last 14 days</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={volumeTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
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
          % of cases resolved within their SLA target, last 14 days
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={slaTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => `${v}%`} />
            <Line type="monotone" dataKey="complianceRate" stroke={COLORS.warning} strokeWidth={2} dot={{ r: 3 }} name="Compliance" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-4">Cases by status</h2>
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
          <h2 className="text-sm font-semibold mb-4">Open cases by priority</h2>
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

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-1">Top drivers</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">
          Most common category, last 30 days, by interaction type
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DriverList title="Complaints" items={topDrivers.COMPLAINT} accent={COLORS.breach} />
          <DriverList title="Requests" items={topDrivers.SERVICE_REQUEST} accent={COLORS.brand} />
          <DriverList title="Enquiries" items={topDrivers.INQUIRY} accent={COLORS.ok} />
        </div>
      </div>
    </div>
  );
}

function DriverList({ title, items, accent }: { title: string; items: DriverItem[]; accent: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-ink-950/40 dark:text-surface/40">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="truncate">{item.category}</span>
                <span className="font-mono text-ink-950/50 dark:text-surface/50">{item.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-950/5 dark:bg-surface/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(item.count / max) * 100}%`, backgroundColor: accent }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
