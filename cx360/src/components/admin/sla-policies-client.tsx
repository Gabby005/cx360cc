"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Policy = { id: string; priority: string; responseMinutes: number; resolutionMinutes: number; warningThresholdPct: number; escalationThresholdPct: number; businessHoursOnly: boolean };
type Unit = "minutes" | "hours" | "days";

const MULT: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };
const PILL: Record<string, string> = { CRITICAL: "pill-breach", HIGH: "pill-warning", MEDIUM: "pill-neutral", LOW: "pill-neutral" };

/** Show a stored number of minutes in the largest unit that divides it evenly. */
function split(min: number): { value: number; unit: Unit } {
  if (min % 1440 === 0) return { value: min / 1440, unit: "days" };
  if (min % 60 === 0) return { value: min / 60, unit: "hours" };
  return { value: min, unit: "minutes" };
}

function Duration({ label, value, unit, onChange }: { label: string; value: number; unit: Unit; onChange: (v: number, u: Unit) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <div className="flex gap-1.5">
        <input type="number" min={1} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(parseInt(e.target.value, 10), unit)} className="input !py-1.5 text-sm w-24" />
        <select value={unit} onChange={(e) => onChange(value, e.target.value as Unit)} className="input !py-1.5 text-sm w-28">
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
    </div>
  );
}

function Row({ policy, hasBusinessHours }: { policy: Policy; hasBusinessHours: boolean }) {
  const router = useRouter();
  const [resp, setResp] = useState(split(policy.responseMinutes));
  const [reso, setReso] = useState(split(policy.resolutionMinutes));
  const [warn, setWarn] = useState(policy.warningThresholdPct);
  const [esc, setEsc] = useState(policy.escalationThresholdPct);
  const [bhOnly, setBhOnly] = useState(policy.businessHoursOnly);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const body = {
    responseMinutes: resp.value * MULT[resp.unit],
    resolutionMinutes: reso.value * MULT[reso.unit],
    warningThresholdPct: warn,
    escalationThresholdPct: esc,
    businessHoursOnly: bhOnly,
  };
  const dirty =
    bhOnly !== policy.businessHoursOnly ||
    body.responseMinutes !== policy.responseMinutes ||
    body.resolutionMinutes !== policy.resolutionMinutes ||
    warn !== policy.warningThresholdPct ||
    esc !== policy.escalationThresholdPct;

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/admin/sla-policies/${policy.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
      return;
    }
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  }

  return (
    <div className="card p-4 space-y-3">
      <span className={PILL[policy.priority] ?? "pill-neutral"}>{policy.priority}</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Duration label="First response within" value={resp.value} unit={resp.unit} onChange={(value, unit) => setResp({ value, unit })} />
        <Duration label="Resolved within" value={reso.value} unit={reso.unit} onChange={(value, unit) => setReso({ value, unit })} />
        <div>
          <label className="block text-xs font-medium mb-1">Warn at (% of time used)</label>
          <input type="number" min={1} max={99} value={Number.isFinite(warn) ? warn : ""} onChange={(e) => setWarn(parseInt(e.target.value, 10))} className="input !py-1.5 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Escalate at (% of time used)</label>
          <input type="number" min={1} max={100} value={Number.isFinite(esc) ? esc : ""} onChange={(e) => setEsc(parseInt(e.target.value, 10))} className="input !py-1.5 text-sm w-24" />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={bhOnly} onChange={(e) => setBhOnly(e.target.checked)} className="mt-1" />
        <span>
          Count business hours only
          <span className="block text-xs text-ink-950/50 dark:text-surface/50">
            {bhOnly && !hasBusinessHours
              ? "Business hours aren't saved yet, so this clock still runs around the clock until you set them."
              : "Nights, weekends and public holidays don't count toward this deadline. Leave off for 24/7 priorities."}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || saving} className="btn-primary text-xs">
          {saving ? "Saving…" : "Save changes"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-sla-ok" : "text-sla-breach"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function SlaPoliciesClient({ initial, hasBusinessHours }: { initial: Policy[]; hasBusinessHours: boolean }) {
  if (initial.length === 0) return <div className="card p-6 text-sm text-ink-950/60 dark:text-surface/60">No SLA policies exist yet.</div>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-950/50 dark:text-surface/50">
        {hasBusinessHours ? "Business hours are set." : "Business hours aren't set yet."}{" "}
        <Link href="/admin/business-hours" className="text-brand hover:underline">
          Business hours & holidays →
        </Link>
      </p>
      {initial.map((p) => (
        <Row key={p.id} policy={p} hasBusinessHours={hasBusinessHours} />
      ))}
    </div>
  );
}
