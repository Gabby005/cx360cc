"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeSlaClock, formatCountdown, type SlaTarget } from "@/lib/sla";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Phone, Mail, MessageSquare, Plus } from "lucide-react";

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

const SLA_PILL: Record<string, string> = {
  breach: "pill-breach",
  escalate: "pill-warning",
  warning: "pill-warning",
  ok: "pill-ok",
};

const PRIORITY_PILL: Record<string, string> = {
  CRITICAL: "pill-breach",
  HIGH: "pill-warning",
  MEDIUM: "pill-neutral",
  LOW: "pill-neutral",
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
      <div className="bg-surface-raised dark:bg-ink-900 border-r border-line-light dark:border-line-dark overflow-y-auto">
        <div className="px-4 py-4 border-b border-line-light dark:border-line-dark flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">My queue</h1>
            <p className="text-xs text-ink-950/50 dark:text-surface/50">{cases.length} active</p>
          </div>
          <Link href="/cases/new" title="Log a new case" className="w-7 h-7 rounded-full grid place-items-center text-ink-950/50 dark:text-surface/50 hover:bg-ink-950/5 dark:hover:bg-surface/10 hover:text-brand">
            <Plus size={16} />
          </Link>
        </div>
        <ul>
          {ranked.map(({ case: c, clock }) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800 transition-colors ${
                  selectedId === c.id ? "bg-brand-light/50 dark:bg-brand/10" : ""
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="avatar w-7 h-7 text-[10px] shrink-0">
                    {c.customer.firstName[0]}
                    {c.customer.lastName[0]}
                  </span>
                  <span className="text-sm font-medium truncate flex-1">
                    {c.customer.firstName} {c.customer.lastName}
                  </span>
                  {clock && (
                    <span className={`${SLA_PILL[clock.status]} !py-0.5 font-mono text-[10px] shrink-0`}>
                      {formatCountdown(clock.minutesRemaining)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate pl-9">{c.subject}</p>
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
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold truncate">{selected.subject}</h2>
                  <span className={PRIORITY_PILL[selected.priority] ?? "pill-neutral"}>{selected.priority}</span>
                </div>
                <Link href={`/customers/${selected.customer.id}`} className="text-sm text-brand hover:underline">
                  {selected.customer.firstName} {selected.customer.lastName}
                </Link>
              </div>
              <Link href={`/cases/${selected.id}`} className="btn-primary text-xs px-3 py-1.5 shrink-0">
                Open full case
              </Link>
            </div>

            <div className="card p-4 mb-4">
              <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-3 tracking-wide">
                Recent interactions
              </h3>
              {selected.interactions.length === 0 ? (
                <p className="text-sm text-ink-950/50 dark:text-surface/50">None logged.</p>
              ) : (
                <ul className="space-y-3">
                  {selected.interactions.map((i) => {
                    const Icon = CHANNEL_ICON[i.channel] ?? MessageSquare;
                    return (
                      <li key={i.id} className="flex gap-2.5 text-sm">
                        <div className="w-7 h-7 rounded-full bg-brand-light dark:bg-brand/15 text-brand-dark dark:text-brand grid place-items-center shrink-0">
                          <Icon size={13} />
                        </div>
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
      <div className="bg-surface-raised dark:bg-ink-900 border-l border-line-light dark:border-line-dark overflow-y-auto p-4 hidden lg:block">
        <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2.5 tracking-wide">
          Suggested knowledge
        </h3>
        {articles.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 mb-6">No articles published yet.</p>
        ) : (
          <ul className="space-y-2.5 mb-6">
            {articles.map((a) => (
              <li key={a.id} className="text-sm flex gap-2">
                <BookOpen size={14} className="mt-0.5 text-ink-950/40 dark:text-surface/40 shrink-0" />
                <span className="text-ink-950/80 dark:text-surface/80">{a.title}</span>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="card p-3.5">
            <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">
              Customer signal
            </h3>
            <div className="flex items-center gap-2 mb-2">
              {selected.customer.segment && <span className="pill-brand">{selected.customer.segment}</span>}
            </div>
            <p className="text-sm text-ink-950/70 dark:text-surface/70">
              {selected.customer.sentimentAvg !== null
                ? selected.customer.sentimentAvg < -0.2
                  ? "Recent sentiment has been negative — consider extra care in tone."
                  : "Recent sentiment is neutral to positive."
                : "No sentiment history yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
