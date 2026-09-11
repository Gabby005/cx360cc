"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { CaseCodeSelect } from "@/components/cases/case-code-select";
import { TransactionalFields } from "@/components/cases/transactional-fields";

type Customer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

export function NewCaseForm({ preselectedCustomer }: { preselectedCustomer: Customer | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(preselectedCustomer);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("SERVICE_REQUEST");
  const [priority, setPriority] = useState("MEDIUM");
  const [caseCodeId, setCaseCodeId] = useState("");
  const [isTransactional, setIsTransactional] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer) return setError("Select a customer first.");
    if (!subject.trim()) return setError("Subject is required.");
    if (!description.trim()) return setError("A comment/description is required for every case.");
    if (isTransactional && (!amount || !currency)) {
      return setError("Amount and currency are required for a transactional case.");
    }

    setSaving(true);
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customer.id,
        type,
        priority,
        subject,
        description,
        caseCodeId: caseCodeId || undefined,
        isTransactional,
        transactionAmount: isTransactional ? Number(amount) : undefined,
        transactionCurrency: isTransactional ? currency : undefined,
        escalatedUnitId: isTransactional && unitId ? unitId : undefined,
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
    <form onSubmit={submit} className="space-y-4">
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

      <TransactionalFields
        isTransactional={isTransactional}
        onToggle={setIsTransactional}
        amount={amount}
        onAmountChange={setAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
        unitId={unitId}
        onUnitChange={setUnitId}
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

      {error && <p className="text-sm text-sla-breach">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving ? "Creating…" : "Create case"}
      </button>
    </form>
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
          placeholder="Search customers by name, email, or phone…"
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
