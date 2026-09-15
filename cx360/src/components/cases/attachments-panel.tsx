"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X, FileText } from "lucide-react";

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string;
  uploadedBy: { name: string };
};

export function AttachmentsPanel({
  caseId,
  initialAttachments,
  currentUserId,
  canManageOthers,
}: {
  caseId: string;
  initialAttachments: Attachment[];
  currentUserId: string;
  canManageOthers: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is ${Math.round(file.size / 1024)}KB — please use one under 3MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      const res = await fetch(`/api/cases/${caseId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataUrl: reader.result }),
      });
      setUploading(false);
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Upload failed" }));
        setError(msg);
        return;
      }
      const { attachment } = await res.json();
      setAttachments((prev) => [attachment, ...prev]);
    };
    reader.readAsDataURL(file);
  }

  async function remove(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/cases/${caseId}/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Attachments</h2>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary text-xs">
          <Paperclip size={13} /> {uploading ? "Uploading…" : "Add file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mb-3">
        Under 3MB per file. Stored directly on the case record — no object storage configured in this environment.
      </p>

      {error && <p className="text-xs text-sla-breach mb-2">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-sm text-ink-950/50 dark:text-surface/50 py-4 text-center">No files attached yet.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="relative group">
              <button
                onClick={() => setPreviewing(a)}
                className="card p-2 w-full flex flex-col items-center gap-1.5 hover:border-brand transition-colors"
              >
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.dataUrl} alt={a.fileName} className="w-full h-16 object-cover rounded" />
                ) : (
                  <div className="w-full h-16 rounded bg-surface dark:bg-ink-800 grid place-items-center">
                    <FileText size={22} className="text-ink-950/40 dark:text-surface/40" />
                  </div>
                )}
                <span className="text-[11px] truncate w-full text-center">{a.fileName}</span>
              </button>
              {(a.uploadedById === currentUserId || canManageOthers) && (
                <button
                  onClick={() => remove(a.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink-950/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {previewing && (
        <div
          className="fixed inset-0 bg-ink-950/70 grid place-items-center z-50 p-6"
          onClick={() => setPreviewing(null)}
        >
          <div className="card p-4 max-w-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium truncate">{previewing.fileName}</span>
              <button onClick={() => setPreviewing(null)} className="btn-ghost !p-1.5">
                <X size={16} />
              </button>
            </div>
            {previewing.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewing.dataUrl} alt={previewing.fileName} className="max-w-full rounded" />
            ) : previewing.mimeType === "application/pdf" ? (
              <iframe src={previewing.dataUrl} className="w-full h-[70vh]" title={previewing.fileName} />
            ) : (
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto mb-3 text-ink-950/40 dark:text-surface/40" />
                <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-3">
                  No inline preview for this file type.
                </p>
                <a href={previewing.dataUrl} download={previewing.fileName} className="btn-primary text-xs">
                  Download {previewing.fileName}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
