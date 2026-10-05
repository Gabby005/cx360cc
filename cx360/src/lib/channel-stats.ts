import { CHANNEL_ORDER } from "./channel-ui";

/**
 * Channel reports: how much came in on each channel, how fast we answered,
 * and which missed calls nobody followed up. Pure maths lives in
 * computeChannelStats (easy to test); getChannelStats just loads the rows.
 */

export type StatRow = {
  id: string;
  customerId: string;
  channel: string;
  direction: string; // inbound | outbound
  status: string; // NEW | IN_PROGRESS | LINKED | CLOSED
  createdAt: Date;
  summary: string | null;
};

export type ChannelRow = {
  channel: string;
  inbound: number;
  outbound: number;
  answered: number; // inbound messages that got a reply
  waiting: number; // inbound messages with no reply yet and still open
  oldestWaitingMins: number | null;
  avgResponseMins: number | null;
  medianResponseMins: number | null;
  within1hPct: number | null; // share of answered messages replied to within an hour
};

export type MissedCall = { id: string; customerId: string; at: Date; waitingMins: number };

export type ChannelStats = {
  channels: ChannelRow[];
  totals: { inbound: number; outbound: number; waiting: number; avgResponseMins: number | null };
  missed: {
    total: number;
    calledBack: number; // a later outgoing call to the same customer
    followedUp: number; // handled another way (reply on another channel, or marked handled in the Inbox)
    stillWaiting: number;
    avgCallbackMins: number | null;
    waitingList: MissedCall[]; // oldest first
  };
  /** Inbound volume per day per channel, keyed YYYY-MM-DD. */
  daily: Record<string, Record<string, number>>;
};

const MIN = 60_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const isMissedCall = (r: Pick<StatRow, "channel" | "direction" | "summary">) => r.channel === "VOICE" && r.direction === "inbound" && /MISSED/i.test(r.summary ?? "");

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeChannelStats(rows: StatRow[], start: Date, end: Date, now: Date = new Date()): ChannelStats {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const inWindow = (d: Date) => d >= start && d < end;

  const acc = new Map<string, { inbound: number; outbound: number; answered: number; waiting: number; oldest: number | null; resp: number[] }>();
  const get = (c: string) => {
    let a = acc.get(c);
    if (!a) acc.set(c, (a = { inbound: 0, outbound: 0, answered: 0, waiting: 0, oldest: null, resp: [] }));
    return a;
  };

  const daily: ChannelStats["daily"] = {};
  const threads = new Map<string, StatRow[]>(); // customer + channel
  for (const r of sorted) {
    const k = `${r.customerId}|${r.channel}`;
    (threads.get(k) ?? threads.set(k, []).get(k)!).push(r);
  }

  for (const r of sorted) {
    if (!inWindow(r.createdAt)) continue;
    const a = get(r.channel);
    if (r.direction === "outbound") { a.outbound++; continue; }
    a.inbound++;
    const day = (daily[dayKey(r.createdAt)] ??= {});
    day[r.channel] = (day[r.channel] ?? 0) + 1;
  }

  // Response time: for each burst of customer messages, time until the first reply on that channel.
  // Phone calls are covered by the missed-call report instead.
  for (const list of threads.values()) {
    if (list[0].channel === "VOICE") continue;
    let burstStart: StatRow | null = null;
    for (const r of list) {
      if (r.direction === "inbound") {
        if (!burstStart) burstStart = r;
      } else if (burstStart) {
        if (inWindow(burstStart.createdAt)) {
          const a = get(burstStart.channel);
          a.answered++;
          a.resp.push((r.createdAt.getTime() - burstStart.createdAt.getTime()) / MIN);
        }
        burstStart = null;
      }
    }
    // Still unanswered, and not already closed/linked by an agent.
    if (burstStart && inWindow(burstStart.createdAt) && (burstStart.status === "NEW" || burstStart.status === "IN_PROGRESS")) {
      const a = get(burstStart.channel);
      a.waiting++;
      const age = (now.getTime() - burstStart.createdAt.getTime()) / MIN;
      a.oldest = a.oldest === null ? age : Math.max(a.oldest, age);
    }
  }

  const channels: ChannelRow[] = [...new Set([...CHANNEL_ORDER, ...acc.keys()])].map((c) => {
    const a = acc.get(c) ?? { inbound: 0, outbound: 0, answered: 0, waiting: 0, oldest: null, resp: [] };
    const med = median(a.resp);
    return {
      channel: c,
      inbound: a.inbound,
      outbound: a.outbound,
      answered: a.answered,
      waiting: a.waiting,
      oldestWaitingMins: a.oldest === null ? null : Math.round(a.oldest),
      avgResponseMins: a.resp.length ? round1(a.resp.reduce((x, y) => x + y, 0) / a.resp.length) : null,
      medianResponseMins: med === null ? null : round1(med),
      within1hPct: a.resp.length ? Math.round((a.resp.filter((m) => m <= 60).length / a.resp.length) * 100) : null,
    };
  });

  // Missed calls
  const byCustomer = new Map<string, StatRow[]>();
  for (const r of sorted) (byCustomer.get(r.customerId) ?? byCustomer.set(r.customerId, []).get(r.customerId)!).push(r);

  let calledBack = 0, followedUp = 0;
  const cb: number[] = [];
  const waitingList: MissedCall[] = [];
  const missedRows = sorted.filter((r) => inWindow(r.createdAt) && isMissedCall(r));
  for (const m of missedRows) {
    const later = (byCustomer.get(m.customerId) ?? []).filter((r) => r.createdAt > m.createdAt && r.direction === "outbound");
    const call = later.find((r) => r.channel === "VOICE");
    if (call) {
      calledBack++;
      cb.push((call.createdAt.getTime() - m.createdAt.getTime()) / MIN);
    } else if (later.length > 0 || m.status !== "NEW") {
      followedUp++;
    } else {
      waitingList.push({ id: m.id, customerId: m.customerId, at: m.createdAt, waitingMins: Math.round((now.getTime() - m.createdAt.getTime()) / MIN) });
    }
  }
  waitingList.sort((a, b) => a.at.getTime() - b.at.getTime());

  const allResp = channels.flatMap((c) => (c.avgResponseMins === null ? [] : Array(c.answered).fill(c.avgResponseMins)));
  return {
    channels,
    totals: {
      inbound: channels.reduce((n, c) => n + c.inbound, 0),
      outbound: channels.reduce((n, c) => n + c.outbound, 0),
      waiting: channels.reduce((n, c) => n + c.waiting, 0),
      avgResponseMins: allResp.length ? round1(allResp.reduce((x, y) => x + y, 0) / allResp.length) : null,
    },
    missed: {
      total: missedRows.length,
      calledBack,
      followedUp,
      stillWaiting: waitingList.length,
      avgCallbackMins: cb.length ? round1(cb.reduce((x, y) => x + y, 0) / cb.length) : null,
      waitingList,
    },
    daily,
  };
}

const ROW_LIMIT = 30_000;

/** Loads interactions from `start` onward (replies after the window still count) and computes the stats for [start, end). */
export async function getChannelStats(tenantId: string, start: Date, end: Date): Promise<ChannelStats & { truncated: boolean }> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.interaction.findMany({
    where: { tenantId, createdAt: { gte: start } },
    select: { id: true, customerId: true, channel: true, direction: true, status: true, createdAt: true, summary: true },
    orderBy: { createdAt: "asc" },
    take: ROW_LIMIT,
  });
  return { ...computeChannelStats(rows, start, end), truncated: rows.length >= ROW_LIMIT };
}

/** "12m", "3h 20m", "2d" — for waits and response times. */
export function fmtMins(m: number | null): string {
  if (m === null) return "—";
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`.replace(" 0m", "");
  return `${Math.round(m / 144) / 10}d`;
}
