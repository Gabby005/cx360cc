"use client";

import { useEffect, useState } from "react";

type CaseCode = { id: string; code: string; category: string; subcategory: string | null };

/**
 * Category → Subcategory cascading select that resolves to a caseCodeId.
 * Reloads its options whenever `type` changes, since the taxonomy is
 * scoped per interaction type (Complaint's codes aren't Request's).
 * Shared by every case-creation form so behavior never drifts between them.
 */
export function CaseCodeSelect({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (caseCodeId: string) => void;
}) {
  const [codes, setCodes] = useState<CaseCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");

  useEffect(() => {
    setCategory("");
    onChange("");
    setLoading(true);
    fetch(`/api/case-codes?type=${type}`)
      .then((r) => r.json())
      .then((data) => setCodes(data.codes ?? []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // If a caseCodeId is passed in from outside (e.g. editing an existing
  // draft), derive which category it belongs to once codes have loaded.
  useEffect(() => {
    if (value && codes.length > 0) {
      const match = codes.find((c) => c.id === value);
      if (match) setCategory(match.category);
    }
  }, [value, codes]);

  const categories = [...new Set(codes.map((c) => c.category))];
  const subcategoryOptions = codes.filter((c) => c.category === category);

  return (
    <>
      <div>
        <label className="block text-xs font-medium mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            onChange("");
          }}
          disabled={loading}
          className="input"
        >
          <option value="">
            {loading ? "Loading…" : categories.length === 0 ? "No codes set up for this type" : "Select category"}
          </option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {category && (
        <div>
          <label className="block text-xs font-medium mb-1">Subcategory</label>
          <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
            <option value="">Select subcategory</option>
            {subcategoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subcategory ?? c.code} ({c.code})
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
