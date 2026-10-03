import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { DEFAULT_BUSINESS_HOURS, parseBusinessHours } from "@/lib/business-hours";
import { BusinessHoursClient } from "@/components/admin/business-hours-client";

const FALLBACK_ZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "UTC"];

export default async function BusinessHoursPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { businessHours: true } });
  const saved = parseBusinessHours(t?.businessHours);

  let zones = FALLBACK_ZONES;
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all?.length) zones = [...new Set([...FALLBACK_ZONES.slice(0, 1), ...all])];
  } catch {
    /* keep fallback list */
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Business hours & holidays</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        When the bank is open. SLA policies set to <strong>business hours only</strong> count time only inside these hours — nights, weekends and the holidays
        below don&apos;t eat into a ticket&apos;s deadline. Policies not set to business hours keep running around the clock.
      </p>
      <BusinessHoursClient initial={saved ?? DEFAULT_BUSINESS_HOURS} configured={!!saved} zones={zones} />
    </div>
  );
}
