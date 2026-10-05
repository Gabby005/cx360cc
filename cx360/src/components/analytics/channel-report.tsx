"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHANNEL_COLOR, channelLabel } from "@/lib/channel-ui";
import { fmtMins } from "@/lib/channel-stats";
import { ChannelBadge } from "@/components/channels/channel-icon";

export type ChannelReportData = {
  rangeLabel: string;
  channels: { channel: string; inbound: number; outbound: number; answered: number; waiting: number; avgResponseMins: number | null; medianResponseMins: number | null; within1hPct: number | null; oldestWaitingMins: number | null }[];
  trend: Record<string, string | number>[]; // { date, WHATSAPP: 3, ... }
  trendChannels: string[];
  missed: { total: number; calledBack: number; followedUp: number; stillWaiting: number; avgCallbackMins: number | null };
  waitingCalls: { id: string; customerId: string; name: string; phone: string | null; waitingMins: number }[];
  truncated: boolean;
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "ok" }) {
  return (
    <div className="rounded-lg bg-surface dark:bg-ink-800 p-3">
      <div className={`text-xl font-semibold font-mono ${tone === "bad" ? "text-sla-breach" : tone === "ok" ? "text-sla-ok" : ""}`}>{value}</div>
      <div className="text-[11px] text-ink-950/50 dark:text-surface/50">{label}</div>
    </div>
  );
}

export function ChannelReport({ data }: { data: ChannelReportData }) {
  const rows = data.channels.filter((c) => c.inbound > 0 || c.outbound > 0);
  const m = data.missed;
  return (
    <section id="channels" className="mt-6 space-y-4 scroll-mt-4">
      <div>
        <h2 className="text-sm font-semibold">Channels</h2>
        <p className="text-xs text-ink-950/50 dark:text-surface/50">Customer messages and calls, for the {data.rangeLabel}.</p>
      </div>
      {data.truncated && <p className="text-xs text-amber-700 dark:text-amber-400">This range has a lot of activity, so figures are based on a sample. Narrow the date range for exact numbers.</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-3 tracking-wide">Volume per channel (customer messages and calls per day)</h3>
          {data.trend.every((d) => data.trendChannels.every((c) => !d[c])) ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50 py-10 text-center">No customer messages in this range.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B833" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => channelLabel(v)} />
                  {data.trendChannels.map((c) => <Bar key={c} dataKey={c} name={c} stackId="v" fill={CHANNEL_COLOR[c] ?? "#94A3B8"} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-3 tracking-wide">Missed calls — did anyone call back?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <Stat label="Missed" value={m.total} />
            <Stat label="Called back" value={m.calledBack} tone="ok" />
            <Stat label="Followed up another way" value={m.followedUp} />
            <Stat label="Nobody followed up" value={m.stillWaiting} tone={m.stillWaiting > 0 ? "bad" : "ok"} />
            <Stat label="Avg time to call back" value={fmtMins(m.avgCallbackMins)} />
          </div>
          {data.waitingCalls.length === 0 ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50">{m.total === 0 ? "No missed calls in this range." : "Nothing outstanding — every missed call was followed up."}</p>
          ) : (
            <ul className="divide-y divide-line-light dark:divide-line-dark max-h-44 overflow-y-auto">
              {data.waitingCalls.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <Link href={`/customers/${w.customerId}`} className="font-medium hover:text-brand truncate">{w.name}</Link>
                  <span className="text-xs text-ink-950/50 dark:text-surface/50 shrink-0">{w.phone ?? ""} · waiting {fmtMins(w.waitingMins)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 overflow-x-auto">
        <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-3 tracking-wide">Response time per channel</h3>
        {rows.length === 0 ? <p className="text-sm text-ink-950/50 dark:text-surface/50">No activity in this range.</p> : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-950/50 dark:text-surface/50">
                <th className="font-medium pb-2">Channel</th><th className="font-medium pb-2 text-right">Received</th><th className="font-medium pb-2 text-right">Sent</th>
                <th className="font-medium pb-2 text-right">Answered</th><th className="font-medium pb-2 text-right">Avg reply</th><th className="font-medium pb-2 text-right">Median</th>
                <th className="font-medium pb-2 text-right">Within 1 hour</th><th className="font-medium pb-2 text-right">Waiting now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-light dark:divide-line-dark">
              {rows.map((c) => (
                <tr key={c.channel}>
                  <td className="py-2"><span className="inline-flex items-center gap-2"><ChannelBadge channel={c.channel} size={24} />{channelLabel(c.channel)}</span></td>
                  <td className="py-2 text-right font-mono">{c.inbound}</td>
                  <td className="py-2 text-right font-mono">{c.outbound}</td>
                  <td className="py-2 text-right font-mono">{c.channel === "VOICE" ? "—" : c.answered}</td>
                  <td className="py-2 text-right font-mono">{c.channel === "VOICE" ? "—" : fmtMins(c.avgResponseMins)}</td>
                  <td className="py-2 text-right font-mono">{c.channel === "VOICE" ? "—" : fmtMins(c.medianResponseMins)}</td>
                  <td className="py-2 text-right font-mono">{c.channel === "VOICE" || c.within1hPct === null ? "—" : `${c.within1hPct}%`}</td>
                  <td className={`py-2 text-right font-mono ${c.waiting > 0 ? "text-sla-warning" : ""}`}>{c.channel === "VOICE" ? "—" : c.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mt-3">Reply time = from a customer&apos;s message to the first reply on the same channel. Phone calls are measured under missed calls instead.</p>
      </div>
    </section>
  );
}
