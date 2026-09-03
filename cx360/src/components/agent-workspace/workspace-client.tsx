"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeSlaClock, formatCountdown, type SlaTarget } from "@/lib/sla";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Phone, Mail, MessageSquare } from "lucide-react";

type CaseItem = {
  id: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  slaPolicy: SlaTarget | null;
  customer: { id: string; firstName: string; lastName: string; segment: string | null; sentimentAvg: number | null };
  interactions: { id: string; channel: string; summary: string | null; createdAt: string }[];
};

const CHANNEL_ICON: Record<string, typeof Phone> = {
  VOICE: Phone,
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageSquare,
  CHAT: MessageSquare,
  PORTAL: MessageSquare,
  SOCIAL: MessageSquare,
};

export function AgentWorkspaceClient({
  cases,
  articles,
}: {
  cases: CaseItem[];
  articles: { id: string; title: string; category: string | null }[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.id ?? null);
  const selected = cases.find((c) => c.id === selectedId) ?? null;

  const ranked = useMemo(
    () =>
      cases
        .map((c) => ({
          case: c,
          clock: c.slaPolicy
            ? computeSlaClock({
                createdAt: new Date(c.createdAt),
                respondedAt: c.respondedAt ? new Date(c.respondedAt) : null,
                resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
                policy: c.slaPolicy,
              })
            : null,
        }))
        .sort((a, b) => (b.clock?.elapsedPct ?? -1) - (a.clock?.elapsedPct ?? -1)),
    [cases]
  );

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr_300px]">
      {/* Queue pane */}
      <div className="border-r border-line-light dark:border-line-dark overflow-y-auto">
        <div className="px-4 py-3 border-b border-line-light dark:border-line-dark">
          <h1 className="text-sm font-semibold">My queue</h1>
          <p className="text-xs text-ink-950/50 dark:text-surface/50">{cases.length} active</p>
        </div>
        <ul>
          {ranked.map(({ case: c, clock }) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-900 ${
                  selectedId === c.id ? "bg-brand-light/40 dark:bg-brand/10" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium truncate">{c.customer.firstName} {c.customer.lastName}</span>
                  {clock && (
                    <span
                      className={`font-mono text-[11px] ${
                        clock.status === "breach"
                          ? "text-sla-breach"
                          : clock.status === "warning" || clock.status === "escalate"
                          ? "text-sla-warning"
                          : "text-sla-ok"
                      }`}
                    >
                      {formatCountdown(clock.minutesRemaining)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate">{c.subject}</p>
              </button>
            </li>
          ))}
          {cases.length === 0 && (
            <li className="px-4 py-8 text-sm text-ink-950/50 dark:text-surface/50 text-center">
              Your queue is empty.
            </li>
          )}
        </ul>
      </div>

      {/* Active case pane */}
      <div className="overflow-y-auto p-6">
        {!selected ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50">Select a case from your queue.</p>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{selected.subject}</h2>
                <Link href={`/customers/${selected.customer.id}`} className="text-sm text-brand hover:underline">
                  {selected.customer.firstName} {selected.customer.lastName}
                </Link>
              </div>
              <Link
                href={`/cases/${selected.id}`}
                className="text-xs px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark"
              >
                Open full case
              </Link>
            </div>

            <div className="card p-4 mb-4">
              <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">
                Recent interactions
              </h3>
              {selected.interactions.length === 0 ? (
                <p className="text-sm text-ink-950/50 dark:text-surface/50">None logged.</p>
              ) : (
                <ul className="space-y-2">
                  {selected.interactions.map((i) => {
                    const Icon = CHANNEL_ICON[i.channel] ?? MessageSquare;
                    return (
                      <li key={i.id} className="flex gap-2 text-sm">
                        <Icon size={14} className="mt-0.5 text-ink-950/40 dark:text-surface/40 shrink-0" />
                        <div>
                          <p className="text-ink-950/80 dark:text-surface/80">{i.summary ?? "—"}</p>
                          <p className="text-xs text-ink-950/40 dark:text-surface/40">
                            {formatDistanceToNow(new Date(i.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* Context / recommended actions pane */}
      <div className="border-l border-line-light dark:border-line-dark overflow-y-auto p-4 hidden lg:block">
        <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">
          Suggested knowledge
        </h3>
        {articles.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 mb-6">No articles published yet.</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {articles.map((a) => (
              <li key={a.id} className="text-sm flex gap-2">
                <BookOpen size={14} className="mt-0.5 text-ink-950/40 dark:text-surface/40 shrink-0" />
                <span className="text-ink-950/80 dark:text-surface/80">{a.title}</span>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <>
            <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">
              Customer signal
            </h3>
            <p className="text-sm text-ink-950/70 dark:text-surface/70">
              {selected.customer.segment ?? "No segment"} customer.{" "}
              {selected.customer.sentimentAvg !== null
                ? selected.customer.sentimentAvg < -0.2
                  ? "Recent sentiment has been negative — consider extra care in tone."
                  : "Recent sentiment is neutral to positive."
                : "No sentiment history yet."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
