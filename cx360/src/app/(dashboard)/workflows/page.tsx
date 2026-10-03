import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { WorkflowsClient } from "@/components/workflows/workflows-client";
import { SlaEscalationClient } from "@/components/workflows/sla-escalation-client";
import { parseNotificationSettings } from "@/lib/notification-settings";
import { loadTemplates } from "@/lib/notify";
import { deliveryStatus } from "@/lib/delivery-status";
import { Clock, Mail, ScrollText, Timer } from "lucide-react";

const DAY = 86_400_000;
function ago(d: Date) {
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default async function WorkflowsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard"); // Super Admin only
  const t = ctx.tenantId;
  const now = new Date();
  const open = { notIn: ["RESOLVED", "CLOSED"] as ("RESOLVED" | "CLOSED")[] };

  const [rules, tenant, templates, overdue, dueSoon, atLevel1, atLevel2, recent] = await Promise.all([
    prisma.workflowRule.findMany({
      where: { tenantId: t },
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.tenant.findUnique({ where: { id: t }, select: { name: true, notificationSettings: true } }),
    loadTemplates(prisma, t),
    prisma.case.count({ where: { tenantId: t, status: open, resolutionDueAt: { lt: now } } }),
    prisma.case.count({ where: { tenantId: t, status: open, resolutionDueAt: { gte: now, lt: new Date(now.getTime() + 4 * 3_600_000) } } }),
    prisma.case.count({ where: { tenantId: t, status: open, slaEscalationLevel: 1 } }),
    prisma.case.count({ where: { tenantId: t, status: open, slaEscalationLevel: 2 } }),
    prisma.notificationLog.findMany({
      where: { tenantId: t, kind: { in: ["sla.level1.email", "sla.level2.email"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, kind: true, to: true, relatedCaseId: true, createdAt: true },
    }),
  ]);

  const caseIds = [...new Set(recent.map((r) => r.relatedCaseId).filter((x): x is string => !!x))];
  const cases = caseIds.length ? await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, caseNumber: true } }) : [];
  const caseNo = new Map(cases.map((c) => [c.id, c.caseNumber]));

  const settings = parseNotificationSettings(tenant?.notificationSettings);
  const tpl = (k: "sla.level1.email" | "sla.level2.email") => {
    const x = templates.get(k)!;
    return { enabled: true, subject: x.subject ?? "", body: x.body, isCustom: x.isCustom };
  };
  const delivery = deliveryStatus();

  const stats = [
    { label: "Overdue now", value: overdue, tone: overdue > 0 ? "text-sla-breach" : "" },
    { label: "Due in next 4h", value: dueSoon, tone: dueSoon > 0 ? "text-sla-warning" : "" },
    { label: "Manager one told", value: atLevel1, tone: "" },
    { label: "Manager two told", value: atLevel2, tone: "" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1500px]">
      <h1 className="text-lg font-semibold mb-1">Workflows</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">Decide what happens automatically when tickets run late, and when customers should hear from you.</p>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="space-y-8 min-w-0">
          <SlaEscalationClient initial={settings} templates={{ level1: tpl("sla.level1.email"), level2: tpl("sla.level2.email") }} bankName={tenant?.name ?? ""} />
          <WorkflowsClient rules={JSON.parse(JSON.stringify(rules))} canEdit embedded />
        </div>

        <aside className="space-y-5 xl:sticky xl:top-0">
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">SLA right now</h2>
            <div className="grid grid-cols-2 gap-2">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg bg-surface dark:bg-ink-800 px-3 py-3">
                  <div className={`text-xl font-semibold ${s.tone}`}>{s.value}</div>
                  <div className="text-[11px] text-ink-950/50 dark:text-surface/50">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold">Recent escalation emails</h2>
              <Link href="/admin/notifications?tab=log" className="text-xs text-brand hover:underline">View all →</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-ink-950/40 dark:text-surface/40">None yet. They appear here as tickets pass their deadline.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={r.kind === "sla.level2.email" ? "pill-breach" : "pill-warning"}>{r.kind === "sla.level2.email" ? "Level 2" : "Level 1"}</span>
                        {r.relatedCaseId && (
                          <Link href={`/cases/${r.relatedCaseId}`} className="text-brand hover:underline truncate">{caseNo.get(r.relatedCaseId) ?? "ticket"}</Link>
                        )}
                      </div>
                      <div className="text-xs text-ink-950/50 dark:text-surface/50 truncate mt-0.5">to {r.to}</div>
                    </div>
                    <span className="text-xs text-ink-950/40 dark:text-surface/40 shrink-0">{ago(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">What this connects to</h2>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/admin/sla" className="flex items-start gap-2.5 hover:text-brand"><Timer size={15} className="mt-0.5 shrink-0 text-ink-950/40 dark:text-surface/40" /><span><strong className="font-medium">SLA policies</strong><span className="block text-xs text-ink-950/50 dark:text-surface/50">The deadlines that decide when a ticket is late.</span></span></Link></li>
              <li><Link href="/admin/business-hours" className="flex items-start gap-2.5 hover:text-brand"><Clock size={15} className="mt-0.5 shrink-0 text-ink-950/40 dark:text-surface/40" /><span><strong className="font-medium">Business hours & holidays</strong><span className="block text-xs text-ink-950/50 dark:text-surface/50">So the clock only runs while you&apos;re open.</span></span></Link></li>
              <li><Link href="/admin/notifications" className="flex items-start gap-2.5 hover:text-brand"><Mail size={15} className="mt-0.5 shrink-0 text-ink-950/40 dark:text-surface/40" /><span><strong className="font-medium">Notification centre</strong><span className="block text-xs text-ink-950/50 dark:text-surface/50">All message wording, plus the delivery log.</span></span></Link></li>
              <li><Link href="/admin/audit" className="flex items-start gap-2.5 hover:text-brand"><ScrollText size={15} className="mt-0.5 shrink-0 text-ink-950/40 dark:text-surface/40" /><span><strong className="font-medium">Audit log</strong><span className="block text-xs text-ink-950/50 dark:text-surface/50">Every escalation is recorded against the ticket.</span></span></Link></li>
            </ul>
          </div>

          {!delivery.email && (
            <div className="rounded-lg bg-sla-warning/10 border border-sla-warning/30 p-4 text-xs">
              <strong>Emails aren&apos;t being delivered yet.</strong> No email service is connected, so escalation emails are recorded in the Delivery log but not sent. They will go out as soon as the email channel is connected — nothing here needs to change.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
