"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeSlaClock, formatCountdown, type SlaTarget } from "@/lib/sla";
import { useBusinessHours } from "@/components/providers/business-hours-provider";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Plus, PhoneCall, Mail, Inbox, CheckCircle2, Clock, AlertTriangle, ListChecks, PhoneMissed } from "lucide-react";
import { ChannelBadge } from "@/components/channels/channel-icon";
import { AutoRefresh } from "@/components/channels/auto-refresh";
import { CHANNEL_ORDER, channelLabel } from "@/lib/channel-ui";

type CaseItem = {
  id: string;
  caseNumber?: string;
  subject: string;
  description?: string | null;
  priority: string;
  status: string;
  createdAt: string;
  reopenedAt?: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  slaPolicy: SlaTarget | null;
  customer: { id: string; firstName: string; lastName: string; segment: string | null; sentimentAvg: number | null; phone?: string | null; email?: string | null };
  interactions: { id: string; channel: string; direction?: string; summary: string | null; createdAt: string }[];
};

const SLA_PILL: Record<string, string> = { breach: "pill-breach", escalate: "pill-warning", warning: "pill-warning", ok: "pill-ok" };
const SLA_BAR: Record<string, string> = { breach: "bg-sla-breach", escalate: "bg-sla-warning", warning: "bg-sla-warning", ok: "bg-sla-ok" };
const PRIORITY_PILL: Record<string, string> = { CRITICAL: "pill-breach", HIGH: "pill-warning", MEDIUM: "pill-neutral", LOW: "pill-neutral" };

type Driver = { category: string; count: number } | null;

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Inbox; label: string; value: number; tone?: "ok" | "warning" | "breach" }) {
  const c = tone === "ok" ? "text-sla-ok bg-sla-ok/10" : tone === "warning" ? "text-sla-warning bg-sla-warning/10" : tone === "breach" ? "text-sla-breach bg-sla-breach/10" : "text-brand-dark dark:text-brand bg-brand-light dark:bg-brand/15";
  return (
    <div className="card px-3.5 py-2.5 flex items-center gap-3 min-w-[150px]">
      <span className={`w-8 h-8 rounded-lg grid place-items-center ${c}`}><Icon size={16} /></span>
      <div>
        <div className="text-xl font-semibold font-mono leading-none">{value}</div>
        <div className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function AgentWorkspaceClient({
  cases,
  articles,
  topDriversToday,
  resolvedToday = 0,
  inboxWaiting = {},
  missedWaiting = 0,
}: {
  cases: CaseItem[];
  articles: { id: string; title: string; category: string | null }[];
  topDriversToday: { COMPLAINT: Driver; SERVICE_REQUEST: Driver; INQUIRY: Driver };
  resolvedToday?: number;
  inboxWaiting?: Record<string, number>;
  missedWaiting?: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.id ?? null);
  const selected = cases.find((c) => c.id === selectedId) ?? null;
  const businessHours = useBusinessHours();

  const ranked = useMemo(
    () =>
      cases
        .map((c) => ({
          case: c,
          clock: c.slaPolicy
            ? computeSlaClock({
                createdAt: new Date(c.createdAt),
                startedAt: c.reopenedAt ? new Date(c.reopenedAt) : null,
                respondedAt: c.respondedAt ? new Date(c.respondedAt) : null,
                resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
                policy: c.slaPolicy,
                businessHours,
              })
            : null,
        }))
        .sort((a, b) => (b.clock?.elapsedPct ?? -1) - (a.clock?.elapsedPct ?? -1)),
    [cases, businessHours]
  );
  const selectedClock = ranked.find((r) => r.case.id === selectedId)?.clock ?? null;
  const atRisk = ranked.filter((r) => r.clock && r.clock.status !== "ok").length;
  const dueSoon = ranked.filter((r) => r.clock && r.clock.minutesRemaining >= 0 && r.clock.minutesRemaining <= 120).length;
  const waitingTotal = Object.values(inboxWaiting).reduce((a, b) => a + b, 0);

  return (
    <div className="h-full flex flex-col">
      <AutoRefresh seconds={90} />
      {/* Top strip: my numbers + what's waiting in the Inbox by channel */}
      <div className="px-4 py-3 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 flex flex-wrap items-stretch gap-2">
        <Stat icon={ListChecks} label="My open cases" value={cases.length} />
        <Stat icon={AlertTriangle} label="At risk or breached" value={atRisk} tone={atRisk > 0 ? "breach" : undefined} />
        <Stat icon={Clock} label="Due within 2 hours" value={dueSoon} tone={dueSoon > 0 ? "warning" : undefined} />
        <Stat icon={CheckCircle2} label="Resolved today" value={resolvedToday} tone="ok" />
        <div className="hidden md:block w-px bg-line-light dark:bg-line-dark mx-1" />
        <Link href="/inbox" className="card px-3.5 py-2.5 hover:ring-1 hover:ring-brand/40 min-w-[120px]">
          <div className="text-xl font-semibold font-mono leading-none">{waitingTotal}</div>
          <div className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">Waiting in Inbox</div>
        </Link>
        {CHANNEL_ORDER.filter((c) => (inboxWaiting[c] ?? 0) > 0).map((c) => (
          <Link key={c} href={`/inbox?channel=${c}`} className="card px-3 py-2.5 flex items-center gap-2.5 hover:ring-1 hover:ring-brand/40">
            <ChannelBadge channel={c} size={28} />
            <div>
              <div className="text-lg font-semibold font-mono leading-none">{inboxWaiting[c]}</div>
              <div className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">{c === "VOICE" ? `${missedWaiting} missed` : channelLabel(c)}</div>
            </div>
          </Link>
        ))}
        {missedWaiting > 0 && !inboxWaiting.VOICE && (
          <Link href="/inbox?channel=VOICE" className="card px-3 py-2.5 flex items-center gap-2.5 hover:ring-1 hover:ring-brand/40">
            <PhoneMissed size={18} className="text-sla-breach" />
            <div><div className="text-lg font-semibold font-mono leading-none">{missedWaiting}</div><div className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-0.5">Missed calls</div></div>
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr_320px]">
        {/* Queue pane */}
        <div className="bg-surface-raised dark:bg-ink-900 border-r border-line-light dark:border-line-dark overflow-y-auto">
          <div className="px-4 py-4 border-b border-line-light dark:border-line-dark flex items-center justify-between sticky top-0 bg-surface-raised dark:bg-ink-900 z-10">
            <div>
              <h1 className="text-sm font-semibold">My queue</h1>
              <p className="text-xs text-ink-950/50 dark:text-surface/50">{cases.length} active · most urgent first</p>
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
                  className={`w-full text-left px-4 py-3 border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-800 transition-colors ${selectedId === c.id ? "bg-brand-light/50 dark:bg-brand/10" : ""}`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="avatar w-7 h-7 text-[10px] shrink-0">{c.customer.firstName[0]}{c.customer.lastName[0]}</span>
                    <span className="text-sm font-medium truncate flex-1">{c.customer.firstName} {c.customer.lastName}</span>
                    {clock && <span className={`${SLA_PILL[clock.status]} !py-0.5 font-mono text-[10px] shrink-0`}>{formatCountdown(clock.minutesRemaining)}</span>}
                  </div>
                  <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate pl-9">{c.subject}</p>
                  <div className="pl-9 mt-1 flex items-center gap-2">
                    <span className={`${PRIORITY_PILL[c.priority] ?? "pill-neutral"} !py-0 !text-[10px]`}>{c.priority}</span>
                    {c.interactions[0] && <ChannelBadge channel={c.interactions[0].channel} size={16} />}
                  </div>
                </button>
              </li>
            ))}
            {cases.length === 0 && (
              <li className="px-4 py-10 text-sm text-ink-950/50 dark:text-surface/50 text-center">
                Your queue is clear.
                <Link href="/inbox" className="block text-brand hover:underline mt-2">Pick up something from the Inbox →</Link>
              </li>
            )}
          </ul>
        </div>

        {/* Active case pane */}
        <div className="overflow-y-auto p-6">
          {!selected ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50">Select a case from your queue.</p>
          ) : (
            <div className="max-w-4xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {selected.caseNumber && <span className="kbd">{selected.caseNumber}</span>}
                    <span className={PRIORITY_PILL[selected.priority] ?? "pill-neutral"}>{selected.priority}</span>
                    <span className="pill-neutral">{selected.status.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                  <h2 className="text-lg font-semibold">{selected.subject}</h2>
                </div>
                <Link href={`/cases/${selected.id}`} className="btn-primary text-xs px-3 py-1.5 shrink-0">Open full case</Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-4">
                  <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">Service level</h3>
                  {selectedClock ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`${SLA_PILL[selectedClock.status]} font-mono`}>{formatCountdown(selectedClock.minutesRemaining)}</span>
                        <span className="text-xs text-ink-950/50 dark:text-surface/50">{selectedClock.elapsedPct}% of the time used</span>
                      </div>
                      <div className="h-2 rounded-full bg-ink-950/10 dark:bg-surface/10 overflow-hidden">
                        <div className={`h-full ${SLA_BAR[selectedClock.status]}`} style={{ width: `${Math.min(100, selectedClock.elapsedPct)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-ink-950/50 dark:text-surface/50">No service-level target on this case.</p>
                  )}
                  <p className="text-xs text-ink-950/40 dark:text-surface/40 mt-3">Opened {formatDistanceToNow(new Date(selected.createdAt), { addSuffix: true })}</p>
                </div>

                <div className="card p-4">
                  <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">Customer</h3>
                  <Link href={`/customers/${selected.customer.id}`} className="text-sm font-semibold text-brand hover:underline">{selected.customer.firstName} {selected.customer.lastName}</Link>
                  <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-3">{selected.customer.segment ?? "No segment"}</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.customer.phone && <a href={`tel:${selected.customer.phone}`} className="btn-secondary !py-1 !px-2.5 text-xs"><PhoneCall size={12} /> {selected.customer.phone}</a>}
                    {selected.customer.email && <a href={`mailto:${selected.customer.email}`} className="btn-secondary !py-1 !px-2.5 text-xs"><Mail size={12} /> Email</a>}
                    <Link href={`/cases/new?customerId=${selected.customer.id}`} className="btn-secondary !py-1 !px-2.5 text-xs"><Plus size={12} /> New case</Link>
                  </div>
                </div>
              </div>

              {selected.description && (
                <div className="card p-4">
                  <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">What the customer reported</h3>
                  <p className="text-sm whitespace-pre-wrap text-ink-950/80 dark:text-surface/80">{selected.description}</p>
                </div>
              )}

              <div className="card p-4">
                <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-3 tracking-wide">Recent interactions</h3>
                {selected.interactions.length === 0 ? (
                  <p className="text-sm text-ink-950/50 dark:text-surface/50">None logged.</p>
                ) : (
                  <ul className="space-y-3">
                    {selected.interactions.map((i) => (
                      <li key={i.id} className="flex gap-2.5 text-sm">
                        <ChannelBadge channel={i.channel} size={28} />
                        <div className="min-w-0">
                          <p className="text-ink-950/80 dark:text-surface/80">{i.summary ?? "—"}</p>
                          <p className="text-xs text-ink-950/40 dark:text-surface/40">
                            {channelLabel(i.channel)}{i.direction ? (i.direction === "outbound" ? " · sent" : " · received") : ""} · {formatDistanceToNow(new Date(i.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Context / recommended actions pane */}
        <div className="bg-surface-raised dark:bg-ink-900 border-l border-line-light dark:border-line-dark overflow-y-auto p-4 hidden lg:block">
          <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2.5 tracking-wide">Today&apos;s top drivers</h3>
          <div className="card p-3 mb-6 space-y-2">
            <DriverRow label="Complaint" driver={topDriversToday.COMPLAINT} />
            <DriverRow label="Request" driver={topDriversToday.SERVICE_REQUEST} />
            <DriverRow label="Enquiry" driver={topDriversToday.INQUIRY} />
          </div>

          {selected && (
            <div className="card p-3.5 mb-6">
              <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2 tracking-wide">Customer signal</h3>
              <div className="flex items-center gap-2 mb-2">{selected.customer.segment && <span className="pill-brand">{selected.customer.segment}</span>}</div>
              <p className="text-sm text-ink-950/70 dark:text-surface/70">
                {selected.customer.sentimentAvg !== null
                  ? selected.customer.sentimentAvg < -0.2
                    ? "Recent sentiment has been negative — consider extra care in tone."
                    : "Recent sentiment is neutral to positive."
                  : "No sentiment history yet."}
              </p>
            </div>
          )}

          <h3 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 mb-2.5 tracking-wide">Suggested knowledge</h3>
          {articles.length === 0 ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50">No articles published yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {articles.map((a) => (
                <li key={a.id} className="text-sm flex gap-2">
                  <BookOpen size={14} className="mt-0.5 text-ink-950/40 dark:text-surface/40 shrink-0" />
                  <Link href="/knowledge" className="text-ink-950/80 dark:text-surface/80 hover:text-brand">{a.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverRow({ label, driver }: { label: string; driver: Driver }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink-950/50 dark:text-surface/50">{label}</span>
      {driver ? (
        <span className="font-medium text-right truncate max-w-[60%]">{driver.category} <span className="text-ink-950/40 dark:text-surface/40 font-mono">({driver.count})</span></span>
      ) : (
        <span className="text-ink-950/30 dark:text-surface/30">None yet today</span>
      )}
    </div>
  );
}
