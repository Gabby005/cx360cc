import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSlaClock } from "@/lib/sla";
import { parseBusinessHours, type BusinessHours } from "@/lib/business-hours";

// Never pre-rendered; always runs on demand.
export const dynamic = "force-dynamic";

const BATCH = 500; // cases read per round trip
const MAX_SCAN = 5000; // cases examined per run, so one run always finishes quickly; the next run continues

/**
 * Called by a scheduler (Netlify Scheduled Function, or any external cron
 * hitting this URL with the CRON_SECRET) every 1-5 minutes. For each open
 * case with an SLA clock it works out the current level (warning, escalate,
 * breach) and emits sla.warning / sla.breached ONCE per stage and level.
 *
 * "Once" is tracked in Case.slaLastFlag ("response:warning",
 * "resolution:breach", ...). A case is only acted on when its level changes,
 * so running the sweep every minute no longer creates a new event every
 * minute, and cases that have already reached their final level
 * ("resolution:breach") are skipped by the query entirely.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where = {
    status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] as ("NEW" | "OPEN" | "PENDING_CUSTOMER" | "PENDING_BANK" | "PENDING_THIRD_PARTY" | "ESCALATED")[] },
    slaPolicyId: { not: null },
    OR: [{ slaLastFlag: null }, { slaLastFlag: { not: "resolution:breach" } }],
  };

  let scanned = 0;
  let warnings = 0;
  let breaches = 0;
  let cursor: string | undefined;
  const hoursByTenant = new Map<string, BusinessHours | null>();
  async function hoursFor(tenantId: string) {
    if (!hoursByTenant.has(tenantId)) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessHours: true } });
      hoursByTenant.set(tenantId, parseBusinessHours(t?.businessHours));
    }
    return hoursByTenant.get(tenantId)!;
  }

  while (scanned < MAX_SCAN) {
    const rows = await prisma.case.findMany({
      where,
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        resolvedAt: true,
        slaLastFlag: true,
        slaPolicy: { select: { responseMinutes: true, resolutionMinutes: true, warningThresholdPct: true, escalationThresholdPct: true, businessHoursOnly: true } },
      },
    });
    if (rows.length === 0) break;

    const events: { tenantId: string; type: string; payload: { caseId: string; stage: string; level: string; elapsedPct: number } }[] = [];
    const flagGroups = new Map<string, string[]>();
    const escalateIds: string[] = [];

    for (const c of rows) {
      if (!c.slaPolicy) continue;
      const businessHours = c.slaPolicy.businessHoursOnly ? await hoursFor(c.tenantId) : null;
      const clock = computeSlaClock({ createdAt: c.createdAt, respondedAt: c.respondedAt, resolvedAt: c.resolvedAt, policy: c.slaPolicy, businessHours });
      if (clock.status === "ok") continue;

      const flag = `${clock.stage}:${clock.status}`;
      if (flag === c.slaLastFlag) continue; // already announced at this level

      const breached = clock.status === "breach";
      events.push({ tenantId: c.tenantId, type: breached ? "sla.breached" : "sla.warning", payload: { caseId: c.id, stage: clock.stage, level: clock.status, elapsedPct: clock.elapsedPct } });
      flagGroups.set(flag, [...(flagGroups.get(flag) ?? []), c.id]);
      if (breached) {
        breaches++;
        if (c.status !== "ESCALATED") escalateIds.push(c.id);
      } else {
        warnings++;
      }
    }

    if (events.length > 0) {
      await prisma.$transaction([
        prisma.event.createMany({ data: events }),
        ...[...flagGroups.entries()].map(([flag, ids]) => prisma.case.updateMany({ where: { id: { in: ids } }, data: { slaLastFlag: flag } })),
        ...(escalateIds.length ? [prisma.case.updateMany({ where: { id: { in: escalateIds } }, data: { status: "ESCALATED" } })] : []),
      ]);
    }

    scanned += rows.length;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return NextResponse.json({ scanned, warnings, breaches });
}
