"use client";

import { useState } from "react";
import { Plus, Upload } from "lucide-react";

type Unit = { id: string; name: string; email: string; active: boolean };

export function UnitsClient({ initialUnits }: { initialUnits: Unit[] }) {
  const [units, setUnits] = useState(initialUnits);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function toggleActive(id: string, active: boolean) {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, active: !active } : u)));
    await fetch(`/api/admin/units/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={() => setShowUpload((v) => !v)} className="btn-secondary text-xs">
          <Upload size={13} /> Upload CSV
        </button>
        <button onClick={() => setShowCreate((v) => !v)} className="btn-primary text-xs">
          <Plus size={13} /> New unit
        </button>
      </div>

      {showUpload && (
        <UploadForm
          onUploaded={(created, skipped) => {
            setShowUpload(false);
            alert(`Uploaded: ${created} new unit(s) added, ${skipped} skipped (already existed).`);
            window.location.reload();
          }}
        />
      )}

      {showCreate && (
        <CreateForm
          onCreated={(unit) => {
            setUnits((prev) => [...prev, unit].sort((a, b) => a.name.localeCompare(b.name)));
            setShowCreate(false);
          }}
        />
      )}

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {units.map((u) => (
          <div key={u.id} className="p-4 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-ink-950/50 dark:text-surface/50">{u.email}</div>
            </div>
            <button onClick={() => toggleActive(u.id, u.active)} className={u.active ? "pill-ok" : "pill-neutral"}>
              {u.active ? "Active" : "Inactive"}
            </button>
          </div>
        ))}
        {units.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No units yet.</p>
        )}
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (unit: Unit) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) return setError("Name and email are required.");

    setSaving(true);
    const res = await fetch("/api/admin/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create unit" }));
      setError(msg);
      return;
    }
    const { unit } = await res.json();
    onCreated(unit);
    setName("");
    setEmail("");
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
      <div>
        <label className="block text-xs font-medium mb-1">Unit name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Fraud Team" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="fraud@demobank.cx360"
        />
      </div>
      {error && <p className="text-xs text-sla-breach sm:col-span-2">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary text-sm sm:col-span-2">
        {saving ? "Adding…" : "Add unit"}
      </button>
    </form>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (created: number, skipped: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose a CSV file first.");

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    const res = await fetch("/api/admin/units/upload", { method: "POST", body: formData });
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
        CSV columns: <code className="kbd">name,email</code>. A header row is fine — it's detected and skipped
        automatically.
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
