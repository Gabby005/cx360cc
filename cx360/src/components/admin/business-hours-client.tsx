"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  DAY_KEYS,
  DAY_LABEL,
  FIXED_NIGERIAN_HOLIDAYS,
  addBusinessMinutes,
  toMinutes,
  zonedTimeToUtcMs,
  type BusinessHours,
  type DayKey,
  type DaySchedule,
} from "@/lib/business-hours";

export function BusinessHoursClient({ initial, configured, zones }: { initial: BusinessHours; configured: boolean; zones: string[] }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initial.timezone);
  const [days, setDays] = useState<Record<DayKey, DaySchedule>>(initial.days);
  const [holidays, setHolidays] = useState(initial.holidays);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isConfigured, setIsConfigured] = useState(configured);

  // "Try it" preview
  const [tryStart, setTryStart] = useState("");
  const [tryHours, setTryHours] = useState(4);

  const dayErrors = DAY_KEYS.filter((k) => days[k] && toMinutes(days[k]!.open) >= toMinutes(days[k]!.close));
  const anyOpen = DAY_KEYS.some((k) => days[k]);
  const valid = anyOpen && dayErrors.length === 0;
  const current: BusinessHours = useMemo(() => ({ timezone, days, holidays }), [timezone, days, holidays]);

  function setDay(k: DayKey, patch: Partial<NonNullable<DaySchedule>> | null) {
    setDays((prev) => ({ ...prev, [k]: patch === null ? null : { ...(prev[k] ?? { open: "08:00", close: "17:00" }), ...patch } }));
    setMsg(null);
  }

  function addHoliday() {
    if (!newDate || !newName.trim()) return;
    if (holidays.some((h) => h.date === newDate)) {
      setMsg({ ok: false, text: "That date is already in the list." });
      return;
    }
    setHolidays((prev) => [...prev, { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewName("");
    setMsg(null);
  }

  function addFixed() {
    const have = new Set(holidays.map((h) => h.date));
    const add = FIXED_NIGERIAN_HOLIDAYS.map((h) => ({ date: `${year}-${h.md}`, name: h.name })).filter((h) => !have.has(h.date));
    setHolidays((prev) => [...prev, ...add].sort((a, b) => a.date.localeCompare(b.date)));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/business-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone, days, holidays }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
      return;
    }
    setIsConfigured(true);
    setMsg({ ok: true, text: "Saved. New tickets and open-ticket countdowns now use these hours." });
    router.refresh();
  }

  // Preview: when would a ticket logged at `tryStart` with an N-hour business-hours target be due?
  const preview = useMemo(() => {
    if (!tryStart || !valid || !(tryHours > 0)) return null;
    const [d, t] = tryStart.split("T");
    if (!d || !t) return null;
    const [y, m, dd] = d.split("-").map(Number);
    const [hh, mm] = t.split(":").map(Number);
    try {
      const start = new Date(zonedTimeToUtcMs(y, m, dd, hh, mm, timezone));
      const due = addBusinessMinutes(start, tryHours * 60, current);
      const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      return fmt.format(due);
    } catch {
      return null;
    }
  }, [tryStart, tryHours, valid, timezone, current]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <div className="space-y-6">
        {!isConfigured && (
          <div className="rounded-lg bg-sla-warning/10 border border-sla-warning/30 p-3 text-sm">
            Business hours haven&apos;t been saved yet, so every SLA clock is still running around the clock. The hours below are a suggested starting point —
            adjust them and click <strong>Save</strong>.
          </div>
        )}

        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3">Weekly opening hours</h2>
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1">Time zone</label>
            <select value={timezone} onChange={(e) => { setTimezone(e.target.value); setMsg(null); }} className="input !py-1.5 text-sm w-72">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-line-light dark:divide-line-dark">
            {DAY_KEYS.map((k) => {
              const d = days[k];
              const bad = dayErrors.includes(k);
              return (
                <div key={k} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 w-36 text-sm">
                    <input type="checkbox" checked={!!d} onChange={(e) => setDay(k, e.target.checked ? {} : null)} />
                    {DAY_LABEL[k]}
                  </label>
                  {d ? (
                    <>
                      <input type="time" value={d.open} onChange={(e) => setDay(k, { open: e.target.value })} className="input !py-1 text-sm w-32" />
                      <span className="text-xs text-ink-950/50 dark:text-surface/50">to</span>
                      <input type="time" value={d.close} onChange={(e) => setDay(k, { close: e.target.value })} className="input !py-1 text-sm w-32" />
                      {bad && <span className="text-xs text-sla-breach">Opening must be before closing</span>}
                    </>
                  ) : (
                    <span className="text-xs text-ink-950/40 dark:text-surface/40">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          {!anyOpen && <p className="text-xs text-sla-breach mt-2">At least one day must be open.</p>}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-1">Public holidays</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-4">The bank is treated as closed all day on these dates.</p>

          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input !py-1.5 text-sm w-40" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium mb-1">Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Eid-el-Fitr" className="input !py-1.5 text-sm" maxLength={60} />
            </div>
            <button type="button" onClick={addHoliday} disabled={!newDate || !newName.trim()} className="btn-secondary text-xs">
              Add
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
            <span className="text-ink-950/50 dark:text-surface/50">Quick add the fixed-date national holidays for</span>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="input !py-1 text-xs w-24">
              {[0, 1, 2].map((o) => {
                const y = new Date().getFullYear() + o;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
            <button type="button" onClick={addFixed} className="btn-secondary text-xs">
              Add them
            </button>
          </div>
          <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mb-3">
            That covers New Year, Workers&apos; Day, Democracy Day, Independence Day, Christmas and Boxing Day. Holidays that move each year (Good Friday, Easter
            Monday, Eid, Maulud) are announced by government — add those by hand.
          </p>

          {holidays.length === 0 ? (
            <p className="text-sm text-ink-950/40 dark:text-surface/40">No holidays added.</p>
          ) : (
            <ul className="divide-y divide-line-light dark:divide-line-dark max-h-72 overflow-y-auto">
              {holidays.map((h) => (
                <li key={h.date} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-mono text-xs text-ink-950/60 dark:text-surface/60 mr-3">{h.date}</span>
                    {h.name}
                  </span>
                  <button type="button" onClick={() => setHolidays((p) => p.filter((x) => x.date !== h.date))} className="text-ink-950/40 hover:text-sla-breach" aria-label={`Remove ${h.name}`}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || !valid} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save business hours"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
        </div>
      </div>

      <aside className="card p-5 xl:sticky xl:top-0 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Try it</h2>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-1">
            See when a ticket would fall due under the hours on the left (even before you save).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Ticket logged at (bank time)</label>
          <input type="datetime-local" value={tryStart} onChange={(e) => setTryStart(e.target.value)} className="input !py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Target (business hours)</label>
          <input type="number" min={1} max={200} value={Number.isFinite(tryHours) ? tryHours : ""} onChange={(e) => setTryHours(parseFloat(e.target.value))} className="input !py-1.5 text-sm w-28" />
        </div>
        <div className="rounded-lg bg-surface dark:bg-ink-800 p-3 text-sm min-h-[56px]">
          {preview ? (
            <>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">Due</div>
              <div className="font-medium">{preview}</div>
            </>
          ) : (
            <span className="text-xs text-ink-950/40 dark:text-surface/40">Pick a date and time above.</span>
          )}
        </div>
      </aside>
    </div>
  );
}
