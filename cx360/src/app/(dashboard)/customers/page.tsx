import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await requireSession();
  const q = searchParams.q?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { cases: true } } },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-line-light dark:border-line-dark">
        <h1 className="text-lg font-semibold">Customers</h1>
        <p className="text-sm text-ink-950/60 dark:text-surface/60">
          {q ? `${customers.length} results for "${q}"` : `${customers.length} customers`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {customers.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className="card p-4 hover:border-brand transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">
                {c.firstName} {c.lastName}
              </span>
              {c.segment && (
                <span className="pill-brand">{c.segment}</span>
              )}
            </div>
            <p className="text-xs text-ink-950/50 dark:text-surface/50">{c.email ?? c.phone ?? "No contact on file"}</p>
            <p className="text-xs text-ink-950/40 dark:text-surface/40 mt-2">{c._count.cases} case(s)</p>
          </Link>
        ))}
        {customers.length === 0 && (
          <p className="col-span-full text-center text-sm text-ink-950/50 dark:text-surface/50 py-12">
            No customers found.
          </p>
        )}
      </div>
    </div>
  );
}
