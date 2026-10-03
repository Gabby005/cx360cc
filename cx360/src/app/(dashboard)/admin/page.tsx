import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { CaseNumberPrefixEditor } from "@/components/admin/case-number-prefix-editor";
import { actionLabel, entityLabel } from "@/lib/audit-query";

const PRIORITY_PILL: Record<string, string> = {
  CRITICAL: "pill-breach",
  HIGH: "pill-warning",
  MEDIUM: "pill-neutral",
  LOW: "pill-neutral",
};
const PRIORITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function ago(d: Date) {
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

function Tile({ title, href, link, children, wide }: { title: string; href: string; link: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? "lg:col-span-2" : ""}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href} className="text-xs text-brand hover:underline">
          {link} →
        </Link>
      </div>
      <div className="card p-4 text-sm text-ink-950/60 dark:text-surface/60">{children}</div>
    </section>
  );
}

export default async function AdminPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = ctx.tenantId;

  const [policies, memberCount, tenant, hasLogo, codeCount, unitCount, teamCount, keyCount, hookCount, recent] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { tenantId: t } }),
    prisma.membership.count({ where: { tenantId: t } }),
    prisma.tenant.findUnique({ where: { id: t }, select: { caseNumberPrefix: true, customerSummaryFields: true, businessHours: true } }),
    prisma.tenant.count({ where: { id: t, logoDataUrl: { not: null } } }),
    prisma.caseCode.count({ where: { tenantId: t, active: true } }),
    prisma.unit.count({ where: { tenantId: t, active: true } }),
    prisma.team.count({ where: { tenantId: t } }),
    prisma.apiKey.count({ where: { tenantId: t, revokedAt: null } }),
    prisma.webhookSubscription.count({ where: { tenantId: t, active: true } }),
    prisma.auditLog.findMany({
      where: { tenantId: t, entity: { notIn: ["Case"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, actorId: true, action: true, entity: true, createdAt: true },
    }),
  ]);

  policies.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const actorIds = [...new Set(recent.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(actors.map((a) => [a.id, a.name]));

  const summaryCount = Array.isArray(tenant?.customerSummaryFields) ? (tenant!.customerSummaryFields as unknown[]).length : 0;

  const checklist = [
    { done: hasLogo > 0, label: "Upload your logo", href: "/admin/branding" },
    { done: codeCount > 0, label: "Add case codes", href: "/admin/case-codes" },
    { done: unitCount > 0, label: "Add departments", href: "/admin/units" },
    { done: teamCount > 0, label: "Create a team", href: "/admin/users" },
    { done: memberCount > 1, label: "Add your agents and supervisors", href: "/admin/users" },
    { done: summaryCount > 0, label: "Choose customer summary fields", href: "/admin/customer-summary" },
    { done: !!tenant?.businessHours, label: "Set business hours & holidays", href: "/admin/business-hours" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  const stats = [
    { label: "People", value: memberCount, href: "/admin/users" },
    { label: "Departments", value: unitCount, href: "/admin/units" },
    { label: "Teams", value: teamCount, href: "/admin/users" },
    { label: "Case codes", value: codeCount, href: "/admin/case-codes" },
    { label: "API keys", value: keyCount, href: "/admin/integrations" },
    { label: "Webhooks", value: hookCount, href: "/admin/integrations" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1600px]">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-lg font-semibold">Admin centre</h1>
        <Link href="/admin/integrations" className="btn-primary text-xs">
          Integration hub <ArrowRight size={14} />
        </Link>
      </div>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Organisation settings, people, SLA targets and the audit log. API keys and webhooks live in the Integration Hub.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-6">
          <section>
            <h2 className="text-sm font-semibold mb-2">Organization</h2>
            <CaseNumberPrefixEditor initialPrefix={tenant?.caseNumberPrefix ?? "CX"} />
          </section>

          <Tile title="Branding" href="/admin/branding" link="Customize">
            Upload your logo and set a brand color — applied across the whole app, including the login page and the browser tab.
          </Tile>

          <Tile title="Users & roles" href="/admin/users" link="Manage users">
            {memberCount} {memberCount === 1 ? "person" : "people"}. Create agents and supervisors, set their team and department, and change roles.
          </Tile>

          <Tile title="Customer summary fields" href="/admin/customer-summary" link="Choose fields">
            Pick the core-banking details agents see on the customer card — BVN, date of birth, address and more.
            {summaryCount > 0 && <span className="block mt-1 text-xs">{summaryCount} field{summaryCount === 1 ? "" : "s"} selected.</span>}
          </Tile>

          <Tile title="Case codes" href="/admin/case-codes" link="Manage case codes">
            The approved category/subcategory codes (e.g. <code className="kbd">E0006</code>) that appear in case numbers. Upload in bulk via CSV or add one at a time.
          </Tile>

          <Tile title="Departments" href="/admin/units" link="Manage departments">
            Department email addresses that cases can be escalated to, and the departments people belong to.
          </Tile>

          <Tile title="SLA policies" href="/admin/sla" link="Edit targets" wide>
            <div className="-m-4 divide-y divide-line-light dark:divide-line-dark">
              {policies.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                  <span className={PRIORITY_PILL[p.priority] ?? "pill-neutral"}>{p.priority}</span>
                  <span className="text-ink-950/60 dark:text-surface/60 font-mono text-xs text-right">
                    {p.responseMinutes}m response / {p.resolutionMinutes}m resolution · warn @{p.warningThresholdPct}% · escalate @{p.escalationThresholdPct}%
                  </span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile title="Business hours & holidays" href="/admin/business-hours" link="Set hours">
            When the bank is open and which days are public holidays, so SLA clocks that count business hours only don&apos;t run overnight or on weekends.
            {!tenant?.businessHours && <span className="block mt-1 text-xs text-sla-warning">Not set yet — SLA clocks run around the clock.</span>}
          </Tile>

          <Tile title="Audit log" href="/admin/audit" link="View log">
            Who changed what, and when — tickets, users and roles, settings, integrations and report downloads. Filter and download to Excel.
          </Tile>

          <Tile title="Notifications" href="/admin/notifications" link="View log">
            Every customer ticket-opened/closed message, department escalation, and SLA-triggered notification the app has attempted to send.
          </Tile>
        </div>

        {/* At a glance */}
        <aside className="space-y-5 xl:sticky xl:top-0">
          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-semibold">Setup checklist</h2>
              <span className="text-xs text-ink-950/50 dark:text-surface/50">
                {doneCount} of {checklist.length} done
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-950/5 dark:bg-surface/10 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-sla-ok" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
            </div>
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-surface dark:hover:bg-ink-800">
                    {c.done ? <CheckCircle2 size={16} className="text-sla-ok shrink-0" /> : <Circle size={16} className="text-ink-950/30 dark:text-surface/30 shrink-0" />}
                    <span className={c.done ? "text-ink-950/50 dark:text-surface/50 line-through" : ""}>{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">At a glance</h2>
            <div className="grid grid-cols-3 gap-2">
              {stats.map((s) => (
                <Link key={s.label} href={s.href} className="rounded-lg bg-surface dark:bg-ink-800 px-2 py-3 text-center hover:ring-1 hover:ring-brand/40">
                  <div className="text-lg font-semibold">{s.value}</div>
                  <div className="text-[11px] text-ink-950/50 dark:text-surface/50">{s.label}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Recent admin activity</h2>
              <Link href="/admin/audit" className="text-xs text-brand hover:underline">
                View all →
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-ink-950/40 dark:text-surface/40">No changes recorded yet. Setup changes you make will appear here.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{actionLabel(r.action)}</div>
                      <div className="text-xs text-ink-950/50 dark:text-surface/50 truncate">
                        {r.actorId ? names.get(r.actorId) ?? "Former user" : "System / API"} · {entityLabel(r.entity)}
                      </div>
                    </div>
                    <span className="text-xs text-ink-950/40 dark:text-surface/40 shrink-0">{ago(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
