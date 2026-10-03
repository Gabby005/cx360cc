/**
 * Business hours engine
 * ---------------------
 * Pure, dependency-free date maths so SLA clocks can run only while the bank
 * is open: Mon–Fri 08:00–17:00 (or whatever the admin sets), skipping weekends
 * and public holidays, in the bank's own time zone.
 *
 * Works for any IANA time zone (including ones with daylight saving) by asking
 * Intl for the zone's UTC offset at the moment in question, rather than
 * assuming a fixed offset.
 *
 * If a tenant has not configured business hours, callers pass `null` and the
 * clock simply runs around the clock, exactly as before.
 */

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABEL: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type DaySchedule = { open: string; close: string } | null; // "HH:mm" in the bank's time zone; null = closed all day
export type Holiday = { date: string; name: string }; // date = YYYY-MM-DD

export type BusinessHours = {
  timezone: string;
  days: Record<DayKey, DaySchedule>;
  holidays: Holiday[];
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "Africa/Lagos",
  days: {
    mon: { open: "08:00", close: "17:00" },
    tue: { open: "08:00", close: "17:00" },
    wed: { open: "08:00", close: "17:00" },
    thu: { open: "08:00", close: "17:00" },
    fri: { open: "08:00", close: "17:00" },
    sat: null,
    sun: null,
  },
  holidays: [],
};

const WEEKDAY_BY_UTC_INDEX: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MINUTE = 60_000;
const MAX_DAYS = 900; // never loop forever on a bad schedule

/** Reads whatever is stored in the database and returns a usable schedule, or null if none is set / it's unusable. */
export function parseBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BusinessHours>;
  if (typeof r.timezone !== "string" || !r.days || typeof r.days !== "object") return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: r.timezone });
  } catch {
    return null;
  }
  const days = {} as Record<DayKey, DaySchedule>;
  let anyOpen = false;
  for (const k of DAY_KEYS) {
    const d = (r.days as Record<string, unknown>)[k] as DaySchedule | undefined;
    if (d && typeof d.open === "string" && typeof d.close === "string" && toMinutes(d.open) < toMinutes(d.close)) {
      days[k] = { open: d.open, close: d.close };
      anyOpen = true;
    } else {
      days[k] = null;
    }
  }
  if (!anyOpen) return null; // "never open" would make every SLA infinite — treat as not configured
  const holidays = Array.isArray(r.holidays)
    ? r.holidays.filter((h): h is Holiday => !!h && typeof h.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && typeof h.name === "string")
    : [];
  return { timezone: r.timezone, days, holidays };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ---- time-zone helpers ------------------------------------------------------

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function partsInTz(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = parseInt(p.value, 10);
  return { y: o.year, m: o.month, d: o.day, hh: o.hour === 24 ? 0 : o.hour, mm: o.minute, ss: o.second };
}

/** The zone's offset from UTC (ms) at an instant. */
function offsetMs(ms: number, tz: string) {
  const p = partsInTz(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in a zone → UTC milliseconds. */
export function zonedTimeToUtcMs(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = offsetMs(guess, tz);
  let t = guess - off;
  const off2 = offsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

type LocalDate = { y: number; m: number; d: number };
const localDate = (ms: number, tz: string): LocalDate => {
  const p = partsInTz(ms, tz);
  return { y: p.y, m: p.m, d: p.d };
};
const nextDay = ({ y, m, d }: LocalDate): LocalDate => {
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() };
};
const dateKey = ({ y, m, d }: LocalDate) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The open window (UTC ms) for one calendar day in the bank's zone, or null if closed (weekend / holiday). */
function windowFor(date: LocalDate, bh: BusinessHours, holidays: Set<string>) {
  if (holidays.has(dateKey(date))) return null;
  const weekday = WEEKDAY_BY_UTC_INDEX[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
  const sched = bh.days[weekday];
  if (!sched) return null;
  const [oh, om] = sched.open.split(":").map(Number);
  const [ch, cm] = sched.close.split(":").map(Number);
  return {
    start: zonedTimeToUtcMs(date.y, date.m, date.d, oh, om, bh.timezone),
    end: zonedTimeToUtcMs(date.y, date.m, date.d, ch, cm, bh.timezone), // "24:00" rolls to midnight of the next day
  };
}

const holidaySet = (bh: BusinessHours) => new Set(bh.holidays.map((h) => h.date));

// ---- public API -------------------------------------------------------------

/** The moment that is `minutes` of OPEN time after `start`. */
export function addBusinessMinutes(start: Date, minutes: number, bh: BusinessHours): Date {
  const holidays = holidaySet(bh);
  const startMs = start.getTime();
  let remaining = minutes;
  let date = localDate(startMs, bh.timezone);

  for (let i = 0; i < MAX_DAYS; i++) {
    const w = windowFor(date, bh, holidays);
    if (w) {
      const from = Math.max(startMs, w.start);
      if (from < w.end) {
        const available = (w.end - from) / MINUTE;
        if (remaining <= available) return new Date(from + remaining * MINUTE);
        remaining -= available;
      }
    }
    date = nextDay(date);
  }
  return new Date(startMs + minutes * MINUTE); // no usable working time found — fall back to plain elapsed time
}

/** Minutes of OPEN time between two moments. */
export function businessMinutesBetween(a: Date, b: Date, bh: BusinessHours): number {
  const aMs = a.getTime();
  const bMs = b.getTime();
  if (bMs <= aMs) return 0;
  const holidays = holidaySet(bh);
  const last = dateKey(localDate(bMs, bh.timezone));
  let date = localDate(aMs, bh.timezone);
  let total = 0;

  for (let i = 0; i < MAX_DAYS; i++) {
    const w = windowFor(date, bh, holidays);
    if (w) {
      const overlap = Math.min(bMs, w.end) - Math.max(aMs, w.start);
      if (overlap > 0) total += overlap;
    }
    if (dateKey(date) === last) break;
    date = nextDay(date);
  }
  return Math.round(total / MINUTE);
}

/** Is the bank open at this moment? */
export function isOpenAt(at: Date, bh: BusinessHours): boolean {
  const w = windowFor(localDate(at.getTime(), bh.timezone), bh, holidaySet(bh));
  return !!w && at.getTime() >= w.start && at.getTime() < w.end;
}

/** Public holidays that fall on the same date every year (Nigeria). Moveable ones (Eid, Easter, Maulud…) are announced yearly and must be added by hand. */
export const FIXED_NIGERIAN_HOLIDAYS: { md: string; name: string }[] = [
  { md: "01-01", name: "New Year's Day" },
  { md: "05-01", name: "Workers' Day" },
  { md: "06-12", name: "Democracy Day" },
  { md: "10-01", name: "Independence Day" },
  { md: "12-25", name: "Christmas Day" },
  { md: "12-26", name: "Boxing Day" },
];
