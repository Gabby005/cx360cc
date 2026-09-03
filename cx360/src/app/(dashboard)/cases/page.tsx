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
      <div className="px-6 py-4 border-b border-line-light dark:border-line-dark flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Cases</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60">{cases.length} in view</p>
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <Link
              key={f}
              href={f === "all" ? "/cases" : `/cases?status=${f}`}
              className={`px-2.5 py-1 rounded text-xs font-medium ${
                (f === "all" && !status) || status === f
                  ? "bg-brand text-white"
                  : "bg-surface dark:bg-ink-900 hover:bg-line-light dark:hover:bg-ink-800"
              }`}
            >
              {f === "all" ? "All open" : STATUS_LABEL[f]}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface dark:bg-ink-950 border-b border-line-light dark:border-line-dark text-xs text-ink-950/50 dark:text-surface/50">
            <tr>
              <th className="text-left font-medium px-6 py-2">Subject</th>
              <th className="text-left font-medium px-3 py-2">Customer</th>
              <th className="text-left font-medium px-3 py-2">Priority</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-left font-medium px-3 py-2">Assigned</th>
              <th className="text-left font-medium px-3 py-2">SLA</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-b border-line-light dark:border-line-dark hover:bg-surface dark:hover:bg-ink-900">
                <td className="px-6 py-2.5">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand">
                    {c.subject}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-ink-950/70 dark:text-surface/70">
                  {c.customer.firstName} {c.customer.lastName}
                </td>
                <td className="px-3 py-2.5">
                  <PriorityPill priority={c.priority} />
                </td>
                <td className="px-3 py-2.5 text-ink-950/70 dark:text-surface/70">{STATUS_LABEL[c.status]}</td>
                <td className="px-3 py-2.5 text-ink-950/70 dark:text-surface/70">{c.assignedTo?.name ?? "Unassigned"}</td>
                <td className="px-3 py-2.5">
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
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-ink-950/50 dark:text-surface/50">
                  No cases match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const color =
    priority === "CRITICAL"
      ? "bg-sla-breach/10 text-sla-breach"
      : priority === "HIGH"
      ? "bg-sla-warning/10 text-sla-warning"
      : "bg-line-light dark:bg-ink-800 text-ink-950/70 dark:text-surface/70";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>{priority}</span>;
}
