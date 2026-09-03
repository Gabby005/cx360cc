import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaBadge } from "@/components/cases/sla-badge";
import { CaseActions } from "@/components/cases/case-actions";
import { formatDistanceToNow } from "date-fns";

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const c = await prisma.case.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      customer: true,
      assignedTo: { select: { id: true, name: true } },
      slaPolicy: true,
      interactions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!c) notFound();

  const agents = await prisma.user.findMany({
    where: { memberships: { some: { tenantId: ctx.tenantId } } },
    select: { id: true, name: true },
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl">
      <Link href="/cases" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← All cases
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold">{c.subject}</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-1">
            <Link href={`/customers/${c.customerId}`} className="hover:text-brand">
              {c.customer.firstName} {c.customer.lastName}
            </Link>
            {" · "}Opened {formatDistanceToNow(c.createdAt, { addSuffix: true })}
            {" · "}{c.type.replace("_", " ").toLowerCase()}
          </p>
        </div>
        {c.slaPolicy && (
          <SlaBadge createdAt={c.createdAt} respondedAt={c.respondedAt} resolvedAt={c.resolvedAt} policy={c.slaPolicy} />
        )}
      </div>

      <CaseActions caseId={c.id} status={c.status} priority={c.priority} assignedToId={c.assignedToId} agents={agents} />

      {c.description && (
        <div className="card p-4 mt-4">
          <h2 className="text-sm font-semibold mb-2">Description</h2>
          <p className="text-sm text-ink-950/80 dark:text-surface/80 whitespace-pre-wrap">{c.description}</p>
        </div>
      )}

      <div className="card p-4 mt-4">
        <h2 className="text-sm font-semibold mb-3">Interaction history</h2>
        {c.interactions.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50">No interactions logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {c.interactions.map((i) => (
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
      </div>
    </div>
  );
}
