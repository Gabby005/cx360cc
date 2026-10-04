import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { JOBS, type JobName } from "@/lib/jobs";
import { RunNowButton, ResolveButton } from "@/components/admin/system-client";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "Africa/Lagos";
const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const STALE_MIN: Record<JobName, number> = { "sla-check": 10, "dispatch-events": 5, "dispatch-notifications": 5 };

function ago(d: Date) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function SystemPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = ctx.tenantId;

  const names = Object.keys(JOBS) as JobName[];
  const [lastRuns, errors, queued, failed24, sent24, oldest] = await Promise.all([
    Promise.all(names.map((job) => prisma.jobRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" } }))),
    prisma.errorLog.findMany({ orderBy: [{ resolved: "asc" }, { lastSeenAt: "desc" }], take: 30 }),
    prisma.notificationLog.count({ where: { tenantId: t, status: "queued" } }),
    prisma.notificationLog.count({ where: { tenantId: t, status: "failed", createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.notificationLog.count({ where: { tenantId: t, status: "sent", createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.notificationLog.findFirst({ where: { tenantId: t, status: "queued" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const openErrors = errors.filter((e) => !e.resolved).length;

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1200px]">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">System health</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">Are the background jobs running, is email/SMS going out, and has anything crashed?</p>

      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-2">Background jobs</h2>
        <div className="card divide-y divide-line-light dark:divide-line-dark">
          {names.map((job, i) => {
            const r = lastRuns[i];
            const stale = !r || Date.now() - r.startedAt.getTime() > STALE_MIN[job] * 60_000;
            const pill = !r ? "pill-warning" : !r.ok ? "pill-breach" : stale ? "pill-warning" : "pill-ok";
            const label = !r ? "Never run" : !r.ok ? "Last run failed" : stale ? "Overdue" : "Healthy";
            return (
              <div key={job} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium">{JOBS[job].label}</span><span className={pill}>{label}</span></div>
                  <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-0.5">Scheduled {JOBS[job].every}{r ? ` · last ran ${when.format(r.startedAt)} (${ago(r.startedAt)})` : ""}</p>
                  {r?.summary && r.ok && <p className="text-xs font-mono text-ink-950/50 dark:text-surface/50 mt-0.5 break-all">{r.summary}</p>}
                  {r?.error && <p className="text-xs text-sla-breach mt-0.5">{r.error}</p>}
                </div>
                <RunNowButton job={job} />
              </div>
            );
          })}
        </div>
        {lastRuns.some((r) => !r) && <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-2">&ldquo;Never run&rdquo; right after the first deploy is normal for a minute or two. If it stays, check that <code className="kbd">CRON_SECRET</code> is set in Netlify and the site has been redeployed.</p>}
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-2">Email &amp; SMS queue</h2>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          {[{ l: "Waiting to send", v: queued, bad: queued > 50 }, { l: "Sent, last 24h", v: sent24, bad: false }, { l: "Failed, last 24h", v: failed24, bad: failed24 > 0 }].map((x) => (
            <Link key={x.l} href="/admin/notifications?tab=log" className="card p-3 hover:ring-1 hover:ring-brand/40">
              <div className={`text-xl font-semibold ${x.bad ? "text-sla-breach" : ""}`}>{x.v}</div>
              <div className="text-[11px] text-ink-950/50 dark:text-surface/50">{x.l}</div>
            </Link>
          ))}
        </div>
        {oldest && Date.now() - oldest.createdAt.getTime() > 15 * 60_000 && (
          <p className="text-xs text-sla-warning mt-2">The oldest waiting message is {ago(oldest.createdAt)}. Either no gateway is connected yet or the gateway is failing — see <Link href="/admin/notifications?tab=delivery" className="underline">Delivery settings</Link>.</p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold">Errors</h2>
          <span className="text-xs text-ink-950/50 dark:text-surface/50">{openErrors} open</span>
        </div>
        <div className="card divide-y divide-line-light dark:divide-line-dark">
          {errors.map((e) => (
            <details key={e.id} className={`p-4 ${e.resolved ? "opacity-60" : ""}`}>
              <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="pill-neutral font-mono !py-0.5">{e.source}</span>
                    {e.count > 1 && <span className="text-[11px] text-ink-950/50 dark:text-surface/50">× {e.count}</span>}
                    {e.resolved && <span className="pill-ok !py-0.5">resolved</span>}
                  </div>
                  <p className="text-sm mt-1 break-words">{e.message}</p>
                  <p className="text-[11px] text-ink-950/40 dark:text-surface/40 mt-0.5">Last {when.format(e.lastSeenAt)}{e.path ? ` · ${e.path}` : ""}</p>
                </div>
                <ResolveButton id={e.id} resolved={e.resolved} />
              </summary>
              {e.stack && <pre className="mt-3 text-[11px] bg-surface dark:bg-ink-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{e.stack}</pre>}
            </details>
          ))}
          {errors.length === 0 && <p className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">No errors recorded. 🎉</p>}
        </div>
      </section>
    </div>
  );
}
