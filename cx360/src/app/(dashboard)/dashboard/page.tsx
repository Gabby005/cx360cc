import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { computeSlaClock } from "@/lib/sla";
import { parseBusinessHours } from "@/lib/business-hours";
import { getChannelStats, fmtMins } from "@/lib/channel-stats";
import { channelLabel } from "@/lib/channel-ui";
import { ChannelTiles } from "@/components/channels/channel-tiles";
import { ChannelBadge } from "@/components/channels/channel-icon";
import { AutoRefresh } from "@/components/channels/auto-refresh";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Inbox, CheckCircle2, AlertTriangle, MessageSquareWarning, PhoneMissed, Timer, Plus, Search, PhoneCall } from "lucide-react";

export const dynamic = "force-dynamic";

const OPEN = ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] as const;
const DAY = 86_400_000;

export default async function DashboardPage() {
  const ctx = await requireSession();
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart.getTime() - 6 * DAY);
  const tomorrow = new Date(dayStart.getTime() + DAY);

  const [openCases, resolvedToday, escalated, casesWithPolicy, tenantHours, me, stats, activity] = await Promise.all([
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: { in: [...OPEN] } } }),
    prisma.case.count({ where: { tenantId: ctx.tenantId, resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: "ESCALATED" } }),
    prisma.case.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY"] }, slaPolicyId: { not: null } },
      include: { slaPolicy: true, customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { businessHours: true } }),
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    getChannelStats(ctx.tenantId, weekStart, tomorrow),
    prisma.interaction.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  const businessHours = parseBusinessHours(tenantHours?.businessHours);

  const atRisk = casesWithPolicy
    .map((c) => ({ case: c, clock: c.slaPolicy ? computeSlaClock({ createdAt: c.createdAt, startedAt: c.reopenedAt, respondedAt: c.respondedAt, resolvedAt: c.resolvedAt, policy: c.slaPolicy, businessHours }) : null }))
    .filter((x) => x.clock && x.clock.status !== "ok")
    .sort((a, b) => (b.clock!.elapsedPct ?? 0) - (a.clock!.elapsedPct ?? 0))
    .slice(0, 8);

  const missedNames = new Map(
    (await prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, id: { in: stats.missed.waitingList.slice(0, 6).map((m) => m.customerId) } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    })).map((c) => [c.id, c])
  );

  const dayKeys = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY).toISOString().slice(0, 10));
  const todayKey = dayKeys[6];
  const hour = new Date().getUTCHours() + 1; // Lagos time (UTC+1)
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (me?.name ?? "").split(" ")[0];

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1900px]">
      <AutoRefresh seconds={60} />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold">{greeting}{first ? `, ${first}` : ""}</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })} · live queue health, refreshes every minute.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/cases/new" className="btn-primary text-xs !px-3 !py-1.5"><Plus size={14} /> Log a case</Link>
          <Link href="/inbox" className="btn-secondary text-xs !px-3 !py-1.5"><Inbox size={14} /> Open inbox</Link>
          <Link href="/customers" className="btn-secondary text-xs !px-3 !py-1.5"><Search size={14} /> Find customer</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6">
        <Metric icon={Inbox} label="Open cases" value={openCases} href="/cases" />
        <Metric icon={CheckCircle2} label="Resolved today" value={resolvedToday} accent="ok" href="/cases" />
        <Metric icon={AlertTriangle} label="Escalated" value={escalated} accent={escalated > 0 ? "breach" : undefined} href="/cases" />
        <Metric icon={MessageSquareWarning} label="Messages waiting" value={stats.totals.waiting} accent={stats.totals.waiting > 0 ? "warning" : undefined} href="/inbox" />
        <Metric icon={PhoneMissed} label="Missed calls to return" value={stats.missed.stillWaiting} accent={stats.missed.stillWaiting > 0 ? "breach" : undefined} href="/inbox?channel=VOICE" />
        <Metric icon={Timer} label="Avg reply time (7 days)" text={fmtMins(stats.totals.avgResponseMins)} href="/analytics" />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Channels</h2>
        <Link href="/analytics#channels" className="text-xs text-brand hover:underline">Channel report →</Link>
      </div>
      <div className="mb-6">
        <ChannelTiles channels={stats.channels} daily={stats.daily} todayKey={todayKey} dayKeys={dayKeys} missedWaiting={stats.missed.stillWaiting} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold mb-4">Cases needing attention</h2>
          {atRisk.length === 0 ? (
            <p className="text-sm text-ink-950/50 dark:text-surface/50 py-8 text-center">Nothing at risk right now — every open case is within SLA.</p>
          ) : (
            <ul className="divide-y divide-line-light dark:divide-line-dark">
              {atRisk.map(({ case: c, clock }) => (
                <li key={c.id} className="py-3 flex items-center justify-between text-sm gap-4">
                  <div className="min-w-0">
                    <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand truncate block">{c.subject}</Link>
                    <span className="text-xs text-ink-950/50 dark:text-surface/50">{c.customer.firstName} {c.customer.lastName} · {c.priority}</span>
                  </div>
                  <span className={clock!.status === "breach" ? "pill-breach font-mono shrink-0" : "pill-warning font-mono shrink-0"}>{clock!.elapsedPct}% elapsed</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Missed calls to return</h2>
              <span className="text-[11px] text-ink-950/50 dark:text-surface/50">last 7 days</span>
            </div>
            {stats.missed.waitingList.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50 py-3">{stats.missed.total === 0 ? "No missed calls." : "Every missed call has been followed up."}</p>
            ) : (
              <ul className="divide-y divide-line-light dark:divide-line-dark">
                {stats.missed.waitingList.slice(0, 6).map((m) => {
                  const c = missedNames.get(m.customerId);
                  return (
                    <li key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/customers/${m.customerId}`} className="font-medium hover:text-brand truncate block">{c ? `${c.firstName} ${c.lastName}` : "Unknown caller"}</Link>
                        <span className="text-xs text-ink-950/50 dark:text-surface/50">waiting {fmtMins(m.waitingMins)}</span>
                      </div>
                      {c?.phone && <a href={`tel:${c.phone}`} className="btn-secondary !px-2.5 !py-1 text-xs shrink-0"><PhoneCall size={12} /> Call</a>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">Latest activity</h2>
            {activity.length === 0 ? <p className="text-sm text-ink-950/50 dark:text-surface/50">Nothing yet.</p> : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2.5 text-sm">
                    <ChannelBadge channel={a.channel} size={28} />
                    <div className="min-w-0">
                      <p className="truncate"><Link href={`/customers/${a.customer.id}`} className="font-medium hover:text-brand">{a.customer.firstName} {a.customer.lastName}</Link> <span className="text-xs text-ink-950/40 dark:text-surface/40">{a.direction === "outbound" ? "← sent" : "→ received"} · {channelLabel(a.channel)}</span></p>
                      <p className="text-xs text-ink-950/60 dark:text-surface/60 truncate">{a.summary ?? "—"}</p>
                      <p className="text-[10px] text-ink-950/40 dark:text-surface/40">{formatDistanceToNow(a.createdAt, { addSuffix: true })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, text, accent, href }: { icon: typeof Inbox; label: string; value?: number; text?: string; accent?: "ok" | "breach" | "warning"; href: string }) {
  const wrap = accent === "ok" ? "bg-sla-ok/10 text-sla-ok" : accent === "breach" ? "bg-sla-breach/10 text-sla-breach" : accent === "warning" ? "bg-sla-warning/10 text-sla-warning" : "bg-brand-light text-brand-dark dark:bg-brand/15 dark:text-brand";
  return (
    <Link href={href} className="card p-4 flex items-center gap-3 hover:ring-1 hover:ring-brand/40 transition">
      <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${wrap}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <div className="text-[11px] text-ink-950/50 dark:text-surface/50 mb-0.5 truncate">{label}</div>
        <div className="text-2xl font-semibold font-mono leading-none">{text ?? value}</div>
      </div>
    </Link>
  );
}
