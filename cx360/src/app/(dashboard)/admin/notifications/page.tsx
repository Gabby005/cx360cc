import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { parseRange } from "@/lib/analytics-range";
import { DEFAULT_TEMPLATES, TEMPLATE_BY_KEY } from "@/lib/notification-templates";
import { loadTemplates } from "@/lib/notify";
import { getDeliveryStatus } from "@/lib/delivery-status";
import { DeliveryClient } from "@/components/notifications/delivery-client";
import { parseDeliverySettings, secretStatus } from "@/lib/delivery/config";
import { TemplateList } from "@/components/notifications/template-list";
import { CheckCircle2, CircleAlert } from "lucide-react";

const PAGE_SIZE = 50;
const MAX_PAGE = 100;
const TZ = process.env.APP_TIMEZONE || "Africa/Lagos";
const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type SP = { tab?: string; channel?: string; type?: string; status?: string; from?: string; to?: string; page?: string };

const TYPE_FILTERS: { key: string; label: string; kinds?: string[]; prefix?: string }[] = [
  { key: "customer", label: "Customer messages", kinds: DEFAULT_TEMPLATES.filter((t) => t.group === "customer").map((t) => t.key) },
  { key: "department", label: "Department escalations", kinds: DEFAULT_TEMPLATES.filter((t) => t.group === "department").map((t) => t.key) },
  { key: "sla", label: "SLA exceeded (managers)", kinds: DEFAULT_TEMPLATES.filter((t) => t.group === "sla").map((t) => t.key) },
  { key: "test", label: "Tests", prefix: "test." },
];

export default async function NotificationsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = ctx.tenantId;
  const tab = searchParams.tab === "log" ? "log" : searchParams.tab === "delivery" ? "delivery" : "templates";
  const delivery = await getDeliveryStatus(ctx.tenantId);

  const [tenant, templates, last24] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: t }, select: { name: true, deliverySettings: true } }),
    loadTemplates(prisma, t),
    prisma.notificationLog.groupBy({ by: ["channel", "status"], where: { tenantId: t, createdAt: { gte: new Date(Date.now() - 86_400_000) } }, _count: true }),
  ]);

  // ---- Delivery log (only fetched when that tab is open) ----
  let logs: { id: string; channel: string; to: string; cc: string | null; subject: string | null; message: string; kind: string | null; status: string; attempts: number; lastError: string | null; relatedCaseId: string | null; createdAt: Date }[] = [];
  let hasNext = false;
  let caseNo = new Map<string, string>();
  const range = searchParams.from && searchParams.to ? parseRange({ range: "custom", from: searchParams.from, to: searchParams.to }) : parseRange({ range: "7" });
  const page = Math.min(Math.max(parseInt(searchParams.page ?? "1", 10) || 1, 1), MAX_PAGE);

  if (tab === "log") {
    const typeF = TYPE_FILTERS.find((f) => f.key === searchParams.type);
    const rows = await prisma.notificationLog.findMany({
      where: {
        tenantId: t,
        createdAt: { gte: range.start, lt: range.end },
        ...(searchParams.channel === "email" || searchParams.channel === "sms" ? { channel: searchParams.channel } : {}),
        ...(searchParams.status ? { status: searchParams.status } : {}),
        ...(typeF?.kinds ? { kind: { in: typeF.kinds } } : typeF?.prefix ? { kind: { startsWith: typeF.prefix } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: { id: true, channel: true, to: true, cc: true, subject: true, message: true, kind: true, status: true, attempts: true, lastError: true, relatedCaseId: true, createdAt: true },
    });
    hasNext = rows.length > PAGE_SIZE;
    logs = rows.slice(0, PAGE_SIZE);
    const ids = [...new Set(logs.map((l) => l.relatedCaseId).filter((x): x is string => !!x))];
    const cs = ids.length ? await prisma.case.findMany({ where: { id: { in: ids } }, select: { id: true, caseNumber: true } }) : [];
    caseNo = new Map(cs.map((c) => [c.id, c.caseNumber]));
  }

  const deliverySettings = parseDeliverySettings(tenant?.deliverySettings);
  const items = DEFAULT_TEMPLATES.map((def) => {
    const x = templates.get(def.key)!;
    return { def, state: { enabled: x.enabled, subject: x.subject ?? "", body: x.body, isCustom: x.isCustom } };
  });

  const keep: Record<string, string | undefined> = { tab: "log", channel: searchParams.channel, type: searchParams.type, status: searchParams.status, from: range.from, to: range.to };
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...o })) if (v) p.set(k, v);
    return `/admin/notifications?${p.toString()}`;
  };
  const sum = (channel: string, status?: string) => last24.filter((r) => r.channel === channel && (!status || r.status === status)).reduce((n, r) => n + r._count, 0);

  const triggers = [
    { when: "A ticket is logged", then: "Customer gets an email + SMS", href: "/admin/notifications" },
    { when: "A ticket is marked Resolved", then: "Customer gets an email + SMS", href: "/admin/notifications" },
    { when: "A ticket is closed without being resolved first", then: "Customer gets an email + SMS", href: "/admin/notifications" },
    { when: "A ticket is escalated to a department", then: "The department's email is notified", href: "/admin/units" },
    { when: "A ticket exceeds its SLA", then: "Manager one is emailed (Level 1)", href: "/workflows" },
    { when: "Still open after the Level 2 wait", then: "Manager two is emailed, copying the owner and manager one", href: "/workflows" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1500px]">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Notification centre</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-5">Every email and SMS CX360 sends: edit the wording, switch messages on or off, and see exactly what went out.</p>

      <div className="flex gap-1.5 mb-6">
        {[{ k: "templates", l: "Message wording" }, { k: "log", l: "Delivery log" }, { k: "delivery", l: "Delivery settings" }].map((x) => (
          <Link key={x.k} href={x.k === "templates" ? "/admin/notifications" : `/admin/notifications?tab=${x.k}`} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === x.k ? "bg-brand text-white" : "bg-surface dark:bg-ink-800 hover:bg-line-light dark:hover:bg-ink-700"}`}>
            {x.l}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="min-w-0">
          {tab === "templates" ? (
            <TemplateList items={items} bankName={tenant?.name ?? ""} />
          ) : tab === "delivery" ? (
            <DeliveryClient initial={deliverySettings} secrets={secretStatus(deliverySettings)} />
          ) : (
            <>
              <form method="GET" className="flex flex-wrap items-center gap-2 mb-4">
                <input type="hidden" name="tab" value="log" />
                <input type="date" name="from" defaultValue={range.from} className="input !py-1.5 text-xs w-36" />
                <span className="text-xs text-ink-950/50 dark:text-surface/50">to</span>
                <input type="date" name="to" defaultValue={range.to} className="input !py-1.5 text-xs w-36" />
                <select name="channel" defaultValue={searchParams.channel ?? ""} className="input !py-1.5 text-xs w-32">
                  <option value="">Email + SMS</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
                <select name="type" defaultValue={searchParams.type ?? ""} className="input !py-1.5 text-xs w-48">
                  <option value="">All message types</option>
                  {TYPE_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select name="status" defaultValue={searchParams.status ?? ""} className="input !py-1.5 text-xs w-32">
                  <option value="">Any status</option>
                  <option value="queued">Queued</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                </select>
                <button type="submit" className="btn-secondary text-xs">Apply</button>
                <Link href="/admin/notifications?tab=log" className="text-xs text-brand hover:underline">Reset</Link>
              </form>

              <div className="card divide-y divide-line-light dark:divide-line-dark">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="pill-neutral font-mono !py-0.5">{log.channel}</span>
                        <span className="text-xs font-medium">{log.kind ? (TEMPLATE_BY_KEY.get(log.kind)?.label ?? (log.kind.startsWith("test.") ? "Test message" : log.kind)) : "Message"}</span>
                        <span className={log.status === "sent" ? "pill-ok !py-0.5" : log.status === "failed" ? "pill-breach !py-0.5" : "pill-neutral !py-0.5"}>{log.status}</span>
                        {log.attempts > 0 && log.status !== "sent" && <span className="text-[11px] text-ink-950/40 dark:text-surface/40">tried {log.attempts}×</span>}
                      </div>
                      <span className="text-xs text-ink-950/40 dark:text-surface/40 shrink-0">{when.format(log.createdAt)}</span>
                    </div>
                    <p className="text-xs text-ink-950/60 dark:text-surface/60">To: {log.to}{log.cc ? ` · Cc: ${log.cc}` : ""}</p>
                    {log.lastError && log.status !== "sent" && <p className="text-xs text-sla-breach mt-0.5">{log.lastError}</p>}
                    {log.subject && <p className="text-sm font-medium mt-0.5">{log.subject}</p>}
                    <p className="text-sm text-ink-950/70 dark:text-surface/70 whitespace-pre-wrap line-clamp-3">{log.message}</p>
                    {log.relatedCaseId && (
                      <Link href={`/cases/${log.relatedCaseId}`} className="text-xs text-brand hover:underline">Ticket {caseNo.get(log.relatedCaseId) ?? ""} →</Link>
                    )}
                  </div>
                ))}
                {logs.length === 0 && <p className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">Nothing in this period. Log a ticket, or use &ldquo;Send me a test&rdquo; on a message, to see one appear.</p>}
              </div>

              <div className="flex items-center justify-between mt-4">
                {page > 1 ? <Link href={href({ page: String(page - 1) })} className="btn-secondary text-xs">← Newer</Link> : <span />}
                {hasNext && page < MAX_PAGE ? <Link href={href({ page: String(page + 1) })} className="btn-secondary text-xs">Older →</Link> : <span />}
              </div>
            </>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-0">
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">Delivery</h2>
            <ul className="space-y-2 text-sm">
              {([["Email", delivery.email], ["SMS", delivery.sms]] as const).map(([name, on]) => (
                <li key={name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {on ? <CheckCircle2 size={16} className="text-sla-ok" /> : <CircleAlert size={16} className="text-sla-warning" />}
                    {name}
                  </span>
                  <span className={on ? "pill-ok" : "pill-warning"}>{on ? "Connected" : "Not connected"}</span>
                </li>
              ))}
            </ul>
            {(!delivery.email || !delivery.sms) && (
              <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-3">
                Until a channel is connected, its messages wait in the queue (up to 24 hours) and go out as soon as it is. <Link href="/admin/notifications?tab=delivery" className="text-brand hover:underline">Connect it →</Link>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-lg bg-surface dark:bg-ink-800 px-3 py-2"><div className="text-lg font-semibold">{sum("email")}</div><div className="text-[11px] text-ink-950/50 dark:text-surface/50">Emails, last 24h</div></div>
              <div className="rounded-lg bg-surface dark:bg-ink-800 px-3 py-2"><div className="text-lg font-semibold">{sum("sms")}</div><div className="text-[11px] text-ink-950/50 dark:text-surface/50">SMS, last 24h</div></div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">What triggers what</h2>
            <ul className="space-y-3">
              {triggers.map((x) => (
                <li key={x.when} className="text-sm">
                  <Link href={x.href} className="hover:text-brand">
                    <div className="font-medium">{x.when}</div>
                    <div className="text-xs text-ink-950/50 dark:text-surface/50">→ {x.then}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
