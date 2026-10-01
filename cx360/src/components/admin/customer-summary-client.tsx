"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { SUGGESTED_FIELDS, MAX_SUMMARY_FIELDS, type SummaryField } from "@/lib/customer-summary";

export function CustomerSummaryClient({ initialFields }: { initialFields: SummaryField[] }) {
  const [fields, setFields] = useState<SummaryField[]>(initialFields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const has = (key: string) => fields.some((f) => f.key.toLowerCase() === key.toLowerCase());
  const edit = (i: number, patch: Partial<SummaryField>) => {
    setSaved(false);
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  };
  const move = (i: number, d: -1 | 1) => {
    setSaved(false);
    setFields((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const add = (f: SummaryField) => {
    if (fields.length >= MAX_SUMMARY_FIELDS || has(f.key)) return;
    setSaved(false);
    setFields((prev) => [...prev, f]);
  };

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/admin/customer-summary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs font-medium mb-2">Quick add</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_FIELDS.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={has(s.key)}
              onClick={() => add(s)}
              className="px-2.5 py-1 rounded-full text-xs border border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800 disabled:opacity-40"
            >
              + {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {fields.length === 0 && <p className="p-4 text-sm text-ink-950/50 dark:text-surface/50">No extra fields yet. Use Quick add or add your own below.</p>}
        {fields.map((f, i) => (
          <div key={i} className="p-3 flex items-center gap-2 flex-wrap">
            <input value={f.label} onChange={(e) => edit(i, { label: e.target.value })} className="input !py-1.5 text-sm w-44" placeholder="Label shown to agents" />
            <input value={f.key} onChange={(e) => edit(i, { key: e.target.value.replace(/\s/g, "") })} className="input !py-1.5 text-sm font-mono w-40" placeholder="field_key" title="The field name sent by core banking" />
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={f.sensitive} onChange={(e) => edit(i, { sensitive: e.target.checked })} />
              Mask (e.g. BVN)
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} className="p-1 rounded hover:bg-surface dark:hover:bg-ink-800" aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1 rounded hover:bg-surface dark:hover:bg-ink-800" aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => { setSaved(false); setFields((prev) => prev.filter((_, j) => j !== i)); }} className="p-1 rounded hover:bg-surface dark:hover:bg-ink-800 text-sla-breach" aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        <div className="p-3">
          <button type="button" onClick={() => add({ key: `field${fields.length + 1}`, label: "New field", sensitive: false })} disabled={fields.length >= MAX_SUMMARY_FIELDS} className="btn-secondary text-xs">
            <Plus size={13} /> Add your own
          </button>
        </div>
      </div>

      <div className="card p-4 text-xs text-ink-950/60 dark:text-surface/60 space-y-1">
        <p><strong>Where the values come from:</strong> each field's key is looked up in the customer's core-banking profile (e.g. <code className="font-mono">bvn</code>, <code className="font-mono">dob</code>, <code className="font-mono">address</code>).</p>
        <p>Until Flexcube is connected, send them as <code className="font-mono">customFields</code> through the customers API. A field with no value shows "—" so agents can see it is missing.</p>
        <p>Masked fields show only the last 4 characters until the agent uses the eye button on the card.</p>
      </div>

      {error && <p className="text-xs text-sla-breach">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-sla-ok">Saved — agents see this on their next customer lookup.</span>}
      </div>
    </div>
  );
}
