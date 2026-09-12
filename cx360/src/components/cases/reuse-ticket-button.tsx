"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

export function ReuseTicketButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reuse() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cases/${caseId}/reopen`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to reuse ticket" }));
      setError(msg);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={reuse} disabled={loading} className="btn-secondary text-xs">
        <RotateCcw size={13} /> {loading ? "Reopening…" : "Reuse this ticket"}
      </button>
      {error && <span className="text-xs text-sla-breach">{error}</span>}
    </div>
  );
}
