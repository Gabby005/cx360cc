"use client";
import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { checkFile, fmtSize, MAX_FILES } from "@/lib/attachments";

export type Attached = { id: string; filename: string; size: number };

/** Paperclip button + list of attached files. Each file uploads as soon as it is picked. */
export function AttachPicker({ files, onChange }: { files: Attached[]; onChange: (f: Attached[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setBusy(true);
    let next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { setError(`Up to ${MAX_FILES} files per email.`); break; }
      const bad = checkFile(f.name, f.size);
      if (bad) { setError(bad); continue; }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/inbox/attachments", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) next = [...next, d.attachment]; else setError(d.error ?? "Could not upload");
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_FILES} className="btn-secondary !py-1 !px-2 text-xs"><Paperclip size={13} /> {busy ? "Uploading…" : "Attach"}</button>
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      {files.map((f) => (
        <span key={f.id} className="pill-neutral !py-0.5 inline-flex items-center gap-1 text-[11px]">
          {f.filename} · {fmtSize(f.size)}
          <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.filename}`}><X size={11} /></button>
        </span>
      ))}
      {error && <span className="text-[11px] text-sla-breach">{error}</span>}
    </div>
  );
}
