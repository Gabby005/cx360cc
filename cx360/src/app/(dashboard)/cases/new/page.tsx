import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { NewCaseForm } from "@/components/cases/new-case-form";

export default async function NewCasePage({ searchParams }: { searchParams: { customerId?: string; reuseFrom?: string } }) {
  const ctx = await requireSession();

  // "Reuse this ticket": start from a closed ticket of the same customer, so nothing has to be searched or retyped.
  const old = searchParams.reuseFrom
    ? await prisma.case.findFirst({
        where: { id: searchParams.reuseFrom, tenantId: ctx.tenantId },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          interactions: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, channel: true, direction: true, summary: true, createdAt: true } },
        },
      })
    : null;
  const reuse = old
    ? {
        id: old.id,
        caseNumber: old.caseNumber,
        status: old.status,
        closedAt: old.closedAt ? old.closedAt.toISOString() : null,
        subject: old.subject,
        description: old.description ?? "",
        type: old.type,
        priority: old.priority,
        caseCodeId: old.caseCodeId ?? "",
        isTransactional: old.isTransactional,
        amount: old.transactionAmount != null ? String(old.transactionAmount) : "",
        currency: old.transactionCurrency ?? "",
        interactions: old.interactions.map((i) => ({ id: i.id, channel: i.channel, direction: i.direction, summary: i.summary, createdAt: i.createdAt.toISOString() })).reverse(),
      }
    : null;

  const preselectedCustomer = old
    ? old.customer
    : searchParams.customerId
    ? await prisma.customer.findFirst({
        where: { id: searchParams.customerId, tenantId: ctx.tenantId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      })
    : null;

  return (
    <div className="h-full overflow-y-auto p-6 max-w-[1900px]">
      <Link href="/cases" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← All cases
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Log a new case</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6 max-w-2xl">
        For complaints, requests, and enquiries raised directly with an agent — not just ones that arrived through
        the Inbox.
      </p>

      <NewCaseForm preselectedCustomer={preselectedCustomer} reuse={reuse} />
    </div>
  );
}
