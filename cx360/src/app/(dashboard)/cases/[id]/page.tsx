import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaBadge } from "@/components/cases/sla-badge";
import { CaseActions } from "@/components/cases/case-actions";
import { QaReviewPanel } from "@/components/cases/qa-review-panel";
import { ReuseTicketButton } from "@/components/cases/reuse-ticket-button";
import { CaseTimeline } from "@/components/cases/case-timeline";
import { formatDistanceToNow } from "date-fns";
import { Phone, Mail, MessageSquare, Printer } from "lucide-react";

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
      caseCode: true,
      escalatedUnit: true,
      interactions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!c) notFound();

  const [agents, notes, activity] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { tenantId: ctx.tenantId } } },
      select: { id: true, name: true },
    }),
    prisma.caseNote.findMany({
      where: { caseId: c.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entity: "Case", entityId: c.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // AuditLog.actorId has no FK relation (it's nullable — API-key-created
  // records have no actor), so resolve names with a separate lookup rather
  // than an `include`.
  const actorIds = [...new Set(activity.map((a) => a.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  const timelineItems = [
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      createdAt: n.createdAt.toISOString(),
      authorName: n.author.name,
      body: n.body,
      internal: n.internal,
    })),
    ...activity.map((a) => ({
      kind: "activity" as const,
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actorId ? actorNameById.get(a.actorId) ?? "Someone" : "System",
      action: a.action,
      before: a.before,
      after: a.after,
    })),
  ].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());

  const agentIdList = agents.map((a) => a.id);
  const canReviewQa = ctx.role === "SUPERVISOR" || ctx.role === "ADMIN";
  const qaReviews = await prisma.qaReview.findMany({
    where: {
      caseId: c.id,
      ...(canReviewQa ? {} : { reviewedAgentId: ctx.userId }),
    },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { name: true } }, reviewedAgent: { select: { name: true } } },
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <Link href="/cases" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
          ← All cases
        </Link>
        <div className="flex items-center gap-2">
          {c.status === "CLOSED" && <ReuseTicketButton caseId={c.id} />}
          <a
            href={`/cases/${c.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs"
          >
            <Printer size={13} /> Download PDF
          </a>
        </div>
      </div>

      <div className="flex items-start justify-between mt-2 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-ink-950/40 dark:text-surface/40">{c.caseNumber}</span>
          </div>
          <h1 className="text-xl font-semibold">{c.subject}</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-1">
            <Link href={`/customers/${c.customerId}`} className="hover:text-brand">
              {c.customer.firstName} {c.customer.lastName}
            </Link>
            {" · "}Opened {formatDistanceToNow(c.createdAt, { addSuffix: true })}
            {" · "}{c.type.replace("_", " ").toLowerCase()}
          </p>
          {c.caseCode && (
            <span className="pill-brand mt-2">
              {c.caseCode.category}
              {c.caseCode.subcategory ? ` · ${c.caseCode.subcategory}` : ""}
            </span>
          )}
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

          <CaseTimeline caseId={c.id} items={timelineItems} />
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

          {c.isTransactional && (
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-ink-950/50 dark:text-surface/50 tracking-wide mb-3">
                Transaction details
              </h2>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-ink-950/50 dark:text-surface/50">Amount</span>
                  <span className="font-mono font-medium">
                    {c.transactionCurrency} {c.transactionAmount?.toString()}
                  </span>
                </div>
                {c.escalatedUnit && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-ink-950/50 dark:text-surface/50 shrink-0">Escalated to</span>
                    <span className="text-right">{c.escalatedUnit.name}</span>
                  </div>
                )}
                {c.escalatedAt && (
                  <p className="text-xs text-ink-950/40 dark:text-surface/40 pt-1">
                    Escalation email sent {formatDistanceToNow(c.escalatedAt, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          )}

          <CaseActions
            caseId={c.id}
            status={c.status}
            priority={c.priority}
            assignedToId={c.assignedToId}
            agents={agents}
            currentUserId={ctx.userId}
            canReassignOthers={canReviewQa}
          />

          {(canReviewQa || qaReviews.length > 0) && (
            <QaReviewPanel
              caseId={c.id}
              assignedAgent={c.assignedTo}
              agents={agents}
              initialReviews={JSON.parse(JSON.stringify(qaReviews))}
              canCreate={canReviewQa}
            />
          )}
        </div>
      </div>
    </div>
  );
}
