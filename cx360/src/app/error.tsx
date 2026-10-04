"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/monitoring/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, path: window.location.pathname }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="h-full min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-8 max-w-md text-center">
        <h1 className="text-base font-semibold mb-2">Something went wrong on this screen</h1>
        <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-5">The problem has been recorded for the administrators. Your work elsewhere is safe.</p>
        <button onClick={reset} className="btn-primary">Try again</button>
      </div>
    </div>
  );
}
