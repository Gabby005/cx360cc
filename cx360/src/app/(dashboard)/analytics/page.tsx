import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { STATUS_LABEL } from "@/lib/case-status";

export default async function AnalyticsPage() {
  const ctx = await requireSession();

  const byStatus = await prisma.case.groupBy({
    by: ["status"],
    where: { tenantId: ctx.tenantId },
    _count: true,
  });
  const byPriority = await prisma.case.groupBy({
    by: ["priority"],
    where: { tenantId: ctx.tenantId, status: { notIn: ["CLOSED", "RESOLVED"] } },
    _count: true,
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">Analytics</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Live queue composition. Executive/CX dashboards, trend charts and CSAT/NPS rollups are Phase 2.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Cases by status</h2>
          <ul className="space-y-1.5 text-sm">
            {byStatus.map((s) => (
              <li key={s.status} className="flex justify-between">
                <span className="text-ink-950/70 dark:text-surface/70">{STATUS_LABEL[s.status] ?? s.status}</span>
                <span className="font-mono">{s._count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Open cases by priority</h2>
          <ul className="space-y-1.5 text-sm">
            {byPriority.map((p) => (
              <li key={p.priority} className="flex justify-between">
                <span className="text-ink-950/70 dark:text-surface/70">{p.priority}</span>
                <span className="font-mono">{p._count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
