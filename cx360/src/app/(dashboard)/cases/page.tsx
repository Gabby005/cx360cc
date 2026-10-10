import Link from "next/link";
import { Plus, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { BatchCloseButton } from "@/components/cases/batch-close-button";
import { CasesTable } from "@/components/cases/cases-table";
import { CASE_STATUSES, STATUS_LABEL } from "@/lib/case-status";
import {
  buildCaseWhere,
  getMe,
  isSupervisor,
  parseScope,
  resolveGroups,
  PAGE_SIZE,
  MAX_PAGE,
  type CaseScope,
  type Filters,
} from "@/lib/case-scope";

export default async function CasesPage({ searchParams }: { searchParams: Filters & { page?: string } }) {
  const ctx = await requireSession();
  const sup = isSupervisor(ctx);
  const me = await getMe(ctx);

  const scope = parseScope(searchParams.scope, ctx);
  const filters: Filters = { ...searchParams, scope };
  const status = filters.status ?? "open";
  const page = Math.min(Math.max(parseInt(searchParams.page ?? "1", 10) || 1, 1), MAX_PAGE);

  const [where, teams, units] = await Promise.all([
    buildCaseWhere(ctx, me, filters),
    sup ? prisma.team.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    sup
      ? prisma.unit.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
  ]);

  // Select only what the list shows — never whole rows (descriptions, attachments) — and fetch one extra row
  // to know whether a next page exists, so we never run a COUNT over the whole table.
  const fetched = where
    ? await prisma.case.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          caseNumber: true,
          subject: true,
          priority: true,
          status: true,
          createdAt: true,
          reopenedAt: true,
          respondedAt: true,
          resolvedAt: true,
          closedAt: true,
          slaPolicy: true,
          customer: { select: { firstName: true, lastName: true, email: true } },
          assignedTo: { select: { name: true } },
          createdBy: { select: { name: true } },
          escalatedUnit: { select: { name: true } },
        },
      })
    : [];
  const hasNext = fetched.length > PAGE_SIZE;
  const cases = fetched.slice(0, PAGE_SIZE);

  const tabs: { key: CaseScope; label: string }[] = [
    { key: "mine", label: "My tickets" },
    { key: "logged", label: "Logged by me" },
    { key: "assigned", label: "Assigned to me" },
    ...(me.teamId || me.unitId || sup ? [{ key: "unit" as const, label: "My team & department" }] : []),
    ...(sup ? [{ key: "all" as const, label: "All cases" }] : []),
  ];

  const base: Record<string, string | undefined> = {
    scope,
    status: searchParams.status,
    q: searchParams.q,
    from: searchParams.from,
    to: searchParams.to,
    group: searchParams.group,
  };
  const href = (o: Record<string, string | undefined>, path = "/cases") => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...o })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const canExport = scope !== "all" || sup;
  const exportHref = href({ page: undefined }, "/api/cases/export");

  const emptyReason =
    !where && scope === "unit"
      ? sup && resolveGroups(filters, ctx, me).length === 0
        ? "Choose a department or team above to see its tickets."
        : "Nothing to show yet: you're not in a department or team, or it has no members. Ask a Super Admin to set this in Users & roles."
      : null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">Cases</h1>
            <p className="text-sm text-ink-950/60 dark:text-surface/60">
              Page {page} · {PAGE_SIZE} per page · newest first
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && where && (
              <a href={exportHref} className="btn-secondary text-xs" title="Download these tickets as an Excel file">
                <Download size={13} /> Download Excel
              </a>
            )}
            {sup && <BatchCloseButton />}
            <Link href="/cases/new" className="btn-primary text-xs">
              <Plus size={13} /> New case
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={href({ scope: t.key, page: undefined, group: undefined })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                scope === t.key
                  ? "bg-brand text-white"
                  : "bg-surface dark:bg-ink-800 text-ink-950/70 dark:text-surface/70 hover:bg-line-light dark:hover:bg-ink-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <form method="GET" className="flex items-center gap-2 flex-wrap">
          <input type="hidden" name="scope" value={scope} />
          {scope === "unit" && sup && (
            <select name="group" defaultValue={searchParams.group ?? ""} className="input !py-1.5 text-xs w-56">
              <option value="">{me.unitId || me.teamId ? "My own department / team" : "Choose department or team…"}</option>
              <optgroup label="Departments">
                {units.map((u) => (
                  <option key={u.id} value={`u:${u.id}`}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Teams">
                {teams.map((x) => (
                  <option key={x.id} value={`t:${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Search case no., subject, customer (3+ letters)"
            className="input !py-1.5 text-xs w-72"
          />
          <select name="status" defaultValue={status} className="input !py-1.5 text-xs w-44">
            <option value="open">Open cases</option>
            <option value="all">All statuses</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <label className="text-xs text-ink-950/50 dark:text-surface/50">From</label>
          <input type="date" name="from" defaultValue={searchParams.from} className="input !py-1.5 text-xs w-36" />
          <label className="text-xs text-ink-950/50 dark:text-surface/50">To</label>
          <input type="date" name="to" defaultValue={searchParams.to} className="input !py-1.5 text-xs w-36" />
          <button type="submit" className="btn-secondary text-xs">
            Apply
          </button>
          {(searchParams.q || searchParams.from || searchParams.to || searchParams.status) && (
            <Link href={href({ q: undefined, from: undefined, to: undefined, status: undefined, page: undefined })} className="text-xs text-brand hover:underline">
              Clear filters
            </Link>
          )}
        </form>
        {canExport && where && (
          <p className="text-[11px] text-ink-950/40 dark:text-surface/40">
            Excel download follows the filters above, covers the dates chosen (default last 30 days, up to 92 days) and up to
            10,000 tickets.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {emptyReason ? (
          <div className="card p-10 text-center text-sm text-ink-950/60 dark:text-surface/60">{emptyReason}</div>
        ) : (
          <>
            <CasesTable cases={JSON.parse(JSON.stringify(cases))} />
            <div className="flex items-center justify-between mt-4 text-xs">
              {page > 1 ? (
                <Link href={href({ page: String(page - 1) })} className="btn-secondary text-xs">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {page >= MAX_PAGE && hasNext ? (
                <span className="text-ink-950/50 dark:text-surface/50">Use search or dates to narrow further.</span>
              ) : hasNext ? (
                <Link href={href({ page: String(page + 1) })} className="btn-secondary text-xs">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
