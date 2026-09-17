"use client";

import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";

const TYPES = [
  { value: "COMPLAINT", label: "Complaint", short: "COM" },
  { value: "SERVICE_REQUEST", label: "Request", short: "REQ" },
  { value: "INQUIRY", label: "Enquiry", short: "ENQ" },
  { value: "INCIDENT", label: "Incident", short: "INC" },
] as const;

type CaseCode = {
  id: string;
  type: string;
  code: string;
  category: string;
  subcategory: string | null;
  active: boolean;
};

export function CaseCodesClient({ initialCodes }: { initialCodes: CaseCode[] }) {
  const [codes, setCodes] = useState(initialCodes);
  const [activeType, setActiveType] = useState<(typeof TYPES)[number]["value"]>("COMPLAINT");
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const filtered = useMemo(() => codes.filter((c) => c.type === activeType), [codes, activeType]);

  async function toggleActive(id: string, active: boolean) {
    setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, active: !active } : c)));
    await fetch(`/api/admin/case-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeType === t.value
                  ? "bg-brand text-white"
                  : "bg-surface dark:bg-ink-800 text-ink-950/70 dark:text-surface/70 hover:bg-line-light dark:hover:bg-ink-700"
              }`}
            >
              {t.label} <span className="font-mono opacity-70">({t.short})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUpload((v) => !v)} className="btn-secondary text-xs">
            <Upload size={13} /> Upload CSV
          </button>
          <button onClick={() => setShowCreate((v) => !v)} className="btn-primary text-xs">
            <Plus size={13} /> New code
          </button>
        </div>
      </div>

      {showUpload && (
        <UploadForm
          type={activeType}
          onUploaded={(created, skipped) => {
            setShowUpload(false);
            // Codes were created server-side; refresh isn't wired here to
            // avoid a full page reload — prompt a manual refresh instead.
            alert(`Uploaded: ${created} new code(s) added, ${skipped} skipped (already existed).`);
            window.location.reload();
          }}
        />
      )}

      {showCreate && (
        <CreateForm
          type={activeType}
          onCreated={(code) => {
            setCodes((prev) => [...prev, code]);
            setShowCreate(false);
          }}
        />
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface dark:bg-ink-800 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Code</th>
              <th className="text-left font-medium px-3 py-2.5">Category</th>
              <th className="text-left font-medium px-3 py-2.5">Subcategory</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-line-light dark:border-line-dark last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{c.code}</td>
                <td className="px-3 py-2.5">{c.category}</td>
                <td className="px-3 py-2.5 text-ink-950/60 dark:text-surface/60">{c.subcategory ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => toggleActive(c.id, c.active)}
                    className={c.active ? "pill-ok" : "pill-neutral"}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-ink-950/50 dark:text-surface/50">
                  No codes yet for this type.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateForm({
  type,
  onCreated,
}: {
  type: string;
  onCreated: (code: CaseCode) => void;
}) {
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !category.trim()) return setError("Code and category are required.");

    setSaving(true);
    const res = await fetch("/api/admin/case-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, code, category, subcategory: subcategory || undefined }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create code" }));
      setError(msg);
      return;
    }
    const { code: created } = await res.json();
    onCreated(created);
    setCode("");
    setCategory("");
    setSubcategory("");
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <div>
        <label className="block text-xs font-medium mb-1">Code</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} className="input" placeholder="E0006" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="ATM/POS" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Subcategory (optional)</label>
        <input
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className="input"
          placeholder="Dispensed less cash"
        />
      </div>
      {error && <p className="text-xs text-sla-breach sm:col-span-3">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary text-sm sm:col-span-3">
        {saving ? "Adding…" : "Add code"}
      </button>
    </form>
  );
}

function UploadForm({ type, onUploaded }: { type: string; onUploaded: (created: number, skipped: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose a CSV file first.");

    const formData = new FormData();
    formData.append("type", type);
    formData.append("file", file);

    setUploading(true);
    const res = await fetch("/api/admin/case-codes/upload", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Upload failed" }));
      setError(msg);
      return;
    }
    const { created, skipped } = await res.json();
    onUploaded(created, skipped);
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-3 space-y-3">
      <p className="text-xs text-ink-950/60 dark:text-surface/60">
        CSV columns: <code className="kbd">code,category,subcategory</code> (subcategory may be blank). A header
        row is fine — it's detected and skipped automatically.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="input text-xs"
      />
      {error && <p className="text-xs text-sla-breach">{error}</p>}
      <button type="submit" disabled={uploading || !file} className="btn-primary text-sm w-full">
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
