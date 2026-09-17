import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaBadge } from "@/components/cases/sla-badge";
import { formatDistanceToNow } from "date-fns";
import { STATUS_LABEL } from "@/lib/case-status";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      products: true,
      interactions: { orderBy: { createdAt: "desc" }, take: 10 },
      cases: { orderBy: { createdAt: "desc" }, include: { slaPolicy: true } },
      feedback: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!customer) notFound();

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl">
      <Link href="/customers" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← All customers
      </Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60">
            {customer.email ?? "No email"} · {customer.phone ?? "No phone"}
            {customer.segment && ` · ${customer.segment}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {customer.sentimentAvg !== null && <SentimentBadge value={customer.sentimentAvg!} />}
          <Link href={`/cases/new?customerId=${customer.id}`} className="btn-primary text-xs">
            <Plus size={13} /> Log a case
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Cases</h2>
            {customer.cases.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50">No cases on file.</p>
            ) : (
              <ul className="divide-y divide-line-light dark:divide-line-dark">
                {customer.cases.map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                    <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand truncate">
                      {c.subject} <span className="font-mono text-[10px] text-ink-950/40 dark:text-surface/40">{c.caseNumber}</span>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-ink-950/50 dark:text-surface/50">{STATUS_LABEL[c.status] ?? c.status}</span>
                      {c.slaPolicy && (
                        <SlaBadge createdAt={c.createdAt} respondedAt={c.respondedAt} resolvedAt={c.resolvedAt} policy={c.slaPolicy} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Interaction history</h2>
            {customer.interactions.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50">No interactions logged.</p>
            ) : (
              <ul className="space-y-3">
                {customer.interactions.map((i) => (
                  <li key={i.id} className="text-sm border-l-2 border-line-light dark:border-line-dark pl-3">
                    <div className="flex items-center gap-2 text-xs text-ink-950/50 dark:text-surface/50 mb-0.5">
                      <span className="font-mono">{i.channel}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(i.createdAt, { addSuffix: true })}</span>
                    </div>
                    <p className="text-ink-950/80 dark:text-surface/80">{i.summary ?? "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Accounts</h2>
            {customer.products.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50">No accounts on file.</p>
            ) : (
              <ul className="space-y-1 -mx-1">
                {customer.products.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/customers/${customer.id}/accounts/${p.id}`}
                      className="flex items-center justify-between text-sm px-1 py-1.5 rounded-lg hover:bg-surface dark:hover:bg-ink-800 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.productName}</div>
                        <div className="text-xs text-ink-950/50 dark:text-surface/50">{p.accountRef ?? "—"}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-medium">
                          {p.balance != null ? `${p.currency} ${p.balance.toString()}` : "—"}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Recent feedback</h2>
            {customer.feedback.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50">No feedback yet.</p>
            ) : (
              <ul className="space-y-2">
                {customer.feedback.map((f) => (
                  <li key={f.id} className="text-sm flex items-center justify-between">
                    <span className="text-ink-950/70 dark:text-surface/70">{f.comment ?? "No comment"}</span>
                    <span className="font-mono text-xs">{f.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SentimentBadge({ value }: { value: number }) {
  const label = value > 0.2 ? "Positive" : value < -0.2 ? "Negative" : "Neutral";
  const color = value > 0.2 ? "text-sla-ok bg-sla-ok/10" : value < -0.2 ? "text-sla-breach bg-sla-breach/10" : "text-ink-950/60 bg-line-light dark:text-surface/60 dark:bg-ink-800";
  return <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>Sentiment: {label}</span>;
}
