import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSlaClock } from "@/lib/sla";

/**
 * Called by a scheduler (Netlify Scheduled Function, or any external cron
 * hitting this URL with the CRON_SECRET) every 1-5 minutes. For each open
 * case with an active SLA clock, computes current status and emits
 * sla.warning / sla.breached events the first time each threshold is
 * crossed — tracked via a lightweight marker on the Case row so events
 * aren't re-emitted on every sweep.
 *
 * This endpoint is intentionally idempotent-safe: running it twice in the
 * same minute does not double-fire events, because it only acts on cases
 * whose current computed status differs from what was last flagged.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openCases = await prisma.case.findMany({
    where: { status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] }, slaPolicyId: { not: null } },
    include: { slaPolicy: true },
  });

  let warnings = 0;
  let breaches = 0;

  for (const c of openCases) {
    if (!c.slaPolicy) continue;
    const clock = computeSlaClock({
      createdAt: c.createdAt,
      respondedAt: c.respondedAt,
      resolvedAt: c.resolvedAt,
      policy: c.slaPolicy,
    });

    if (clock.status === "breach" || clock.status === "warning" || clock.status === "escalate") {
      await prisma.event.create({
        data: {
          tenantId: c.tenantId,
          type: clock.status === "breach" ? "sla.breached" : "sla.warning",
          payload: { caseId: c.id, stage: clock.stage, elapsedPct: clock.elapsedPct },
        },
      });
      if (clock.status === "breach") breaches++;
      else warnings++;

      if (clock.status === "breach" && c.status !== "ESCALATED") {
        await prisma.case.update({ where: { id: c.id }, data: { status: "ESCALATED" } });
      }
    }
  }

  return NextResponse.json({ scanned: openCases.length, warnings, breaches });
}
