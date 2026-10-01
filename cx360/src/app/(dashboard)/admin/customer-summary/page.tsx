import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { parseSummaryFields } from "@/lib/customer-summary";
import { CustomerSummaryClient } from "@/components/admin/customer-summary-client";

export default async function CustomerSummaryAdminPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { customerSummaryFields: true } });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Customer summary fields</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Choose the extra customer details agents see on the summary card when logging a case — for example BVN, date of
        birth and address — as available from core banking (Flexcube). Changes apply straight away.
      </p>
      <CustomerSummaryClient initialFields={parseSummaryFields(tenant?.customerSummaryFields)} />
    </div>
  );
}
