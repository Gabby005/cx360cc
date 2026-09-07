"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";

const TRIGGERS = [
  "case.created",
  "case.assigned",
  "case.resolved",
  "customer.created",
  "sla.warning",
  "sla.breached",
  "complaint.created",
  "feedback.received",
];

const OPERATORS = ["equals", "not_equals", "gt", "gte", "lt", "lte", "contains", "in"];
const ACTION_TYPES = ["set_status", "set_priority", "assign_case", "add_case_note", "notify"] as const;

type ConditionRow = { field: string; operator: string; value: string };
type ActionRow = { type: (typeof ACTION_TYPES)[number]; params: Record<string, string> };

type RunLog = { id: string; matched: boolean; error: string | null; createdAt: string; actionsRun: { type: string; result: string }[] | null };
type Rule = {
  id: string;
  name: string;
  triggerType: string;
  enabled: boolean;
  conditions: ConditionRow[];
  actions: ActionRow[];
  runs: RunLog[];
};

export function WorkflowsClient({ rules, canEdit }: { rules: Rule[]; canEdit: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">Workflow automation</h1>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary text-xs"
          >
            <Plus size={14} /> New rule
          </button>
        )}
      </div>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Rules run every time a matching event is dispatched (see{" "}
        <code className="kbd">/api/cron/dispatch-events</code>). Each row below shows its most recent runs, so you
        can see exactly what fired and why.
      </p>

      {showForm && <RuleForm onCreated={() => { setShowForm(false); router.refresh(); }} />}

      <ul className="space-y-3 mt-4">
        {rules.map((r) => (
          <RuleCard key={r.id} rule={r} canEdit={canEdit} />
        ))}
        {rules.length === 0 && !showForm && (
          <li className="text-sm text-ink-950/50 dark:text-surface/50 py-8 text-center card">
            No workflow rules yet. {canEdit && 'Click "New rule" to create one.'}
          </li>
        )}
      </ul>
    </div>
  );
}

function RuleCard({ rule, canEdit }: { rule: Rule; canEdit: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    await fetch(`/api/workflows/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <li className="card">
      <div className="p-4 flex items-center justify-between">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-left min-w-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <div className="min-w-0">
            <div className="font-medium text-sm">{rule.name}</div>
            <div className="text-xs text-ink-950/50 dark:text-surface/50 font-mono">
              on {rule.triggerType} · {rule.conditions.length} condition(s) · {rule.actions.length} action(s)
            </div>
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {rule.runs.length > 0 && (
            <span className="text-xs text-ink-950/40 dark:text-surface/40">
              last run {rule.runs[0].matched ? "matched" : "no match"}
            </span>
          )}
          {canEdit && (
            <button
              onClick={toggle}
              disabled={isPending}
              className={rule.enabled ? "pill-ok" : "pill-neutral"}
            >
              {rule.enabled ? "Enabled" : "Disabled"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line-light dark:border-line-dark p-4 text-xs space-y-3">
          <div>
            <div className="text-ink-950/50 dark:text-surface/50 mb-1 font-medium">Conditions</div>
            {rule.conditions.length === 0 ? (
              <p className="text-ink-950/40 dark:text-surface/40">None — always matches when triggered.</p>
            ) : (
              <ul className="space-y-0.5 font-mono">
                {rule.conditions.map((c, i) => (
                  <li key={i}>
                    {c.field} {c.operator} {JSON.stringify(c.value)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-ink-950/50 dark:text-surface/50 mb-1 font-medium">Actions</div>
            <ul className="space-y-0.5 font-mono">
              {rule.actions.map((a, i) => (
                <li key={i}>
                  {a.type}({JSON.stringify(a.params)})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-ink-950/50 dark:text-surface/50 mb-1 font-medium">Recent runs</div>
            {rule.runs.length === 0 ? (
              <p className="text-ink-950/40 dark:text-surface/40">No events have triggered this rule yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {rule.runs.map((run) => (
                  <li key={run.id} className="flex flex-col gap-0.5">
                    <span className={run.matched ? "text-sla-ok" : "text-ink-950/40 dark:text-surface/40"}>
                      {new Date(run.createdAt).toLocaleString()} — {run.matched ? "matched" : "no match"}
                      {run.error ? ` — error: ${run.error}` : ""}
                    </span>
                    {run.actionsRun?.map((a, i) => (
                      <span key={i} className="pl-3 text-ink-950/60 dark:text-surface/60 font-mono">
                        → {a.type}: {a.result}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function RuleForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState(TRIGGERS[0]);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([{ type: "notify", params: { channel: "slack", target: "" } }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addCondition() {
    setConditions((c) => [...c, { field: "priority", operator: "equals", value: "" }]);
  }
  function addAction() {
    setActions((a) => [...a, { type: "notify", params: { channel: "slack", target: "" } }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (actions.length === 0) return setError("At least one action is required.");

    setSaving(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        triggerType,
        conditions: conditions
          .filter((c) => c.field && c.value !== "")
          .map((c) => ({ ...c, value: isNumeric(c.value) ? Number(c.value) : c.value })),
        actions,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create rule" }));
      setError(msg);
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-4 space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1">Rule name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Auto-escalate CRITICAL complaints"
          className="w-full px-2 py-1.5 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Trigger event</label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
          className="px-2 py-1.5 rounded border border-line-light dark:border-line-dark bg-surface dark:bg-ink-900 text-sm"
        >
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium">Conditions (all must match — leave empty to always run)</label>
          <button type="button" onClick={addCondition} className="text-xs text-brand hover:underline">
            + Add condition
          </button>
        </div>
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={c.field}
                onChange={(e) => updateAt(setConditions, i, { field: e.target.value })}
                placeholder="field, e.g. priority"
                className="input flex-1 !py-1.5 text-xs"
              />
              <select
                value={c.operator}
                onChange={(e) => updateAt(setConditions, i, { operator: e.target.value })}
                className="input !py-1.5 text-xs"
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                value={c.value}
                onChange={(e) => updateAt(setConditions, i, { value: e.target.value })}
                placeholder="value, e.g. CRITICAL"
                className="input flex-1 !py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-xs text-sla-breach px-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium">Actions</label>
          <button type="button" onClick={addAction} className="text-xs text-brand hover:underline">
            + Add action
          </button>
        </div>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <ActionRowEditor
              key={i}
              action={a}
              onChange={(next) => setActions((prev) => prev.map((p, idx) => (idx === i ? next : p)))}
              onRemove={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-sla-breach">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="btn-primary text-sm"
      >
        {saving ? "Creating…" : "Create rule"}
      </button>
    </form>
  );
}

function ActionRowEditor({
  action,
  onChange,
  onRemove,
}: {
  action: ActionRow;
  onChange: (a: ActionRow) => void;
  onRemove: () => void;
}) {
  function setType(type: ActionRow["type"]) {
    const defaults: Record<ActionRow["type"], Record<string, string>> = {
      set_status: { status: "ESCALATED" },
      set_priority: { priority: "HIGH" },
      assign_case: { strategy: "least_open_cases" },
      add_case_note: { body: "", internal: "true" },
      notify: { channel: "slack", target: "" },
    };
    onChange({ type, params: defaults[type] });
  }

  return (
    <div className="flex gap-2 items-start">
      <select
        value={action.type}
        onChange={(e) => setType(e.target.value as ActionRow["type"])}
        className="input !py-1.5 text-xs shrink-0"
      >
        {ACTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <div className="flex-1 flex gap-2 flex-wrap">
        {Object.entries(action.params).map(([key, value]) => (
          <input
            key={key}
            value={value}
            onChange={(e) => onChange({ ...action, params: { ...action.params, [key]: e.target.value } })}
            placeholder={key}
            className="input !py-1.5 text-xs w-32"
          />
        ))}
      </div>

      <button type="button" onClick={onRemove} className="text-xs text-sla-breach px-1 shrink-0">
        Remove
      </button>
    </div>
  );
}

function updateAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, patch: Partial<T>) {
  setter((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
}

function isNumeric(v: string) {
  return v.trim() !== "" && !Number.isNaN(Number(v));
}
