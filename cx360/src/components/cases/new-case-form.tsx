"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Search, X } from "lucide-react";
import { CustomerOverview } from "@/components/customers/customer-overview";
import { CaseCodeSelect } from "@/components/cases/case-code-select";
import { TransactionalToggle, UnitEscalationField } from "@/components/cases/transactional-fields";
import { CASE_STATUSES, STATUS_LABEL, statusRequiresUnit } from "@/lib/case-status";

type Customer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

/** A closed ticket whose details are used to fill in the form ("Reuse this ticket"). */
export type ReuseInfo = {
  id: string;
  caseNumber: string;
  status: string;
  closedAt: string | null;
  subject: string;
  description: string;
  type: string;
  priority: string;
  caseCodeId: string;
  isTransactional: boolean;
  amount: string;
  currency: string;
  interactions: { id: string; channel: string; direction: string; summary: string | null; createdAt: string }[];
};

export function NewCaseForm({ preselectedCustomer, reuse = null }: { preselectedCustomer: Customer | null; reuse?: ReuseInfo | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(preselectedCustomer);
  const [subject, setSubject] = useState(reuse?.subject ?? "");
  const [description, setDescription] = useState(reuse?.description ?? "");
  const [type, setType] = useState(reuse?.type ?? "SERVICE_REQUEST");
  const [priority, setPriority] = useState(reuse?.priority ?? "MEDIUM");
  const [status, setStatus] = useState("NEW");
  const [caseCodeId, setCaseCodeId] = useState(reuse?.caseCodeId ?? "");
  const [isTransactional, setIsTransactional] = useState(reuse?.isTransactional ?? false);
  const [amount, setAmount] = useState(reuse?.amount ?? "");
  const [currency, setCurrency] = useState(reuse?.currency ?? "");
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unitRequired = statusRequiresUnit(status);
  // Escalation unit is available for every case (transactional or not).
  const unitFieldVisible = true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer) return setError("Select a customer first.");
    if (!subject.trim()) return setError("Subject is required.");
    if (!description.trim()) return setError("A comment/description is required for every case.");
    if (isTransactional && (!amount || !currency)) {
      return setError("Amount and currency are required for a transactional case.");
    }
    if (unitRequired && !unitId) {
      return setError(`Status "${STATUS_LABEL[status]}" requires selecting a unit.`);
    }

    setSaving(true);
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customer.id,
        type,
        priority,
        status,
        subject,
        description,
        caseCodeId: caseCodeId || undefined,
        isTransactional,
        transactionAmount: isTransactional ? Number(amount) : undefined,
        transactionCurrency: isTransactional ? currency : undefined,
        escalatedUnitId: unitFieldVisible && unitId ? unitId : undefined,
        reusedFromId: reuse?.id,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create case" }));
      setError(msg);
      return;
    }
    const { case: created } = await res.json();
    router.push(`/cases/${created.id}`);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,50rem)_minmax(0,1fr)] gap-8 items-start">
    <form onSubmit={submit} className="space-y-5 [&_.input]:py-3 [&_.input]:text-base [&_label]:text-sm [&_label]:mb-1.5 [&_textarea]:min-h-[9rem]">
      {reuse && (
        <div className="rounded-lg border border-brand/40 bg-brand-light/40 dark:bg-brand/10 p-3.5 text-sm">
          <p className="font-medium">
            Reusing the details from ticket{" "}
            <Link href={`/cases/${reuse.id}`} target="_blank" className="font-mono text-brand hover:underline">{reuse.caseNumber}</Link>
            {reuse.closedAt ? <span className="text-ink-950/50 dark:text-surface/50 font-normal"> (closed {formatDistanceToNow(new Date(reuse.closedAt), { addSuffix: true })})</span> : null}
          </p>
          <p className="text-xs text-ink-950/60 dark:text-surface/60 mt-1">The customer and complaint are filled in. Change anything you need, then save. A new ticket number is issued and the old ticket stays closed.</p>
          {reuse.interactions.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-t border-line-light dark:border-line-dark pt-2">
              <li className="text-[11px] font-medium text-ink-950/50 dark:text-surface/50">Earlier messages on that ticket</li>
              {reuse.interactions.map((i) => (
                <li key={i.id} className="text-xs flex gap-2">
                  <span className="shrink-0 text-ink-950/40 dark:text-surface/40">{i.direction === "outbound" ? "We" : "Customer"}:</span>
                  <span className="truncate">{i.summary}</span>
                  <span className="shrink-0 text-ink-950/40 dark:text-surface/40">{formatDistanceToNow(new Date(i.createdAt), { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1">Customer</label>
        {customer ? (
          <div className="card p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="avatar w-8 h-8 text-xs">
                {customer.firstName[0]}
                {customer.lastName[0]}
              </span>
              <div>
                <div className="text-sm font-medium">
                  {customer.firstName} {customer.lastName}
                </div>
                <div className="text-xs text-ink-950/50 dark:text-surface/50">
                  {customer.email ?? customer.phone ?? "No contact on file"}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setCustomer(null)} className="btn-ghost !px-2 !py-1">
              <X size={14} />
            </button>
          </div>
        ) : (
          <CustomerSearch onSelect={setCustomer} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Interaction type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="COMPLAINT">Complaint</option>
            <option value="SERVICE_REQUEST">Request</option>
            <option value="INQUIRY">Enquiry</option>
            <option value="INCIDENT">Incident</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CaseCodeSelect type={type} value={caseCodeId} onChange={setCaseCodeId} />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="input"
          placeholder="Short summary of the issue"
        />
      </div>

      <TransactionalToggle
        isTransactional={isTransactional}
        onToggle={setIsTransactional}
        amount={amount}
        onAmountChange={setAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
      />

      <div>
        <label className="block text-xs font-medium mb-1">
          Comment / description <span className="text-sla-breach">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="input resize-none"
          placeholder="Full details of what the customer reported…"
        />
      </div>

      <UnitEscalationField visible={unitFieldVisible} required={unitRequired} unitId={unitId} onUnitChange={setUnitId} />

      <div>
        <label className="block text-xs font-medium mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input"
        >
          {CASE_STATUSES.filter((s) => s !== "CLOSED").map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-sla-breach">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving ? "Creating…" : "Create case"}
      </button>
    </form>

    <div className="xl:sticky xl:top-0">
      <CustomerOverview customerId={customer?.id ?? null} />
    </div>
    </div>
  );
}

function CustomerSearch({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.customers ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, email or account number…"
          className="input pl-9"
        />
      </div>
      {query.trim() && (
        <div className="card mt-1.5 max-h-56 overflow-y-auto absolute w-full z-10 shadow-popover">
          {loading ? (
            <p className="p-3 text-sm text-ink-950/50 dark:text-surface/50">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-ink-950/50 dark:text-surface/50">No matches.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setQuery("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-surface dark:hover:bg-ink-800 flex items-center gap-2.5 border-b border-line-light dark:border-line-dark last:border-0"
              >
                <span className="avatar w-7 h-7 text-[10px]">
                  {c.firstName[0]}
                  {c.lastName[0]}
                </span>
                <div>
                  <div className="text-sm font-medium">
                    {c.firstName} {c.lastName}
                  </div>
                  <div className="text-xs text-ink-950/50 dark:text-surface/50">{c.email ?? c.phone ?? ""}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
