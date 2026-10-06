"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: "Could not change password" }));
      return setError(d.error ?? "Could not change password");
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-medium">{forced ? "Temporary password" : "Current password"}
        <input type="password" autoComplete="current-password" className="input mt-1" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block text-xs font-medium">New password
        <input type="password" autoComplete="new-password" className="input mt-1" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block text-xs font-medium">New password again
        <input type="password" autoComplete="new-password" className="input mt-1" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error && <p className="text-xs text-sla-breach">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={busy || !current || !next}>{busy ? "Saving…" : "Save new password"}</button>
        {!forced && <button type="button" className="btn-secondary text-sm" onClick={() => router.back()}>Cancel</button>}
      </div>
    </form>
  );
}
