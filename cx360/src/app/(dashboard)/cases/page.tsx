import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaBadge } from "@/components/cases/sla-badge";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  PENDING_CUSTOMER: "Pending customer",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export default async function CasesPage({ searchParams }: { searchParams: { status?: string } }) {
  const ctx = await requireSession();
  const status = searchParams.status;

  const cases = await prisma.case.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(status ? { status: status as any } : { status: { notIn: ["CLOSED"] } }),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { name: true } },
      slaPolicy: true,
    },
  });

  const filters = ["all", "NEW", "OPEN", "PENDING_CUSTOMER", "ESCALATED"];

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-line-light dark:border-line-dark flex items-center justify-between bg-surface-raised dark:bg-ink-900">
        <div>
          <h1 className="text-lg font-semibold">Cases</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60">{cases.length} in view</p>
        </div>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <Link
              key={f}
              href={f === "all" ? "/cases" : `/cases?status=${f}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                (f === "all" && !status) || status === f
                  ? "bg-brand text-white"
                  : "bg-surface dark:bg-ink-800 text-ink-950/70 dark:text-surface/70 hover:bg-line-light dark:hover:bg-ink-700"
              }`}
            >
              {f === "all" ? "All open" : STATUS_LABEL[f]}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface dark:bg-ink-800 text-xs text-ink-950/50 dark:text-surface/50 border-b border-line-light dark:border-line-dark">
              <tr>
                <th className="text-left font-medium px-5 py-3">Subject</th>
                <th className="text-left font-medium px-3 py-3">Customer</th>
                <th className="text-left font-medium px-3 py-3">Priority</th>
                <th className="text-left font-medium px-3 py-3">Status</th>
                <th className="text-left font-medium px-3 py-3">Assigned</th>
                <th className="text-left font-medium px-3 py-3">SLA</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line-light dark:border-line-dark last:border-0 hover:bg-surface dark:hover:bg-ink-800/60 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand">
                      {c.subject}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="avatar w-6 h-6 text-[10px]">
                        {c.customer.firstName[0]}
                        {c.customer.lastName[0]}
                      </span>
                      <span className="text-ink-950/70 dark:text-surface/70">
                        {c.customer.firstName} {c.customer.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <PriorityPill priority={c.priority} />
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="pill-neutral">{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="px-3 py-3.5 text-ink-950/70 dark:text-surface/70">
                    {c.assignedTo?.name ?? <span className="text-ink-950/35 dark:text-surface/35">Unassigned</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    {c.slaPolicy ? (
                      <SlaBadge createdAt={c.createdAt} respondedAt={c.respondedAt} resolvedAt={c.resolvedAt} policy={c.slaPolicy} />
                    ) : (
                      <span className="text-xs text-ink-950/30 dark:text-surface/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-ink-950/50 dark:text-surface/50">
                    No cases match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const cls =
    priority === "CRITICAL" ? "pill-breach" : priority === "HIGH" ? "pill-warning" : "pill-neutral";
  return <span className={cls}>{priority}</span>;
}
