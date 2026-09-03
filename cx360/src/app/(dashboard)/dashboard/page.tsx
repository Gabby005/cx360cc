import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { computeSlaClock } from "@/lib/sla";
import Link from "next/link";

export default async function DashboardPage() {
  const ctx = await requireSession();

  const [openCases, resolvedToday, breachedCount, casesWithPolicy] = await Promise.all([
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "ESCALATED"] } } }),
    prisma.case.count({
      where: { tenantId: ctx.tenantId, resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.case.count({ where: { tenantId: ctx.tenantId, status: "ESCALATED" } }),
    prisma.case.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER"] }, slaPolicyId: { not: null } },
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
      <h1 className="text-lg font-semibold mb-1">Overview</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Live queue health for {ctx.tenantId ? "your team" : ""}.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Metric label="Open cases" value={openCases} />
        <Metric label="Resolved today" value={resolvedToday} accent="ok" />
        <Metric label="Escalated" value={breachedCount} accent={breachedCount > 0 ? "breach" : undefined} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Cases needing attention</h2>
        {atRisk.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 py-6 text-center">
            Nothing at risk right now — every open case is within SLA.
          </p>
        ) : (
          <ul className="divide-y divide-line-light dark:divide-line-dark">
            {atRisk.map(({ case: c, clock }) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand truncate block">
                    {c.subject}
                  </Link>
                  <span className="text-xs text-ink-950/50 dark:text-surface/50">
                    {c.customer.firstName} {c.customer.lastName} · {c.priority}
                  </span>
                </div>
                <span
                  className={`font-mono text-xs px-2 py-0.5 rounded ${
                    clock!.status === "breach" ? "bg-sla-breach/10 text-sla-breach" : "bg-sla-warning/10 text-sla-warning"
                  }`}
                >
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

function Metric({ label, value, accent }: { label: string; value: number; accent?: "ok" | "breach" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-950/50 dark:text-surface/50 mb-1">{label}</div>
      <div
        className={`text-2xl font-semibold font-mono ${
          accent === "ok" ? "text-sla-ok" : accent === "breach" ? "text-sla-breach" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
