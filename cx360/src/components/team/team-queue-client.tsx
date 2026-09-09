"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlaBadge } from "@/components/cases/sla-badge";
import type { SlaTarget } from "@/lib/sla";

type CaseRow = {
  id: string;
  caseNumber: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  slaPolicy: SlaTarget | null;
  customer: { firstName: string; lastName: string };
  assignedTo: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  PENDING_CUSTOMER: "Pending customer",
  ESCALATED: "Escalated",
};

const PRIORITY_PILL: Record<string, string> = {
  CRITICAL: "pill-breach",
  HIGH: "pill-warning",
  MEDIUM: "pill-neutral",
  LOW: "pill-neutral",
};

export function TeamQueueClient({ cases, agents }: { cases: CaseRow[]; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(cases);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  async function reassign(caseId: string, agentId: string) {
    setRows((prev) => prev.map((c) => (c.id === caseId ? { ...c, assignedTo: agents.find((a) => a.id === agentId) ?? null } : c)));
    await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId: agentId || null }),
    });
    startTransition(() => router.refresh());
  }

  const filtered = filterAgent === "all" ? rows : filterAgent === "unassigned" ? rows.filter((c) => !c.assignedTo) : rows.filter((c) => c.assignedTo?.id === filterAgent);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Team queue ({filtered.length})</h2>
        <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="input text-xs !py-1.5 w-48">
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface dark:bg-ink-800 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark">
            <tr>
              <th className="text-left font-medium px-5 py-3">Subject</th>
              <th className="text-left font-medium px-3 py-3">Customer</th>
              <th className="text-left font-medium px-3 py-3">Priority</th>
              <th className="text-left font-medium px-3 py-3">Status</th>
              <th className="text-left font-medium px-3 py-3">Assigned</th>
              <th className="text-left font-medium px-3 py-3">SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-line-light dark:border-line-dark last:border-0 hover:bg-surface dark:hover:bg-ink-800/60 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand block">
                    {c.subject}
                  </Link>
                  <span className="font-mono text-[10px] text-ink-950/40 dark:text-surface/40">{c.caseNumber}</span>
                </td>
                <td className="px-3 py-3 text-ink-950/70 dark:text-surface/70">
                  {c.customer.firstName} {c.customer.lastName}
                </td>
                <td className="px-3 py-3">
                  <span className={PRIORITY_PILL[c.priority] ?? "pill-neutral"}>{c.priority}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="pill-neutral">{STATUS_LABEL[c.status] ?? c.status}</span>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={c.assignedTo?.id ?? ""}
                    onChange={(e) => reassign(c.id, e.target.value)}
                    disabled={isPending}
                    className="input !py-1 text-xs w-36"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  {c.slaPolicy ? (
                    <SlaBadge
                      createdAt={new Date(c.createdAt)}
                      respondedAt={c.respondedAt ? new Date(c.respondedAt) : null}
                      resolvedAt={c.resolvedAt ? new Date(c.resolvedAt) : null}
                      policy={c.slaPolicy}
                    />
                  ) : (
                    <span className="text-xs text-ink-950/30 dark:text-surface/30">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-ink-950/50 dark:text-surface/50">
                  No cases match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
