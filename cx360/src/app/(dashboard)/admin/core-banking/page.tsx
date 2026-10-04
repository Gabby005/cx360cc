import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { coreSecretStatus, parseCoreSettings } from "@/lib/core-banking/config";
import { CoreBankingClient } from "@/components/admin/core-banking-client";

export const dynamic = "force-dynamic";

export default async function CoreBankingPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { coreBankingSettings: true } });
  const settings = parseCoreSettings(t?.coreBankingSettings);
  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1100px]">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Core banking</h1>
      <div className="mt-4"><CoreBankingClient initial={settings} secrets={coreSecretStatus(settings)} /></div>
    </div>
  );
}
