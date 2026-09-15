"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CASE_STATUSES, STATUS_LABEL, STATUS_PILL, statusRequiresUnit } from "@/lib/case-status";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const PRIORITY_PILL: Record<string, string> = {
  CRITICAL: "pill-breach",
  HIGH: "pill-warning",
  MEDIUM: "pill-neutral",
  LOW: "pill-neutral",
};

export function CaseActions({
  caseId,
  status,
  priority,
  assignedToId,
  agents,
  currentUserId,
  canReassignOthers,
  escalatedUnitId,
  escalatedUnitName,
  units,
}: {
  caseId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  agents: { id: string; name: string }[];
  currentUserId: string;
  canReassignOthers: boolean;
  escalatedUnitId: string | null;
  escalatedUnitName: string | null;
  units: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(status);
  const [localPriority, setLocalPriority] = useState(priority);
  const [localAssignedToId, setLocalAssignedToId] = useState(assignedToId);
  const [localUnitId, setLocalUnitId] = useState(escalatedUnitId);
  const [localUnitName, setLocalUnitName] = useState(escalatedUnitName);

  // When a status change needs a unit and one isn't already on the case,
  // hold the status change here (don't patch yet) until a unit is picked.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pickedUnitId, setPickedUnitId] = useState("");

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
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  function handleStatusChange(next: string) {
    if (statusRequiresUnit(next) && !localUnitId) {
      // Needs a unit and doesn't have one yet — hold off, prompt for it.
      setPendingStatus(next);
      setPickedUnitId("");
      return;
    }
    setLocalStatus(next);
    patch({ status: next });
  }

  async function confirmPendingStatus() {
    if (!pendingStatus) return;
    if (!pickedUnitId) {
      setError("Select a unit to continue.");
      return;
    }
    const unit = units.find((u) => u.id === pickedUnitId);
    const ok = await patch({ status: pendingStatus, escalatedUnitId: pickedUnitId });
    if (ok) {
      setLocalStatus(pendingStatus);
      setLocalUnitId(pickedUnitId);
      setLocalUnitName(unit?.name ?? null);
      setPendingStatus(null);
    }
  }

  const assignedAgent = agents.find((a) => a.id === localAssignedToId);

  return (
    <div className="card p-4 space-y-4">
      <h2 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 tracking-wide">
        Ticket properties
      </h2>

      <Field label="Status" pillClass={STATUS_PILL[localStatus] ?? "pill-neutral"} pillLabel={STATUS_LABEL[localStatus] ?? localStatus}>
        <select
          value={pendingStatus ?? localStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="input"
        >
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>

      {pendingStatus && (
        <div className="rounded-lg border border-sla-warning/30 bg-sla-warning/5 p-3 space-y-2">
          <p className="text-xs text-ink-950/70 dark:text-surface/70">
            "{STATUS_LABEL[pendingStatus]}" requires selecting which unit this case is with.
          </p>
          <select value={pickedUnitId} onChange={(e) => setPickedUnitId(e.target.value)} className="input text-sm">
            <option value="">Select unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={confirmPendingStatus} className="btn-primary text-xs flex-1">
              Save
            </button>
            <button onClick={() => setPendingStatus(null)} className="btn-secondary text-xs flex-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      <Field label="Priority" pillClass={PRIORITY_PILL[localPriority] ?? "pill-neutral"} pillLabel={localPriority}>
        <select
          value={localPriority}
          onChange={(e) => {
            setLocalPriority(e.target.value);
            patch({ priority: e.target.value });
          }}
          className="input"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      {localUnitId ? (
        // Once a case is escalated to a unit, individual agent assignment
        // isn't shown — the case is with that department, not a person.
        <Field label="Escalated to">
          <p className="text-sm font-medium">{localUnitName ?? "Unit"}</p>
        </Field>
      ) : (
        <Field label="Assigned to">
          {canReassignOthers ? (
            <select
              value={localAssignedToId ?? ""}
              onChange={(e) => {
                setLocalAssignedToId(e.target.value || null);
                patch({ assignedToId: e.target.value || null });
              }}
              className="input"
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : localAssignedToId === currentUserId ? (
            <div className="flex items-center justify-between">
              <span className="text-sm">Assigned to you</span>
              <button
                onClick={() => {
                  setLocalAssignedToId(null);
                  patch({ assignedToId: null });
                }}
                className="text-xs text-brand hover:underline"
              >
                Unassign
              </button>
            </div>
          ) : localAssignedToId === null ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-950/50 dark:text-surface/50">Unassigned</span>
              <button
                onClick={() => {
                  setLocalAssignedToId(currentUserId);
                  patch({ assignedToId: currentUserId });
                }}
                className="text-xs text-brand hover:underline"
              >
                Assign to me
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-950/60 dark:text-surface/60">
              {assignedAgent?.name ?? "Another agent"}{" "}
              <span className="text-xs text-ink-950/40 dark:text-surface/40">
                — ask a supervisor to reassign
              </span>
            </p>
          )}
        </Field>
      )}

      {isPending && <p className="text-xs text-ink-950/40 dark:text-surface/40">Saving…</p>}
      {error && <p className="text-xs text-sla-breach">{error}</p>}
    </div>
  );
}

function Field({
  label,
  pillClass,
  pillLabel,
  children,
}: {
  label: string;
  pillClass?: string;
  pillLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-ink-950/60 dark:text-surface/60">{label}</span>
        {pillClass && pillLabel && <span className={pillClass}>{pillLabel}</span>}
      </div>
      {children}
    </div>
  );
}
