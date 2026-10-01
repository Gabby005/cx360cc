/**
 * Date-range handling for Analytics (page + CSV export).
 *
 * Everything is UTC day-aligned so the trend buckets, the KPI window and the
 * export all agree. `end` is EXCLUSIVE (midnight after the last day), so a
 * query is always `createdAt >= start && createdAt < end`.
 */
export type RangeKey = "7" | "30" | "90" | "custom";

export type AnalyticsRange = {
  key: RangeKey;
  start: Date; // inclusive, UTC midnight
  end: Date; // exclusive, UTC midnight after the last day
  days: number;
  from: string; // YYYY-MM-DD of first day
  to: string; // YYYY-MM-DD of last day
  label: string;
};

export const MAX_RANGE_DAYS = 92;
const DAY = 86_400_000;

function parseDate(s?: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseRange(sp: { range?: string | null; from?: string | null; to?: string | null }): AnalyticsRange {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let key: RangeKey = "30";
  let start: Date;
  let lastDay: Date;

  const from = parseDate(sp.from);
  const to = parseDate(sp.to);

  if (sp.range === "custom" && from && to && to.getTime() >= from.getTime()) {
    key = "custom";
    start = from;
    lastDay = to;
    // Cap very long windows to the most recent MAX_RANGE_DAYS — keeps queries and charts sane.
    if ((lastDay.getTime() - start.getTime()) / DAY + 1 > MAX_RANGE_DAYS) {
      start = new Date(lastDay.getTime() - (MAX_RANGE_DAYS - 1) * DAY);
    }
  } else {
    const n = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
    key = String(n) as RangeKey;
    lastDay = todayStart;
    start = new Date(todayStart.getTime() - (n - 1) * DAY);
  }

  const end = new Date(lastDay.getTime() + DAY);
  const days = Math.round((end.getTime() - start.getTime()) / DAY);
  const fromStr = start.toISOString().slice(0, 10);
  const toStr = lastDay.toISOString().slice(0, 10);

  return {
    key,
    start,
    end,
    days,
    from: fromStr,
    to: toStr,
    label: key === "custom" ? `${fromStr} to ${toStr}` : `last ${days} days`,
  };
}
