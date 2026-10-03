import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { SlaPoliciesClient } from "@/components/admin/sla-policies-client";
import { parseBusinessHours } from "@/lib/business-hours";

const ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default async function SlaPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const [policies, tenant] = await Promise.all([
    prisma.slaPolicy.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, priority: true, responseMinutes: true, resolutionMinutes: true, warningThresholdPct: true, escalationThresholdPct: true, businessHoursOnly: true },
    }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { businessHours: true } }),
  ]);
  policies.sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority));

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">SLA policies</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        How quickly each priority must get a first response and be resolved. Changes apply straight away to the countdowns on open tickets and to
        every new ticket. Tickets already reported on keep the due date they were given.
      </p>
      <SlaPoliciesClient initial={policies} hasBusinessHours={!!parseBusinessHours(tenant?.businessHours)} />
    </div>
  );
}
