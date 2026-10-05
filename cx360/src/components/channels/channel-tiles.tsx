import Link from "next/link";
import { CHANNEL_COLOR, CHANNEL_ORDER, channelLabel } from "@/lib/channel-ui";
import { fmtMins, type ChannelRow } from "@/lib/channel-stats";
import { ChannelBadge } from "./channel-icon";

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 72, h = 24, step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One tile per channel: today's messages, how many are waiting, how quickly
 * they're answered, and a 7-day trend. Each tile opens the Inbox on that channel.
 * Empty channels stay visible (greyed) so people can see what is connected.
 */
export function ChannelTiles({
  channels,
  daily,
  todayKey,
  dayKeys,
  missedWaiting,
}: {
  channels: ChannelRow[];
  daily: Record<string, Record<string, number>>;
  todayKey: string;
  dayKeys: string[];
  missedWaiting: number;
}) {
  const byChannel = new Map(channels.map((c) => [c.channel, c]));
  const list = CHANNEL_ORDER.filter((c) => c !== "SOCIAL" || (byChannel.get(c)?.inbound ?? 0) > 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      {list.map((key) => {
        const c = byChannel.get(key);
        const color = CHANNEL_COLOR[key];
        const today = daily[todayKey]?.[key] ?? 0;
        const trend = dayKeys.map((d) => daily[d]?.[key] ?? 0);
        const idle = !c || c.inbound === 0;
        const waiting = key === "VOICE" ? missedWaiting : c?.waiting ?? 0;
        return (
          <Link key={key} href={`/inbox?channel=${key}`} className={`card p-3.5 hover:ring-1 hover:ring-brand/40 transition ${idle ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <ChannelBadge channel={key} size={30} />
              {waiting > 0 && <span className="pill-warning !py-0.5 !text-[10px]">{waiting} {key === "VOICE" ? "missed" : "waiting"}</span>}
            </div>
            <div className="text-xs text-ink-950/50 dark:text-surface/50">{channelLabel(key)}</div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-semibold font-mono leading-tight">{today}</div>
                <div className="text-[10px] text-ink-950/40 dark:text-surface/40">today</div>
              </div>
              <Spark values={trend} color={color} />
            </div>
            <div className="mt-2 pt-2 border-t border-line-light dark:border-line-dark text-[11px] text-ink-950/60 dark:text-surface/60 flex justify-between">
              <span>{key === "VOICE" ? "7-day calls" : "Avg reply"}</span>
              <span className="font-mono">{key === "VOICE" ? c?.inbound ?? 0 : fmtMins(c?.avgResponseMins ?? null)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
