"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["NEW", "OPEN", "PENDING_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function CaseActions({
  caseId,
  status,
  priority,
  assignedToId,
  agents,
}: {
  caseId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Update failed" }));
      setError(msg);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="card p-4 flex flex-wrap items-center gap-4 text-sm">
      <Field label="Status">
        <select
          defaultValue={status}
          onChange={(e) => patch({ status: e.target.value })}
          className="px-2 py-1 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Priority">
        <select
          defaultValue={priority}
          onChange={(e) => patch({ priority: e.target.value })}
          className="px-2 py-1 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Assigned to">
        <select
          defaultValue={assignedToId ?? ""}
          onChange={(e) => patch({ assignedToId: e.target.value || null })}
          className="px-2 py-1 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      {isPending && <span className="text-xs text-ink-950/40 dark:text-surface/40">Saving…</span>}
      {error && <span className="text-xs text-sla-breach">{error}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-ink-950/50 dark:text-surface/50">{label}</span>
      {children}
    </label>
  );
}
