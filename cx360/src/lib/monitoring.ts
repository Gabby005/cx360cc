import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Error monitoring and job tracking, kept deliberately small:
 *  - recordError() stores each distinct error once and counts repeats, so a
 *    crash loop is one row with a big count, not a million rows.
 *  - runJob() records when each scheduled job last ran and how it went.
 * Neither ever throws — monitoring must never be the thing that breaks the app.
 */

const clean = (s: string | undefined, max: number) => (s ?? "").slice(0, max);
// Strip ids/numbers so the same bug on different cases groups together.
const normalise = (m: string) => m.replace(/[0-9a-f]{8,}/gi, "#").replace(/\d+/g, "#").slice(0, 300);

export async function recordError(
  source: string,
  err: unknown,
  ctx: { path?: string; userId?: string; tenantId?: string } = {}
): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
    const message = clean(e.message, 1000) || "Unknown error";
    const fingerprint = createHash("sha1").update(`${source}|${normalise(message)}|${ctx.path ?? ""}`).digest("hex");
    await prisma.errorLog.upsert({
      where: { fingerprint },
      create: { fingerprint, source: clean(source, 60), message, stack: clean(e.stack, 4000), path: clean(ctx.path, 300) || null, userId: ctx.userId ?? null, tenantId: ctx.tenantId ?? null },
      // A repeat of a resolved error re-opens it, so fixes that didn't hold are noticed.
      update: { count: { increment: 1 }, lastSeenAt: new Date(), resolved: false },
    });
  } catch (inner) {
    console.error("recordError failed", inner, err);
  }
}

/** Runs a job, records the outcome in JobRun, and logs a failure to ErrorLog. Returns the job's summary. */
export async function runJob<T extends Record<string, unknown>>(job: string, fn: () => Promise<T>): Promise<{ ok: boolean; summary?: T; error?: string }> {
  let id: string | null = null;
  try {
    id = (await prisma.jobRun.create({ data: { job }, select: { id: true } })).id;
  } catch (e) {
    console.error("jobRun create failed", e);
  }
  try {
    const summary = await fn();
    if (id) await prisma.jobRun.update({ where: { id }, data: { ok: true, finishedAt: new Date(), summary: clean(JSON.stringify(summary), 1000) } }).catch(() => {});
    pruneJobRuns(job).catch(() => {});
    return { ok: true, summary };
  } catch (err) {
    const msg = (err as Error)?.message ?? "Job failed";
    if (id) await prisma.jobRun.update({ where: { id }, data: { ok: false, finishedAt: new Date(), error: clean(msg, 500) } }).catch(() => {});
    await recordError(`job:${job}`, err);
    return { ok: false, error: msg };
  }
}

// Keep the table small forever: ~1 in 50 runs trims anything older than 7 days.
async function pruneJobRuns(job: string) {
  if (Math.random() > 0.02) return;
  await prisma.jobRun.deleteMany({ where: { job, startedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  await prisma.errorLog.deleteMany({ where: { resolved: true, lastSeenAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
}

/** Constant-time check of the x-cron-secret header. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
