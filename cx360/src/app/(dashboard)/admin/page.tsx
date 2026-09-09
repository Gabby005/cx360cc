import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { ArrowRight } from "lucide-react";
import { CaseNumberPrefixEditor } from "@/components/admin/case-number-prefix-editor";

const PRIORITY_PILL: Record<string, string> = {
  CRITICAL: "pill-breach",
  HIGH: "pill-warning",
  MEDIUM: "pill-neutral",
  LOW: "pill-neutral",
};

export default async function AdminPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const [policies, memberCount, tenant] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { priority: "desc" } }),
    prisma.membership.count({ where: { tenantId: ctx.tenantId } }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { caseNumberPrefix: true } }),
  ]);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold">Admin centre</h1>
        <Link href="/admin/integrations" className="btn-primary text-xs">
          Integration hub <ArrowRight size={14} />
        </Link>
      </div>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        SLA policy shown below is live. Notification templates and full audit log viewer are Phase 2 — API keys and
        webhooks live in the Integration Hub.
      </p>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">Organization</h2>
        <CaseNumberPrefixEditor initialPrefix={tenant?.caseNumberPrefix ?? "CX"} />
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">SLA policies</h2>
        <div className="card divide-y divide-line-light dark:divide-line-dark">
          {policies.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between text-sm">
              <span className={PRIORITY_PILL[p.priority] ?? "pill-neutral"}>{p.priority}</span>
              <span className="text-ink-950/60 dark:text-surface/60 font-mono text-xs">
                {p.responseMinutes}m response / {p.resolutionMinutes}m resolution · warn @{p.warningThresholdPct}% · escalate @{p.escalationThresholdPct}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Users &amp; roles</h2>
          <Link href="/admin/users" className="text-xs text-brand hover:underline">
            Manage users →
          </Link>
        </div>
        <div className="card p-4 text-sm text-ink-950/60 dark:text-surface/60">
          {memberCount} {memberCount === 1 ? "person" : "people"} on this team. Create agents/supervisors, and
          promote or demote roles, from the Manage users page.
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Case codes</h2>
          <Link href="/admin/case-codes" className="text-xs text-brand hover:underline">
            Manage case codes →
          </Link>
        </div>
        <div className="card p-4 text-sm text-ink-950/60 dark:text-surface/60">
          The approved category/subcategory codes (e.g. <code className="kbd">E0006</code>) that appear in case
          numbers. Upload in bulk via CSV or add one at a time.
        </div>
      </section>
    </div>
  );
}
