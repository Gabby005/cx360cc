import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { UnitsClient } from "@/components/admin/units-client";

export default async function UnitsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const units = await prisma.unit.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Units</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Departments that transactional cases can be escalated to. When an agent marks a case transactional and
        picks a unit, submitting the case emails that unit automatically. Upload a CSV (columns:{" "}
        <code className="kbd">name,email</code>) or add units one at a time.
      </p>

      <UnitsClient initialUnits={JSON.parse(JSON.stringify(units))} />
    </div>
  );
}
