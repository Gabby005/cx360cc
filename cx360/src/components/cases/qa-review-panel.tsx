"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CRITERIA = ["Greeting & tone", "Resolution accuracy", "Empathy", "Compliance & process"];

type Review = {
  id: string;
  overallScore: number;
  coachingNotes: string | null;
  createdAt: string;
  reviewer: { name: string };
  reviewedAgent: { name: string };
  scorecard: { criterion: string; score: number; maxScore: number; comment?: string }[];
};

export function QaReviewPanel({
  caseId,
  assignedAgent,
  agents,
  initialReviews,
  canCreate,
}: {
  caseId: string;
  assignedAgent: { id: string; name: string } | null;
  agents: { id: string; name: string }[];
  initialReviews: Review[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [showForm, setShowForm] = useState(false);
  const [reviewedAgentId, setReviewedAgentId] = useState(assignedAgent?.id ?? agents[0]?.id ?? "");
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(CRITERIA.map((c) => [c, 3]))
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reviewedAgentId) return setError("Select which agent this review is for.");

    setSaving(true);
    const res = await fetch(`/api/cases/${caseId}/qa-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewedAgentId,
        scorecard: CRITERIA.map((c) => ({ criterion: c, score: scores[c], maxScore: 5 })),
        coachingNotes: notes || undefined,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to save review" }));
      setError(msg);
      return;
    }
    const { review } = await res.json();
    setReviews((prev) => [
      {
        ...review,
        reviewer: { name: "You" },
        reviewedAgent: agents.find((a) => a.id === reviewedAgentId) ?? { name: "Agent" },
      },
      ...prev,
    ]);
    setShowForm(false);
    setNotes("");
    router.refresh();
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 tracking-wide">
          {canCreate ? "QA & coaching" : "Your QA feedback"}
        </h2>
        {canCreate && (
          <button onClick={() => setShowForm((v) => !v)} className="text-xs text-brand hover:underline">
            {showForm ? "Cancel" : "+ Add review"}
          </button>
        )}
      </div>

      {canCreate && showForm && (
        <form onSubmit={submit} className="space-y-3 mb-4 pb-4 border-b border-line-light dark:border-line-dark">
          <div>
            <label className="block text-xs font-medium mb-1">Agent being reviewed</label>
            <select value={reviewedAgentId} onChange={(e) => setReviewedAgentId(e.target.value)} className="input text-sm">
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {CRITERIA.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-950/70 dark:text-surface/70">{c}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScores((prev) => ({ ...prev, [c]: n }))}
                    className={`w-6 h-6 rounded-full text-xs font-medium ${
                      scores[c] >= n
                        ? "bg-brand text-white"
                        : "bg-ink-950/5 dark:bg-surface/10 text-ink-950/40 dark:text-surface/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium mb-1">Coaching notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What went well, what to work on…"
              className="input resize-none"
            />
          </div>

          {error && <p className="text-xs text-sla-breach">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary w-full text-sm">
            {saving ? "Saving…" : "Save review"}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-ink-950/50 dark:text-surface/50 py-2">No QA reviews yet on this case.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.reviewedAgent.name}</span>
                <span className="pill-brand font-mono">{r.overallScore.toFixed(1)}/5</span>
              </div>
              <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-1">
                by {r.reviewer.name} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
              {r.coachingNotes && <p className="text-xs text-ink-950/70 dark:text-surface/70">{r.coachingNotes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
