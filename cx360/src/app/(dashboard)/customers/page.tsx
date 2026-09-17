import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

const PAGE_SIZE = 24;

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const ctx = await requireSession();
  const q = searchParams.q?.trim();
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const where = {
    tenantId: ctx.tenantId,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { _count: { select: { cases: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  const hasNext = page * PAGE_SIZE < total;
  const hasPrev = page > 1;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Customers</h1>
            <p className="text-sm text-ink-950/60 dark:text-surface/60">
              {q ? `${total} result${total === 1 ? "" : "s"} for "${q}"` : `${total} customers total`}
            </p>
          </div>
        </div>
        <form method="GET" className="max-w-sm">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-950/40 dark:text-surface/40" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by name, email, or phone…"
              className="input pl-9"
            />
          </div>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="card p-3.5 hover:border-brand transition-colors flex items-center gap-3"
            >
              <span className="avatar w-9 h-9 text-xs shrink-0">
                {c.firstName[0]}
                {c.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">
                    {c.firstName} {c.lastName}
                  </span>
                  {c.segment && <span className="pill-brand !py-0 shrink-0">{c.segment}</span>}
                </div>
                <p className="text-xs text-ink-950/50 dark:text-surface/50 truncate">
                  {c.email ?? c.phone ?? "No contact on file"}
                </p>
              </div>
              <span className="text-xs text-ink-950/40 dark:text-surface/40 shrink-0">{c._count.cases}</span>
            </Link>
          ))}
          {customers.length === 0 && (
            <p className="col-span-full text-center text-sm text-ink-950/50 dark:text-surface/50 py-12">
              No customers found.
            </p>
          )}
        </div>

        {(hasPrev || hasNext) && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Link
              href={`/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}
              aria-disabled={!hasPrev}
              className={`btn-secondary text-xs ${!hasPrev ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Previous
            </Link>
            <span className="text-xs text-ink-950/50 dark:text-surface/50">Page {page}</span>
            <Link
              href={`/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}
              aria-disabled={!hasNext}
              className={`btn-secondary text-xs ${!hasNext ? "pointer-events-none opacity-40" : ""}`}
            >
              Next →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
