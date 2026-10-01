"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Download } from "lucide-react";

const PRESETS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "custom", label: "Custom" },
] as const;

export function RangeFilter({
  rangeKey,
  from,
  to,
  canExport,
}: {
  rangeKey: string;
  from: string;
  to: string;
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCustom, setShowCustom] = useState(rangeKey === "custom");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(params: Record<string, string>) {
    router.push(`${pathname}?${new URLSearchParams(params).toString()}`);
  }

  const exportHref = `/api/analytics/export?${new URLSearchParams(
    rangeKey === "custom" ? { range: "custom", from, to } : { range: rangeKey }
  ).toString()}`;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="inline-flex rounded-lg border border-line-light dark:border-line-dark overflow-hidden">
        {PRESETS.map((p) => {
          const active = p.key === "custom" ? showCustom || rangeKey === "custom" : !showCustom && rangeKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                if (p.key === "custom") setShowCustom(true);
                else {
                  setShowCustom(false);
                  go({ range: p.key });
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium ${active ? "bg-brand text-white" : "hover:bg-ink-950/5 dark:hover:bg-surface/10"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="input !py-1 !w-auto text-xs" />
          <span className="text-xs text-ink-950/50 dark:text-surface/50">to</span>
          <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="input !py-1 !w-auto text-xs" />
          <button
            type="button"
            disabled={!customFrom || !customTo || customTo < customFrom}
            onClick={() => go({ range: "custom", from: customFrom, to: customTo })}
            className="btn-primary !py-1 text-xs disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {canExport && (
        <a href={exportHref} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-line-light dark:border-line-dark hover:bg-ink-950/5 dark:hover:bg-surface/10">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </a>
      )}
    </div>
  );
}
