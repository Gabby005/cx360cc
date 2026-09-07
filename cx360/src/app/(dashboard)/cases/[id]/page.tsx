import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaBadge } from "@/components/cases/sla-badge";
import { CaseActions } from "@/components/cases/case-actions";
import { formatDistanceToNow } from "date-fns";
import { Phone, Mail, MessageSquare } from "lucide-react";

const CHANNEL_ICON: Record<string, typeof Phone> = {
  VOICE: Phone,
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageSquare,
  CHAT: MessageSquare,
  PORTAL: MessageSquare,
  SOCIAL: MessageSquare,
};

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
    <div className="h-full overflow-y-auto p-6">
      <Link href="/cases" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← All cases
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6 gap-4">
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

      <div className="flex flex-col lg:flex-row gap-4 max-w-5xl">
        <div className="flex-1 min-w-0 space-y-4">
          {c.description && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-2">Description</h2>
              <p className="text-sm text-ink-950/80 dark:text-surface/80 whitespace-pre-wrap leading-relaxed">
                {c.description}
              </p>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4">Interaction history</h2>
            {c.interactions.length === 0 ? (
              <p className="text-sm text-ink-950/50 dark:text-surface/50 py-6 text-center">
                No interactions logged yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {c.interactions.map((i) => {
                  const Icon = CHANNEL_ICON[i.channel] ?? MessageSquare;
                  return (
                    <li key={i.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-light dark:bg-brand/15 text-brand-dark dark:text-brand grid place-items-center shrink-0">
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1 pb-1 border-b border-line-light dark:border-line-dark last:border-0">
                        <div className="flex items-center gap-2 text-xs text-ink-950/50 dark:text-surface/50 mb-1">
                          <span className="pill-neutral font-mono !py-0.5">{i.channel}</span>
                          <span>{formatDistanceToNow(i.createdAt, { addSuffix: true })}</span>
                        </div>
                        <p className="text-sm text-ink-950/80 dark:text-surface/80">{i.summary ?? "—"}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0 space-y-4">
          <div className="card p-4">
            <h2 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 tracking-wide mb-3">
              Customer
            </h2>
            <Link href={`/customers/${c.customerId}`} className="flex items-center gap-3 group">
              <span className="avatar w-10 h-10 text-sm">
                {c.customer.firstName[0]}
                {c.customer.lastName[0]}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium group-hover:text-brand truncate">
                  {c.customer.firstName} {c.customer.lastName}
                </div>
                <div className="text-xs text-ink-950/50 dark:text-surface/50 truncate">
                  {c.customer.email ?? c.customer.phone ?? "No contact on file"}
                </div>
              </div>
            </Link>
            {c.customer.segment && <span className="pill-brand mt-3">{c.customer.segment}</span>}
          </div>

          <CaseActions caseId={c.id} status={c.status} priority={c.priority} assignedToId={c.assignedToId} agents={agents} />
        </div>
      </div>
    </div>
  );
}
