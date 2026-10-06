import { prisma } from "@/lib/prisma";

/**
 * Daily housekeeping so the database stays small however long the system
 * runs: old job history, fixed errors, delivered webhooks and sent
 * notifications are removed. Cases, customers, interactions, audit trail and
 * surveys are never touched. Each delete is capped so one run stays quick.
 */
const DAY = 86_400_000;
const CAP = 20_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function purge(model: "jobRun" | "errorLog" | "webhookDelivery" | "notificationLog", where: Record<string, unknown>): Promise<number> {
  // Deleting by id keeps each statement bounded even on a very large table.
  const rows = await (prisma[model] as unknown as { findMany: (a: unknown) => Promise<{ id: string }[]> }).findMany({ where, select: { id: true }, take: CAP });
  if (rows.length === 0) return 0;
  const r = await (prisma[model] as unknown as { deleteMany: (a: unknown) => Promise<{ count: number }> }).deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
  return r.count;
}

export async function runDataCleanup() {
  const jobRuns = await purge("jobRun", { startedAt: { lt: ago(30) } });
  const errors = await purge("errorLog", { OR: [{ resolved: true, lastSeenAt: { lt: ago(30) } }, { lastSeenAt: { lt: ago(90) } }] });
  const webhooks = await purge("webhookDelivery", { status: { in: ["sent", "failed"] }, createdAt: { lt: ago(30) } });
  const notifications = await purge("notificationLog", { status: { in: ["sent", "failed", "skipped"] }, createdAt: { lt: ago(90) } });
  return { jobRuns, errors, webhooks, notifications };
}
