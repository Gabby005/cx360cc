"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, History } from "lucide-react";

type TimelineItem =
  | { kind: "note"; id: string; createdAt: string; authorName: string; body: string; internal: boolean }
  | { kind: "activity"; id: string; createdAt: string; actorName: string; action: string; before: unknown; after: unknown };

const ACTION_LABEL: Record<string, string> = {
  created: "created this case",
  status_changed: "changed status",
  priority_changed: "changed priority",
  reassigned: "reassigned this case",
  batch_closed: "closed via batch action",
};

function describeActivity(item: Extract<TimelineItem, { kind: "activity" }>): string {
  const label = ACTION_LABEL[item.action] ?? item.action;
  if (item.action === "status_changed" && item.before && item.after) {
    const b = item.before as { status?: string };
    const a = item.after as { status?: string };
    return `changed status from ${b.status?.replace("_", " ")} to ${a.status?.replace("_", " ")}`;
  }
  if (item.action === "priority_changed" && item.before && item.after) {
    const b = item.before as { priority?: string };
    const a = item.after as { priority?: string };
    return `changed priority from ${b.priority} to ${a.priority}`;
  }
  return label;
}

export function CaseTimeline({ caseId, items }: { caseId: string; items: TimelineItem[] }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setError(null);
    setSending(true);
    const res = await fetch(`/api/cases/${caseId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment, internal: true }),
    });
    setSending(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to add comment" }));
      setError(msg);
      return;
    }
    setComment("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold mb-4">Activity &amp; comments</h2>

      <form onSubmit={submitComment} className="mb-5">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add an internal comment…"
          rows={2}
          className="input resize-none mb-2"
        />
        <div className="flex items-center justify-between">
          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" disabled={sending || !comment.trim()} className="btn-primary text-xs ml-auto">
            {sending || isPending ? "Saving…" : "Add comment"}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-ink-950/50 dark:text-surface/50 py-4 text-center">No activity yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex gap-3">
              <div
                className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${
                  item.kind === "note"
                    ? "bg-brand-light dark:bg-brand/15 text-brand-dark dark:text-brand"
                    : "bg-ink-950/5 dark:bg-surface/10 text-ink-950/50 dark:text-surface/50"
                }`}
              >
                {item.kind === "note" ? <MessageSquare size={13} /> : <History size={13} />}
              </div>
              <div className="min-w-0 flex-1 pb-3 border-b border-line-light dark:border-line-dark last:border-0">
                {item.kind === "note" ? (
                  <>
                    <div className="flex items-center gap-2 text-xs text-ink-950/50 dark:text-surface/50 mb-1">
                      <span className="font-medium text-ink-950/80 dark:text-surface/80">{item.authorName}</span>
                      <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className="text-sm text-ink-950/80 dark:text-surface/80 whitespace-pre-wrap">{item.body}</p>
                  </>
                ) : (
                  <p className="text-xs text-ink-950/60 dark:text-surface/60">
                    <span className="font-medium text-ink-950/80 dark:text-surface/80">{item.actorName}</span>{" "}
                    {describeActivity(item)} ·{" "}
                    <span className="text-ink-950/40 dark:text-surface/40">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
