import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { getAccountsForCustomer, getRecentTransactions } from "@/lib/core-banking";

/**
 * Read-only account view — deliberately has no form, no mutation
 * endpoint, no write path of any kind. Browsing balances/transactions
 * here can never change anything on a Case; the only way to affect a
 * case is the "Ticket properties" panel on the case detail page itself.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: { id: string; productId: string };
}) {
  const ctx = await requireSession();

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!customer) notFound();

  const [siblingAccounts, account] = await Promise.all([
    getAccountsForCustomer(prisma, customer.id),
    prisma.customerProduct.findFirst({ where: { id: params.productId, customerId: customer.id } }),
  ]);
  if (!account) notFound();

  const transactions = await getRecentTransactions(prisma, account.id, 10);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <Link
        href={`/customers/${customer.id}`}
        className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand flex items-center gap-1 w-fit"
      >
        <ArrowLeft size={12} /> Back to {customer.firstName} {customer.lastName}
      </Link>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div>
          <h1 className="text-xl font-semibold">{account.productName}</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60">{account.accountRef ?? "No account reference on file"}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold font-mono">
            {account.balance != null ? `${account.currency} ${account.balance.toString()}` : "—"}
          </div>
          <span className="pill-neutral">{account.status}</span>
        </div>
      </div>

      <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mb-6">
        Simulated core banking data — no live Flexcube/T24 connection is configured in this environment. Browsing
        here is read-only and never affects any case.
      </p>

      {siblingAccounts.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {siblingAccounts.map((a) => (
            <Link
              key={a.id}
              href={`/customers/${customer.id}/accounts/${a.id}`}
              className={a.id === account.id ? "pill-brand" : "pill-neutral hover:bg-ink-950/10 dark:hover:bg-surface/20"}
            >
              {a.productName}
            </Link>
          ))}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-4">Last {transactions.length || 10} transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 py-6 text-center">No transaction history.</p>
        ) : (
          <ul className="divide-y divide-line-light dark:divide-line-dark">
            {transactions.map((t) => (
              <li key={t.id} className="py-3 flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
                    t.type === "credit" ? "bg-sla-ok/10 text-sla-ok" : "bg-ink-950/5 dark:bg-surface/10 text-ink-950/60 dark:text-surface/60"
                  }`}
                >
                  {t.type === "credit" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{t.description}</p>
                  <p className="text-xs text-ink-950/40 dark:text-surface/40">
                    {t.transactionDate.toLocaleDateString()}
                  </p>
                </div>
                <span className={`font-mono text-sm font-medium shrink-0 ${t.type === "credit" ? "text-sla-ok" : ""}`}>
                  {t.type === "credit" ? "+" : "-"}
                  {t.currency} {t.amount.toString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
