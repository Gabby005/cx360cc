"use client";

import { useState } from "react";
import { Download } from "lucide-react";

type Row = { category: string; subcategory: string | null; count: number };
type List = { total: number; rows: Row[] };
type Drivers = { COMPLAINT: List; SERVICE_REQUEST: List; INQUIRY: List };

const TABS = [
  { key: "COMPLAINT", label: "Complaints", accent: "#DC2626" },
  { key: "SERVICE_REQUEST", label: "Requests", accent: "#5B5FEF" },
  { key: "INQUIRY", label: "Enquiries", accent: "#16A34A" },
] as const;

export function TopDriversPanel({
  drivers,
  rangeLabel,
  exportHref,
  limit,
}: {
  drivers: Drivers;
  rangeLabel: string;
  exportHref: string | null;
  limit: number;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("COMPLAINT");
  const active = TABS.find((t) => t.key === tab)!;
  const list = drivers[tab];
  const max = Math.max(...list.rows.map((r) => r.count), 1);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold">Top {limit} engagement drivers</h2>
        {exportHref && (
          <a
            href={exportHref}
            title="Download all three lists as one Excel file"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-line-light dark:border-line-dark hover:bg-ink-950/5 dark:hover:bg-surface/10 shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </a>
        )}
      </div>
      <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-3">
        Most common category › subcategory, {rangeLabel}
      </p>

      <div className="inline-flex rounded-lg border border-line-light dark:border-line-dark overflow-hidden mb-3 w-full">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium ${
              tab === t.key ? "bg-brand text-white" : "hover:bg-ink-950/5 dark:hover:bg-surface/10"
            }`}
          >
            {t.label} <span className="opacity-70">({drivers[t.key].total})</span>
          </button>
        ))}
      </div>

      {list.rows.length === 0 ? (
        <p className="text-xs text-ink-950/40 dark:text-surface/40 py-4">No categorised cases in this period.</p>
      ) : (
        <ol className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
          {list.rows.map((r, i) => (
            <li key={`${r.category}-${r.subcategory}-${i}`}>
              <div className="flex items-start justify-between gap-3 text-xs mb-1">
                <span className="min-w-0">
                  <span className="text-ink-950/40 dark:text-surface/40 font-mono mr-1.5">{i + 1}.</span>
                  <span className="font-medium">{r.category}</span>
                  {r.subcategory && <span className="text-ink-950/60 dark:text-surface/60"> › {r.subcategory}</span>}
                </span>
                <span className="font-mono text-ink-950/60 dark:text-surface/60 shrink-0">
                  {r.count} · {list.total ? Math.round((r.count / list.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-950/5 dark:bg-surface/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: active.accent }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
