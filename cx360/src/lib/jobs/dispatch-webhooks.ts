import { prisma } from "@/lib/prisma";
import { deliverWebhook } from "@/lib/webhook";
import { nextRetry } from "./dispatch-notifications";

/**
 * Sends queued webhook deliveries (created by dispatch-events). Same safety
 * rules as the email/SMS queue: leased rows so overlapping runs never double
 * send, retries after 1/5/15/60 minutes, gives up after 5 tries or 24 hours,
 * and stops after ~8 seconds, leaving the rest for the next run.
 * History is kept 14 days (sent) / 30 days (failed) so the table stays small.
 */
const MAX_AGE_MS = 24 * 3_600_000;
const LEASE_MS = 3 * 60_000;
const TIME_BUDGET_MS = 8_000;
const BATCH = 50;
const CONCURRENCY = 6;

export async function runDispatchWebhooks() {
  const started = Date.now();
  let sent = 0, retrying = 0, failed = 0, claimedTotal = 0;
  const subCache = new Map<string, { url: string; secret: string; active: boolean } | null>();
  const getSub = async (id: string) => {
    if (!subCache.has(id)) subCache.set(id, await prisma.webhookSubscription.findUnique({ where: { id }, select: { url: true, secret: true, active: true } }));
    return subCache.get(id)!;
  };

  while (Date.now() - started < TIME_BUDGET_MS) {
    const now = new Date();
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "queued", AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }] },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    if (due.length === 0) break;

    const claimed: typeof due = [];
    for (const row of due) {
      const r = await prisma.webhookDelivery.updateMany({
        where: { id: row.id, status: "queued", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        data: { lockedUntil: new Date(now.getTime() + LEASE_MS) },
      });
      if (r.count === 1) claimed.push(row);
    }
    claimedTotal += claimed.length;
    if (claimed.length === 0) break;

    let i = 0;
    const worker = async () => {
      while (i < claimed.length && Date.now() - started < TIME_BUDGET_MS + 4_000) {
        const row = claimed[i++];
        const at = new Date();
        const sub = await getSub(row.subscriptionId);
        if (!sub || !sub.active) {
          await prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "failed", lockedUntil: null, nextAttemptAt: null, lastError: sub ? "Webhook was paused before this was sent." : "Webhook was deleted." } });
          failed++;
          continue;
        }
        const res = await deliverWebhook(sub.url, sub.secret, row.type, row.payload, row.id);
        const attempts = row.attempts + 1;
        if (res.ok) {
          await prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "sent", sentAt: at, attempts, lockedUntil: null, nextAttemptAt: null, lastHttpStatus: res.status ?? null, lastError: null } });
          sent++;
        } else {
          const expired = at.getTime() - row.createdAt.getTime() > MAX_AGE_MS;
          const retryAt = expired ? null : nextRetry(attempts, at);
          await prisma.webhookDelivery.update({
            where: { id: row.id },
            data: { attempts, lockedUntil: null, lastHttpStatus: res.status ?? null, lastError: (res.error ?? "Failed").slice(0, 500), ...(retryAt ? { nextAttemptAt: retryAt } : { status: "failed", nextAttemptAt: null }) },
          });
          if (retryAt) retrying++; else failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, claimed.length) }, worker));
    if (due.length < BATCH) break;
  }

  // ~1 run in 50: trim old history.
  if (Math.random() < 0.02) {
    await prisma.webhookDelivery.deleteMany({ where: { status: "sent", createdAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } }).catch(() => {});
    await prisma.webhookDelivery.deleteMany({ where: { status: "failed", createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } }).catch(() => {});
  }
  return { claimed: claimedTotal, sent, retrying, failed };
}
