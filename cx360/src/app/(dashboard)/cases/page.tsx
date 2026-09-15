import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { BatchCloseButton } from "@/components/cases/batch-close-button";
import { CasesTable } from "@/components/cases/cases-table";
import { STATUS_LABEL } from "@/lib/case-status";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  const ctx = await requireSession();
  const { status, from, to } = searchParams;

  const cases = await prisma.case.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(status ? { status: status as any } : { status: { notIn: ["CLOSED"] } }),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 500,
    include: {
      customer: { select: { firstName: true, lastName: true, email: true } },
      assignedTo: { select: { name: true } },
      slaPolicy: true,
    },
  });

  const filters = ["all", "NEW", "OPEN", "ESCALATED"];

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Cases</h1>
            <p className="text-sm text-ink-950/60 dark:text-surface/60">{cases.length} in view</p>
          </div>
          <div className="flex items-center gap-2">
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
            {(ctx.role === "SUPERVISOR" || ctx.role === "ADMIN") && <BatchCloseButton />}
            <Link href="/cases/new" className="btn-primary text-xs">
              <Plus size={13} /> New case
            </Link>
          </div>
        </div>

        <form method="GET" className="flex items-center gap-2 flex-wrap">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="text-xs text-ink-950/50 dark:text-surface/50">From</label>
          <input type="date" name="from" defaultValue={from} className="input !py-1.5 text-xs w-36" />
          <label className="text-xs text-ink-950/50 dark:text-surface/50">To</label>
          <input type="date" name="to" defaultValue={to} className="input !py-1.5 text-xs w-36" />
          <button type="submit" className="btn-secondary text-xs">
            Apply
          </button>
          {(from || to) && (
            <Link href={status ? `/cases?status=${status}` : "/cases"} className="text-xs text-brand hover:underline">
              Clear dates
            </Link>
          )}
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <CasesTable cases={JSON.parse(JSON.stringify(cases))} />
      </div>
    </div>
  );
}
