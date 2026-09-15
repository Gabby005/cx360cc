"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SlaBadge } from "@/components/cases/sla-badge";
import { STATUS_LABEL, STATUS_PILL } from "@/lib/case-status";
import { Download } from "lucide-react";
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
  closedAt: string | null;
  slaPolicy: SlaTarget | null;
  customer: { firstName: string; lastName: string; email: string | null };
  assignedTo: { name: string } | null;
};

function PriorityPill({ priority }: { priority: string }) {
  const cls = priority === "CRITICAL" ? "pill-breach" : priority === "HIGH" ? "pill-warning" : "pill-neutral";
  return <span className={cls}>{priority}</span>;
}

function toCsvValue(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function downloadCsv(rows: CaseRow[]) {
  const headers = ["Case Number", "Subject", "Customer", "Email", "Priority", "Status", "Assigned To", "Created", "Resolved", "Closed"];
  const lines = [
    headers.join(","),
    ...rows.map((c) =>
      [
        c.caseNumber,
        c.subject,
        `${c.customer.firstName} ${c.customer.lastName}`,
        c.customer.email ?? "",
        c.priority,
        STATUS_LABEL[c.status] ?? c.status,
        c.assignedTo?.name ?? "Unassigned",
        new Date(c.createdAt).toLocaleString(),
        c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "",
        c.closedAt ? new Date(c.closedAt).toLocaleString() : "",
      ]
        .map((v) => toCsvValue(String(v)))
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cx360-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CasesTable({ cases }: { cases: CaseRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = cases.length > 0 && selected.size === cases.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(cases.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const exportRows = useMemo(
    () => (selected.size > 0 ? cases.filter((c) => selected.has(c.id)) : cases),
    [cases, selected]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-ink-950/50 dark:text-surface/50">
          {selected.size > 0 ? `${selected.size} selected` : `${cases.length} in view`}
        </p>
        <button onClick={() => downloadCsv(exportRows)} disabled={cases.length === 0} className="btn-secondary text-xs">
          <Download size={13} /> Export CSV {selected.size > 0 ? `(${selected.size})` : "(all in view)"}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface dark:bg-ink-800 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="rounded accent-brand"
                />
              </th>
              <th className="text-left font-medium px-2 py-3">Subject</th>
              <th className="text-left font-medium px-3 py-3">Customer</th>
              <th className="text-left font-medium px-3 py-3">Priority</th>
              <th className="text-left font-medium px-3 py-3">Status</th>
              <th className="text-left font-medium px-3 py-3">Assigned</th>
              <th className="text-left font-medium px-3 py-3">SLA</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="border-b border-line-light dark:border-line-dark last:border-0 hover:bg-surface dark:hover:bg-ink-800/60 transition-colors"
              >
                <td className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="rounded accent-brand"
                  />
                </td>
                <td className="px-2 py-3.5">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand block">
                    {c.subject}
                  </Link>
                  <span className="font-mono text-[10px] text-ink-950/40 dark:text-surface/40">{c.caseNumber}</span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="avatar w-6 h-6 text-[10px]">
                      {c.customer.firstName[0]}
                      {c.customer.lastName[0]}
                    </span>
                    <span className="text-ink-950/70 dark:text-surface/70">
                      {c.customer.firstName} {c.customer.lastName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <PriorityPill priority={c.priority} />
                </td>
                <td className="px-3 py-3.5">
                  <span className={STATUS_PILL[c.status] ?? "pill-neutral"}>{STATUS_LABEL[c.status]}</span>
                </td>
                <td className="px-3 py-3.5 text-ink-950/70 dark:text-surface/70">
                  {c.assignedTo?.name ?? <span className="text-ink-950/35 dark:text-surface/35">Unassigned</span>}
                </td>
                <td className="px-3 py-3.5">
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
            {cases.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-sm text-ink-950/50 dark:text-surface/50">
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
