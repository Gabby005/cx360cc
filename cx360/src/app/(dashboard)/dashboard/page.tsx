import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { computeSlaClock } from "@/lib/sla";
import Link from "next/link";
import { Inbox, CheckCircle2, AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const ctx = await requireSession();

  const [openCases, resolvedToday, breachedCount, casesWithPolicy] = await Promise.all([
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] } } }),
    prisma.case.count({
      where: { tenantId: ctx.tenantId, resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: "ESCALATED" } }),
    prisma.case.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY"] }, slaPolicyId: { not: null } },
      include: { slaPolicy: true, customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
  ]);

  const atRisk = casesWithPolicy
    .map((c) => ({ case: c, clock: c.slaPolicy ? computeSlaClock({ createdAt: c.createdAt, respondedAt: c.respondedAt, resolvedAt: c.resolvedAt, policy: c.slaPolicy }) : null }))
    .filter((x) => x.clock && x.clock.status !== "ok")
    .sort((a, b) => (b.clock!.elapsedPct ?? 0) - (a.clock!.elapsedPct ?? 0));

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Overview</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">Live queue health for your team.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Metric icon={Inbox} label="Open cases" value={openCases} />
        <Metric icon={CheckCircle2} label="Resolved today" value={resolvedToday} accent="ok" />
        <Metric icon={AlertTriangle} label="Escalated" value={breachedCount} accent={breachedCount > 0 ? "breach" : undefined} />
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-4">Cases needing attention</h2>
        {atRisk.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 py-8 text-center">
            Nothing at risk right now — every open case is within SLA.
          </p>
        ) : (
          <ul className="divide-y divide-line-light dark:divide-line-dark">
            {atRisk.map(({ case: c, clock }) => (
              <li key={c.id} className="py-3 flex items-center justify-between text-sm gap-4">
                <div className="min-w-0">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand truncate block">
                    {c.subject}
                  </Link>
                  <span className="text-xs text-ink-950/50 dark:text-surface/50">
                    {c.customer.firstName} {c.customer.lastName} · {c.priority}
                  </span>
                </div>
                <span className={clock!.status === "breach" ? "pill-breach font-mono shrink-0" : "pill-warning font-mono shrink-0"}>
                  {clock!.elapsedPct}% elapsed
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  accent?: "ok" | "breach";
}) {
  const iconWrap =
    accent === "ok"
      ? "bg-sla-ok/10 text-sla-ok"
      : accent === "breach"
      ? "bg-sla-breach/10 text-sla-breach"
      : "bg-brand-light text-brand-dark dark:bg-brand/15 dark:text-brand";

  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg grid place-items-center shrink-0 ${iconWrap}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs text-ink-950/50 dark:text-surface/50 mb-0.5">{label}</div>
        <div className="text-2xl font-semibold font-mono">{value}</div>
      </div>
    </div>
  );
}
