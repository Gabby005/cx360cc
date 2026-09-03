import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runRulesForEvent } from "@/lib/workflow-engine";
import { deliverWebhook } from "@/lib/webhook";

/**
 * Event dispatcher — the other half of the outbox pattern started in the
 * Case/Customer route handlers, which write an Event row in the same
 * transaction as the state change instead of calling out synchronously.
 *
 * Each sweep:
 *   1. Picks up undispatched Events (oldest first, capped per run so a
 *      backlog can't make one invocation run forever on a serverless
 *      function's time budget).
 *   2. Runs any matching WorkflowRule for that event (see workflow-engine.ts).
 *   3. Delivers the event to any WebhookSubscription subscribed to that
 *      event type, signing the payload with the subscription's secret.
 *   4. Marks the event dispatched — exactly once per event, so retried
 *      sweeps never double-fire actions or webhooks for the same event.
 *
 * Wire this up the same way as /api/cron/sla-check (Netlify Scheduled
 * Function or external cron), typically every 30-60s.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.event.findMany({
    where: { dispatched: false },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  let workflowsMatched = 0;
  let webhooksDelivered = 0;
  let webhooksFailed = 0;

  for (const event of events) {
    const { rulesMatched } = await runRulesForEvent(prisma, {
      id: event.id,
      tenantId: event.tenantId,
      type: event.type,
      payload: event.payload,
    });
    workflowsMatched += rulesMatched;

    const subs = await prisma.webhookSubscription.findMany({
      where: { tenantId: event.tenantId, active: true, events: { has: event.type } },
    });

    for (const sub of subs) {
      const result = await deliverWebhook(sub.url, sub.secret, event.type, event.payload);
      if (result.ok) webhooksDelivered++;
      else webhooksFailed++;
    }

    await prisma.event.update({ where: { id: event.id }, data: { dispatched: true } });
  }

  return NextResponse.json({
    eventsProcessed: events.length,
    workflowsMatched,
    webhooksDelivered,
    webhooksFailed,
  });
}
