import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { parseRange } from "@/lib/analytics-range";
import { ACTION_LABELS, ENTITY_LABELS, actionLabel, entityLabel, buildAuditWhere, describeChange } from "@/lib/audit-query";

const PAGE_SIZE = 50;
const MAX_PAGE = 100;
const TZ = process.env.APP_TIMEZONE || "Africa/Lagos";
const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type SP = { from?: string; to?: string; action?: string; entity?: string; actor?: string; page?: string };

export default async function AuditLogPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  // Always date-bounded (default: last 7 days, max 92) so the page stays fast however large the log grows.
  const range =
    searchParams.from && searchParams.to
      ? parseRange({ range: "custom", from: searchParams.from, to: searchParams.to })
      : parseRange({ range: "7" });
  const page = Math.min(Math.max(parseInt(searchParams.page ?? "1", 10) || 1, 1), MAX_PAGE);
  const where = buildAuditWhere(ctx.tenantId, searchParams, range);

  const [rows, members] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: { id: true, actorId: true, action: true, entity: true, entityId: true, before: true, after: true, createdAt: true },
    }),
    prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const names = new Map(members.map((m) => [m.user.id, m.user.name]));

  const keep: Record<string, string | undefined> = { from: range.from, to: range.to, action: searchParams.action, entity: searchParams.entity, actor: searchParams.actor };
  const href = (o: Record<string, string | undefined>, path = "/admin/audit") => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...o })) if (v) p.set(k, v);
    return `${path}?${p.toString()}`;
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-6xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <div className="flex items-center justify-between gap-3 mt-2 mb-1 flex-wrap">
        <h1 className="text-lg font-semibold">Audit log</h1>
        <a href={href({ page: undefined }, "/api/admin/audit/export")} className="btn-secondary text-xs">
          <Download size={13} /> Download Excel
        </a>
      </div>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-4">
        Who did what, and when — ticket changes, user and role changes, settings, integrations and report downloads. Showing {range.from} to {range.to}.
      </p>

      <form method="GET" className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs text-ink-950/50 dark:text-surface/50">From</label>
        <input type="date" name="from" defaultValue={range.from} className="input !py-1.5 text-xs w-36" />
        <label className="text-xs text-ink-950/50 dark:text-surface/50">To</label>
        <input type="date" name="to" defaultValue={range.to} className="input !py-1.5 text-xs w-36" />
        <select name="actor" defaultValue={searchParams.actor ?? ""} className="input !py-1.5 text-xs w-44">
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </select>
        <select name="entity" defaultValue={searchParams.entity ?? ""} className="input !py-1.5 text-xs w-44">
          <option value="">Everything</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={searchParams.action ?? ""} className="input !py-1.5 text-xs w-52">
          <option value="">Any action</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary text-xs">
          Apply
        </button>
        {(searchParams.action || searchParams.entity || searchParams.actor || searchParams.from) && (
          <Link href="/admin/audit" className="text-xs text-brand hover:underline">
            Reset
          </Link>
        )}
      </form>

      <div className="card overflow-x-auto">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">Nothing recorded for these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-950/50 dark:text-surface/50 text-left border-b border-line-light dark:border-line-dark">
                <th className="font-medium px-4 py-3 whitespace-nowrap">When</th>
                <th className="font-medium px-3 py-3">Who</th>
                <th className="font-medium px-3 py-3">Action</th>
                <th className="font-medium px-3 py-3">On</th>
                <th className="font-medium px-3 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line-light/60 dark:border-line-dark/60 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-950/60 dark:text-surface/60">{when.format(r.createdAt)}</td>
                  <td className="px-3 py-3">{r.actorId ? names.get(r.actorId) ?? "Former user" : <span className="text-ink-950/40 dark:text-surface/40">System / API</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{actionLabel(r.action)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.entity === "Case" ? (
                      <Link href={`/cases/${r.entityId}`} className="text-brand hover:underline">
                        Ticket
                      </Link>
                    ) : (
                      entityLabel(r.entity)
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-950/60 dark:text-surface/60 break-words max-w-md">{describeChange(r.before, r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        {page > 1 ? (
          <Link href={href({ page: String(page - 1) })} className="btn-secondary text-xs">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        {hasNext && page < MAX_PAGE ? (
          <Link href={href({ page: String(page + 1) })} className="btn-secondary text-xs">
            Older →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
