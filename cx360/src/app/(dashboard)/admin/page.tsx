import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export default async function AdminPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const [policies, members] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { priority: "desc" } }),
    prisma.membership.findMany({ where: { tenantId: ctx.tenantId }, include: { user: true } }),
  ]);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">Admin centre</h1>
        <Link
          href="/admin/integrations"
          className="text-xs px-3 py-1.5 rounded bg-brand text-white font-medium hover:bg-brand-dark"
        >
          Integration hub →
        </Link>
      </div>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        SLA policy and user/role config shown below are live. Notification templates and full audit log viewer are
        Phase 2 — API keys and webhooks live in the Integration Hub.
      </p>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">SLA policies</h2>
        <div className="card divide-y divide-line-light dark:divide-line-dark">
          {policies.map((p) => (
            <div key={p.id} className="p-3 flex items-center justify-between text-sm">
              <span className="font-medium">{p.priority}</span>
              <span className="text-ink-950/60 dark:text-surface/60 font-mono text-xs">
                {p.responseMinutes}m response / {p.resolutionMinutes}m resolution · warn @{p.warningThresholdPct}% · escalate @{p.escalationThresholdPct}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Users &amp; roles</h2>
        <div className="card divide-y divide-line-light dark:divide-line-dark">
          {members.map((m) => (
            <div key={m.id} className="p-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{m.user.name}</div>
                <div className="text-xs text-ink-950/50 dark:text-surface/50">{m.user.email}</div>
              </div>
              <span className="pill-neutral">{m.role}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
