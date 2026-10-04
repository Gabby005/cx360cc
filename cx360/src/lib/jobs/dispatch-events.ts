import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runRulesForEvent } from "@/lib/workflow-engine";

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
 *   3. Queues a WebhookDelivery for every active WebhookSubscription
 *      subscribed to that event type. The dispatch-webhooks job sends them,
 *      signed, with retries — so a down receiver never loses an event.
 *   4. Marks the event dispatched — exactly once per event, so retried
 *      sweeps never double-fire actions or webhooks for the same event.
 *
 * Wire this up the same way as /api/cron/sla-check (Netlify Scheduled
 * Function or external cron), typically every 30-60s.
 */
export async function runDispatchEvents() {
  const events = await prisma.event.findMany({
    where: { dispatched: false },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  let workflowsMatched = 0;
  let webhooksQueued = 0;

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

    // Queue the deliveries and mark the event dispatched together, so a retried sweep never queues twice.
    await prisma.$transaction([
      ...(subs.length
        ? [prisma.webhookDelivery.createMany({ data: subs.map((sub) => ({ tenantId: event.tenantId, subscriptionId: sub.id, eventId: event.id, type: event.type, payload: (event.payload ?? {}) as Prisma.InputJsonValue })) })]
        : []),
      prisma.event.update({ where: { id: event.id }, data: { dispatched: true } }),
    ]);
    webhooksQueued += subs.length;
  }

  return { eventsProcessed: events.length, workflowsMatched, webhooksQueued };
}
