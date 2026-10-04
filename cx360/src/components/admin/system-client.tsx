"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNowButton({ job }: { job: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job}/run`, { method: "POST" });
      setMsg(res.ok ? "Done" : "Failed");
    } catch { setMsg("Failed"); }
    setBusy(false);
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-secondary text-xs">{busy ? "Running…" : "Run now"}</button>
      {msg && <span className="text-xs text-ink-950/50 dark:text-surface/50">{msg}</span>}
    </span>
  );
}

export function ResolveButton({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch(`/api/admin/errors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !resolved }) }).catch(() => {});
    setBusy(false);
    router.refresh();
  }
  return <button onClick={toggle} disabled={busy} className="text-xs text-brand hover:underline">{resolved ? "Re-open" : "Mark resolved"}</button>;
}
