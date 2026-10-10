"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Layers, X } from "lucide-react";
import { STATUS_LABEL } from "@/lib/case-status";

type Step = "filters" | "confirm" | "done";
type Option = { category: string; subcategories: string[] };
type Preview = { count: number; willClose: number; maxBatch: number; sample: { caseNumber: string; subject: string; status: string }[] };

const STATUS_CHOICES = ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED", "RESOLVED"];

export function BatchCloseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("filters");
  const [options, setOptions] = useState<Option[]>([]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [status, setStatus] = useState("");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ closed: number; remaining: number } | null>(null);

  useEffect(() => {
    if (!open || options.length) return;
    fetch("/api/cases/batch-close/options")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setOptions(d.categories ?? []))
      .catch(() => {});
  }, [open, options.length]);

  const subs = options.find((o) => o.category === category)?.subcategories ?? [];

  function params() {
    const p = new URLSearchParams({ fromDate, toDate });
    if (category) p.set("category", category);
    if (subcategory) p.set("subcategory", subcategory);
    if (status) p.set("status", status);
    return p;
  }
  const changed = () => {
    setPreview(null);
    setError(null);
  };

  function reset() {
    setStep("filters");
    setPreview(null);
    setResult(null);
    setError(null);
  }
  function close() {
    setOpen(false);
    if (step === "done") reset();
  }

  async function checkPreview() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cases/batch-close?${params().toString()}`);
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't preview");
      return;
    }
    setPreview(await res.json());
  }

  async function execute() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cases/batch-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDate, toDate, category: category || undefined, subcategory: subcategory || undefined, status: status || undefined, confirm: true }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't close the tickets");
      return;
    }
    setResult(await res.json());
    setStep("done");
    router.refresh();
  }

  const summary = [
    `${fromDate} → ${toDate}`,
    category ? (subcategory ? `${category} › ${subcategory}` : category) : "All categories",
    status ? STATUS_LABEL[status] ?? status : "Any open status",
  ];

  return (
    <>
      <button onClick={() => { reset(); setOpen(true); }} className="btn-secondary text-xs">
        <Layers size={13} /> Batch close
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40" onClick={close}>
          <div className="card w-full max-w-lg p-6 shadow-popover max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold">{step === "done" ? "Tickets closed" : "Batch close tickets"}</h3>
              <button onClick={close} className="p-1 rounded hover:bg-surface dark:hover:bg-ink-800" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {step === "filters" && (
              <div className="space-y-3">
                <p className="text-xs text-ink-950/60 dark:text-surface/60">
                  Choose which tickets to close. Tickets are matched on the date they were created. Nothing is closed until you confirm.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Created from</label>
                    <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); changed(); }} className="input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Created to (included)</label>
                    <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); changed(); }} className="input" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); changed(); }} className="input">
                    <option value="">All categories</option>
                    {options.map((o) => (
                      <option key={o.category} value={o.category}>{o.category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Subcategory</label>
                  <select value={subcategory} onChange={(e) => { setSubcategory(e.target.value); changed(); }} disabled={!category || subs.length === 0} className="input disabled:opacity-50">
                    <option value="">{category ? "All subcategories" : "Choose a category first"}</option>
                    {subs.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select value={status} onChange={(e) => { setStatus(e.target.value); changed(); }} className="input">
                    <option value="">Any open status (everything not yet closed)</option>
                    {STATUS_CHOICES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-xs text-sla-breach">{error}</p>}

                {preview && (
                  <div className="rounded-lg border border-line-light dark:border-line-dark p-3 text-sm">
                    {preview.count === 0 ? (
                      <p>No tickets match these choices.</p>
                    ) : (
                      <>
                        <p>
                          <strong>{preview.count.toLocaleString()}</strong> ticket{preview.count === 1 ? "" : "s"} match.
                          {preview.count > preview.maxBatch && (
                            <span className="text-ink-950/60 dark:text-surface/60"> Each run closes the oldest {preview.maxBatch.toLocaleString()}; run it again for the rest.</span>
                          )}
                        </p>
                        <ul className="mt-2 space-y-0.5 text-xs text-ink-950/60 dark:text-surface/60">
                          {preview.sample.map((s) => (
                            <li key={s.caseNumber} className="truncate">
                              <span className="font-mono">{s.caseNumber}</span> · {s.subject}
                            </li>
                          ))}
                          {preview.count > preview.sample.length && <li>…and more</li>}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {!preview || preview.count === 0 ? (
                  <button onClick={checkPreview} disabled={!fromDate || !toDate || loading} className="btn-secondary text-sm w-full">
                    {loading ? "Checking…" : "Preview affected tickets"}
                  </button>
                ) : (
                  <button onClick={() => setStep("confirm")} className="btn-primary text-sm w-full">
                    Continue — close {preview.willClose.toLocaleString()} ticket{preview.willClose === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            )}

            {step === "confirm" && preview && (
              <div className="space-y-4">
                <div className="rounded-lg bg-sla-warning/10 border border-sla-warning/30 p-3 text-sm">
                  You're about to close <strong>{preview.willClose.toLocaleString()}</strong> ticket{preview.willClose === 1 ? "" : "s"}. Each customer
                  is sent a "ticket closed" message, and every closure is recorded in the audit log.
                </div>
                <dl className="text-xs space-y-1">
                  <div className="flex gap-2"><dt className="w-20 text-ink-950/50 dark:text-surface/50">Created</dt><dd>{summary[0]}</dd></div>
                  <div className="flex gap-2"><dt className="w-20 text-ink-950/50 dark:text-surface/50">Category</dt><dd>{summary[1]}</dd></div>
                  <div className="flex gap-2"><dt className="w-20 text-ink-950/50 dark:text-surface/50">Status</dt><dd>{summary[2]}</dd></div>
                </dl>
                <p className="text-xs text-ink-950/60 dark:text-surface/60">A closed ticket can be reused from its page: that creates a new ticket with a new number.</p>
                {error && <p className="text-xs text-sla-breach">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setStep("filters")} disabled={loading} className="btn-secondary text-sm flex-1">Back</button>
                  <button onClick={execute} disabled={loading} className="btn-primary text-sm flex-1">
                    {loading ? "Closing…" : `Yes, close ${preview.willClose.toLocaleString()}`}
                  </button>
                </div>
              </div>
            )}

            {step === "done" && result && (
              <div className="space-y-4 text-center">
                <CheckCircle2 size={44} className="mx-auto text-sla-ok" />
                <div>
                  <p className="text-base font-semibold">
                    {result.closed.toLocaleString()} ticket{result.closed === 1 ? "" : "s"} closed successfully
                  </p>
                  <p className="text-xs text-ink-950/60 dark:text-surface/60 mt-1">
                    Customers have been notified and each closure is in the audit log.
                  </p>
                </div>
                {result.remaining > 0 && (
                  <div className="rounded-lg bg-sla-warning/10 border border-sla-warning/30 p-3 text-xs">
                    {result.remaining.toLocaleString()} more ticket{result.remaining === 1 ? "" : "s"} still match these choices.
                    <button onClick={() => { reset(); }} className="block mx-auto mt-2 text-brand font-medium hover:underline">
                      Review and close the next batch
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Link href="/cases?status=CLOSED&scope=all" onClick={() => { setOpen(false); reset(); }} className="btn-secondary text-sm flex-1">
                    View closed tickets
                  </Link>
                  <button onClick={() => { setOpen(false); reset(); }} className="btn-primary text-sm flex-1">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
