import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { NewCaseForm } from "@/components/cases/new-case-form";

export default async function NewCasePage({ searchParams }: { searchParams: { customerId?: string } }) {
  const ctx = await requireSession();

  const preselectedCustomer = searchParams.customerId
    ? await prisma.customer.findFirst({
        where: { id: searchParams.customerId, tenantId: ctx.tenantId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      })
    : null;

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <Link href="/cases" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← All cases
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Log a new case</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        For complaints, requests, and enquiries raised directly with an agent — not just ones that arrived through
        the Inbox.
      </p>

      <NewCaseForm preselectedCustomer={preselectedCustomer} />
    </div>
  );
}
