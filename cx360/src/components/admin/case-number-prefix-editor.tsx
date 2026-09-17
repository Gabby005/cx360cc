"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CaseNumberPrefixEditor({ initialPrefix }: { initialPrefix: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [prefix, setPrefix] = useState(initialPrefix);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/admin/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseNumberPrefix: prefix.toUpperCase() }),
    });
    setSaving(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to save" }));
      setError(msg);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="card p-4 flex items-center justify-between text-sm">
        <div>
          <span className="text-ink-950/50 dark:text-surface/50">Case number prefix: </span>
          <span className="font-mono font-medium">{initialPrefix}</span>
          <span className="text-ink-950/40 dark:text-surface/40">
            {" "}
            — e.g. {initialPrefix}/COM/E0006/000123
          </span>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs text-brand hover:underline">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <label className="block text-xs font-medium mb-1">Case number prefix</label>
      <div className="flex gap-2">
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          maxLength={10}
          className="input font-mono"
          placeholder="PTB"
        />
        <button onClick={save} disabled={saving} className="btn-primary text-sm shrink-0">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setEditing(false); setPrefix(initialPrefix); }} className="btn-secondary text-sm shrink-0">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-sla-breach mt-1.5">{error}</p>}
      <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-1.5">
        Changes only affect cases created after this point — existing case numbers don't change.
      </p>
    </div>
  );
}
