"use client";

import { useEffect, useState } from "react";

const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];

type Unit = { id: string; name: string; email: string };

export function TransactionalFields({
  isTransactional,
  onToggle,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  unitId,
  onUnitChange,
}: {
  isTransactional: boolean;
  onToggle: (v: boolean) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  unitId: string;
  onUnitChange: (v: string) => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  useEffect(() => {
    if (!isTransactional || units.length > 0) return;
    setLoadingUnits(true);
    fetch("/api/units")
      .then((r) => r.json())
      .then((data) => setUnits(data.units ?? []))
      .finally(() => setLoadingUnits(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransactional]);

  return (
    <div className="card p-4 space-y-3">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={isTransactional}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4 rounded accent-brand"
        />
        <span className="text-sm font-medium">This is a transactional case</span>
      </label>

      {isTransactional && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="input"
                placeholder="45000.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} className="input">
                <option value="">Select currency</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Escalate to unit (optional)</label>
            <select value={unitId} onChange={(e) => onUnitChange(e.target.value)} disabled={loadingUnits} className="input">
              <option value="">
                {loadingUnits ? "Loading…" : units.length === 0 ? "No units set up yet" : "No escalation needed"}
              </option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            {unitId && (
              <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-1">
                Submitting will email this unit about the case.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
