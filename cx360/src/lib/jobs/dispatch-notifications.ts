import { prisma } from "@/lib/prisma";
import { deliver, parseDeliverySettings, connected, type DeliverySettings } from "@/lib/delivery";
import { parseChannelSettings } from "@/lib/channels/config";
import { sendMeta } from "@/lib/channels/meta";
import { sendX } from "@/lib/channels/x";
import { getXAccessToken } from "@/lib/channels/token-store";

/**
 * Delivers queued email/SMS (NotificationLog rows) through the bank's own
 * gateways. Safe to run every minute:
 *  - each row is "leased" for a few minutes while being sent, so two
 *    overlapping runs never send the same message twice;
 *  - failures retry after 1, 5, 15 and 60 minutes, then are marked failed;
 *  - if no gateway is connected yet, messages simply wait (up to 24 hours);
 *  - one run stops after ~8 seconds and leaves the rest for the next run.
 */
export const RETRY_MINUTES = [1, 5, 15, 60];
export const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 24 * 3_600_000;
const LEASE_MS = 3 * 60_000;
const TIME_BUDGET_MS = 8_000;
const BATCH = 100;
const CONCURRENCY = 8;
const WAIT_NO_GATEWAY_MS = 10 * 60_000;

export function nextRetry(attemptsSoFar: number, now: Date): Date | null {
  if (attemptsSoFar >= MAX_ATTEMPTS) return null;
  const mins = RETRY_MINUTES[Math.min(attemptsSoFar - 1, RETRY_MINUTES.length - 1)] ?? 60;
  return new Date(now.getTime() + mins * 60_000);
}

const splitList = (s: string | null) => (s ? s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean) : []);

export async function runDispatchNotifications() {
  const started = Date.now();
  const settingsByTenant = new Map<string, DeliverySettings>();
  const settingsFor = async (tenantId: string) => {
    let s = settingsByTenant.get(tenantId);
    if (!s) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { deliverySettings: true } });
      s = parseDeliverySettings(t?.deliverySettings);
      settingsByTenant.set(tenantId, s);
    }
    return s;
  };

  const channelsByTenant = new Map<string, unknown>();
  const tenantChannels = async (tenantId: string) => {
    if (!channelsByTenant.has(tenantId)) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { channelSettings: true } });
      channelsByTenant.set(tenantId, t?.channelSettings ?? null);
    }
    return channelsByTenant.get(tenantId);
  };

  let sent = 0, failed = 0, retrying = 0, waiting = 0, claimedTotal = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const now = new Date();
    const due = await prisma.notificationLog.findMany({
      where: { status: "queued", AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }] },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    if (due.length === 0) break;

    // Claim each row; only the run that wins the claim sends it.
    const claimed: typeof due = [];
    for (const row of due) {
      const r = await prisma.notificationLog.updateMany({
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
        const settings = await settingsFor(row.tenantId);
        const isMeta = row.channel === "whatsapp" || row.channel === "instagram" || row.channel === "messenger" || row.channel === "x";
        const channelCfg = row.channel === "sms" ? settings.sms : settings.email;
        const expired = at.getTime() - row.createdAt.getTime() > MAX_AGE_MS;

        if (!isMeta && !connected(channelCfg)) {
          if (expired) {
            await prisma.notificationLog.update({ where: { id: row.id }, data: { status: "skipped", lockedUntil: null, lastError: "No gateway was connected within 24 hours." } });
            failed++;
          } else {
            await prisma.notificationLog.update({ where: { id: row.id }, data: { lockedUntil: null, nextAttemptAt: new Date(at.getTime() + WAIT_NO_GATEWAY_MS), lastError: "Waiting — no gateway connected yet." } });
            waiting++;
          }
          continue;
        }

        const res = row.channel === "x"
          ? await (async () => { const t = await getXAccessToken(row.tenantId); return t.ok ? sendX(t.token, row.to, row.message) : { ok: false, error: t.error }; })()
          : isMeta
          ? await sendMeta(row.channel as "whatsapp" | "instagram" | "messenger", { to: row.to, message: row.message, phoneNumberId: parseChannelSettings((await tenantChannels(row.tenantId))).whatsapp.phoneNumberId })
          : await deliver(settings, {
              channel: row.channel === "sms" ? "sms" : "email",
              to: row.to,
              cc: splitList(row.cc),
              subject: row.subject ?? undefined,
              message: row.message,
            });

        if (res.ok) {
          await prisma.notificationLog.update({ where: { id: row.id }, data: { status: "sent", sentAt: at, attempts: row.attempts + 1, lockedUntil: null, nextAttemptAt: null, lastError: null } });
          sent++;
        } else {
          const attempts = row.attempts + 1;
          const retryAt = expired ? null : nextRetry(attempts, at);
          if (retryAt) {
            await prisma.notificationLog.update({ where: { id: row.id }, data: { attempts, lockedUntil: null, nextAttemptAt: retryAt, lastError: (res.error ?? "Failed").slice(0, 500) } });
            retrying++;
          } else {
            await prisma.notificationLog.update({ where: { id: row.id }, data: { status: "failed", attempts, lockedUntil: null, nextAttemptAt: null, lastError: (res.error ?? "Failed").slice(0, 500) } });
            failed++;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, claimed.length) }, worker));
    if (due.length < BATCH) break;
  }

  return { claimed: claimedTotal, sent, retrying, failed, waiting };
}
