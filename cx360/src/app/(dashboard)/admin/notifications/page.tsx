import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export default async function NotificationsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const logs = await prisma.notificationLog.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Notifications</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Every customer notification, unit escalation, and SLA-triggered message the app has attempted to send —
        ticket-opened/closed emails and SMS, transactional escalations, and workflow-rule notifications. No email or
        SMS provider is configured in this environment, so everything below is logged rather than actually
        delivered — status stays <span className="pill-neutral !py-0.5">logged</span> until credentials (SendGrid,
        Twilio, etc.) are wired into <code className="kbd">src/lib/notifications.ts</code>.
      </p>

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {logs.map((log) => (
          <div key={log.id} className="p-4 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="pill-neutral font-mono !py-0.5">{log.channel}</span>
              <span className="text-xs text-ink-950/40 dark:text-surface/40">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-ink-950/60 dark:text-surface/60 mb-0.5">To: {log.to}</p>
            {log.subject && <p className="text-sm font-medium">{log.subject}</p>}
            <p className="text-sm text-ink-950/70 dark:text-surface/70 whitespace-pre-wrap">{log.message}</p>
            {log.relatedCaseId && (
              <Link href={`/cases/${log.relatedCaseId}`} className="text-xs text-brand hover:underline">
                View related case →
              </Link>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <p className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">
            No notifications logged yet — create or close a case to see one appear here.
          </p>
        )}
      </div>
    </div>
  );
}
