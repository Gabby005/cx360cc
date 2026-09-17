"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";

export function BatchCloseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function checkPreview() {
    if (!fromDate || !toDate) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cases/batch-close?fromDate=${fromDate}&toDate=${toDate}`);
    setLoading(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to preview" }));
      setError(msg);
      setPreview(null);
      return;
    }
    const { count } = await res.json();
    setPreview(count);
  }

  async function execute() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cases/batch-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDate, toDate }),
    });
    setLoading(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to close cases" }));
      setError(msg);
      return;
    }
    const { closed } = await res.json();
    setDone(closed);
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-secondary text-xs">
        <Layers size={13} /> Batch close
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 card shadow-popover p-4 z-20">
          <h3 className="text-xs font-semibold mb-3">Close cases in a date range</h3>

          {done !== null ? (
            <div>
              <p className="text-sm text-sla-ok mb-3">Closed {done} case(s).</p>
              <button onClick={() => { setOpen(false); setDone(null); }} className="btn-secondary text-xs w-full">
                Done
              </button>
            </div>
          ) : (
            <>
              <label className="block text-[11px] font-medium mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPreview(null);
                }}
                className="input text-xs mb-2"
              />
              <label className="block text-[11px] font-medium mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPreview(null);
                }}
                className="input text-xs mb-3"
              />

              {error && <p className="text-xs text-sla-breach mb-2">{error}</p>}

              {preview === null ? (
                <button
                  onClick={checkPreview}
                  disabled={!fromDate || !toDate || loading}
                  className="btn-secondary text-xs w-full"
                >
                  {loading ? "Checking…" : "Preview affected cases"}
                </button>
              ) : (
                <>
                  <p className="text-xs text-ink-950/60 dark:text-surface/60 mb-2">
                    This will close <strong>{preview}</strong> case(s) opened in this range (already-closed cases
                    are skipped).
                  </p>
                  <button
                    onClick={execute}
                    disabled={loading || preview === 0}
                    className="btn-primary text-xs w-full"
                  >
                    {loading ? "Closing…" : `Close ${preview} case(s)`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
