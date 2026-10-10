"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Copy } from "lucide-react";

/** Starts a NEW ticket for the same customer and complaint: opens the New case screen already filled in. */
export function ReuseTicketButton({ caseId }: { caseId: string }) {
  return (
    <Link
      href={`/cases/new?reuseFrom=${caseId}`}
      className="btn-secondary text-xs"
      title="Log a new ticket for the same customer and complaint. The details are filled in for you and a new ticket number is issued."
    >
      <Copy size={13} /> Reuse this ticket
    </Link>
  );
}

/** Brings back THIS exact ticket (same number, full history). For a ticket that was closed by mistake. */
export function ReopenTicketButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    if (!window.confirm("Reopen this exact ticket? Use this when it was closed by mistake. To log a new ticket for the same complaint, use \"Reuse this ticket\" instead.")) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cases/${caseId}/reopen`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to reopen ticket" }));
      setError(msg);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={reopen} disabled={loading} className="btn-secondary text-xs" title="Bring this exact ticket back (same ticket number)">
        <RotateCcw size={13} /> {loading ? "Reopening…" : "Reopen ticket"}
      </button>
      {error && <span className="text-xs text-sla-breach">{error}</span>}
    </div>
  );
}
