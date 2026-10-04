import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { ApiKeysPanel, WebhooksPanel, ResendButton } from "@/components/admin/integrations-client";
import { EVENT_CATALOG } from "@/lib/event-catalog";
import { getDeliveryStatus } from "@/lib/delivery-status";
import { CheckCircle2, CircleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "Africa/Lagos";
const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TABS = [
  { k: "overview", l: "Overview" },
  { k: "keys", l: "API keys" },
  { k: "webhooks", l: "Webhooks" },
  { k: "deliveries", l: "Deliveries" },
  { k: "connectors", l: "Connectors" },
  { k: "docs", l: "API reference" },
] as const;
type Tab = (typeof TABS)[number]["k"];

export default async function IntegrationsPage({ searchParams }: { searchParams: { tab?: string; status?: string } }) {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = ctx.tenantId;
  const tab: Tab = TABS.some((x) => x.k === searchParams.tab) ? (searchParams.tab as Tab) : "overview";
  const day = new Date(Date.now() - 86_400_000);

  const [keys, webhooks, delivery, stats] = await Promise.all([
    prisma.apiKey.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, scopes: true, lastUsedAt: true, createdAt: true, revokedAt: true } }),
    prisma.webhookSubscription.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } }),
    getDeliveryStatus(t),
    prisma.webhookDelivery.groupBy({ by: ["subscriptionId", "status"], where: { tenantId: t, createdAt: { gte: day } }, _count: true }),
  ]);
  const count = (sub: string | null, status: string) => stats.filter((s) => (!sub || s.subscriptionId === sub) && s.status === status).reduce((n, s) => n + s._count, 0);
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const staleKeys = activeKeys.filter((k) => !k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 90 * 86_400_000);
  const failing = count(null, "failed");
  const queued = count(null, "queued");

  let deliveries: { id: string; subscriptionId: string; type: string; status: string; attempts: number; lastHttpStatus: number | null; lastError: string | null; createdAt: Date }[] = [];
  if (tab === "deliveries") {
    deliveries = await prisma.webhookDelivery.findMany({
      where: { tenantId: t, ...(searchParams.status ? { status: searchParams.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, subscriptionId: true, type: true, status: true, attempts: true, lastHttpStatus: true, lastError: true, createdAt: true },
    });
  }
  const urlOf = new Map(webhooks.map((w) => [w.id, w.url]));
  const base = process.env.NEXTAUTH_URL || "https://YOUR-SITE.netlify.app";

  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1100px]">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Integration hub</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-5">Connect CX360 to the bank&apos;s other systems — core banking, telephony, dashboards — safely and with a record of everything that went out.</p>

      <div className="flex gap-1.5 mb-6 flex-wrap">
        {TABS.map((x) => (
          <Link key={x.k} href={`/admin/integrations?tab=${x.k}`} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === x.k ? "bg-brand text-white" : "bg-surface dark:bg-ink-800 hover:bg-line-light dark:hover:bg-ink-700"}`}>{x.l}{x.k === "deliveries" && failing > 0 ? ` (${failing})` : ""}</Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: "Active API keys", v: activeKeys.length, href: "keys", bad: false },
              { l: "Active webhooks", v: webhooks.filter((w) => w.active).length, href: "webhooks", bad: false },
              { l: "Webhook sends failing (24h)", v: failing, href: "deliveries&status=failed", bad: failing > 0 },
              { l: "Waiting to send", v: queued, href: "deliveries&status=queued", bad: false },
            ].map((x) => (
              <Link key={x.l} href={`/admin/integrations?tab=${x.href}`} className="card p-4 hover:ring-1 hover:ring-brand/40">
                <div className={`text-2xl font-semibold ${x.bad ? "text-sla-breach" : ""}`}>{x.v}</div>
                <div className="text-xs text-ink-950/50 dark:text-surface/50">{x.l}</div>
              </Link>
            ))}
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3">Things to look at</h2>
            <ul className="space-y-2 text-sm">
              {[
                { ok: delivery.sms, text: delivery.sms ? "Bank SMS gateway is connected." : "Bank SMS gateway isn't connected yet — customers won't get SMS.", href: "/admin/notifications?tab=delivery" },
                { ok: delivery.email, text: delivery.email ? "Email is connected." : "Email isn't connected yet — customers and managers won't get emails.", href: "/admin/notifications?tab=delivery" },
                { ok: failing === 0, text: failing === 0 ? "No webhook deliveries are failing." : `${failing} webhook deliveries failed in the last 24 hours.`, href: "/admin/integrations?tab=deliveries&status=failed" },
                { ok: staleKeys.length === 0, text: staleKeys.length === 0 ? "No unused API keys." : `${staleKeys.length} API key${staleKeys.length === 1 ? " hasn't" : "s haven't"} been used in 90 days — revoke ${staleKeys.length === 1 ? "it" : "them"} if no longer needed.`, href: "/admin/integrations?tab=keys" },
              ].map((r) => (
                <li key={r.text}>
                  <Link href={r.href} className="flex items-start gap-2 hover:text-brand">
                    {r.ok ? <CheckCircle2 size={16} className="text-sla-ok mt-0.5 shrink-0" /> : <CircleAlert size={16} className="text-sla-warning mt-0.5 shrink-0" />}
                    {r.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "keys" && <ApiKeysPanel initialKeys={JSON.parse(JSON.stringify(keys))} />}

      {tab === "webhooks" && (
        <WebhooksPanel initialWebhooks={JSON.parse(JSON.stringify(webhooks.map((w) => ({ ...w, secret: `${w.secret.slice(0, 6)}${"•".repeat(10)}`, failed24: count(w.id, "failed"), sent24: count(w.id, "sent") }))))} />
      )}

      {tab === "deliveries" && (
        <section>
          <div className="flex gap-2 mb-3 text-xs">
            {[["", "All"], ["queued", "Waiting"], ["sent", "Delivered"], ["failed", "Failed"]].map(([v, l]) => (
              <Link key={v} href={`/admin/integrations?tab=deliveries${v ? `&status=${v}` : ""}`} className={`px-3 py-1 rounded-full ${(searchParams.status ?? "") === v ? "bg-brand text-white" : "bg-surface dark:bg-ink-800"}`}>{l}</Link>
            ))}
          </div>
          <div className="card divide-y divide-line-light dark:divide-line-dark">
            {deliveries.map((d) => (
              <div key={d.id} className="p-3 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{d.type}</span>
                    <span className={d.status === "sent" ? "pill-ok !py-0.5" : d.status === "failed" ? "pill-breach !py-0.5" : "pill-neutral !py-0.5"}>{d.status === "queued" ? "waiting" : d.status}</span>
                    {d.lastHttpStatus ? <span className="text-[11px] text-ink-950/40 dark:text-surface/40">HTTP {d.lastHttpStatus}</span> : null}
                    {d.attempts > 0 && d.status !== "sent" && <span className="text-[11px] text-ink-950/40 dark:text-surface/40">tried {d.attempts}×</span>}
                  </div>
                  <p className="text-xs text-ink-950/50 dark:text-surface/50 truncate">{urlOf.get(d.subscriptionId) ?? "(deleted webhook)"} · {when.format(d.createdAt)}</p>
                  {d.lastError && d.status !== "sent" && <p className="text-xs text-sla-breach mt-0.5">{d.lastError}</p>}
                </div>
                {d.status !== "queued" && urlOf.has(d.subscriptionId) && <ResendButton id={d.id} />}
              </div>
            ))}
            {deliveries.length === 0 && <p className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">Nothing here yet. Deliveries appear when events happen (a ticket is logged, an SLA is breached…) and a webhook is listening.</p>}
          </div>
          <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-2">Latest 100 shown. Delivered history is kept 14 days, failed 30 days.</p>
        </section>
      )}

      {tab === "connectors" && (
        <section className="space-y-3">
          {[
            { name: "Bank SMS gateway", note: "Customer and agent SMS through the bank's own gateway.", status: delivery.sms ? "Connected" : "Not connected", ok: delivery.sms, href: "/admin/notifications?tab=delivery" },
            { name: "Email (Microsoft 365 or bank gateway)", note: "Customer notices and SLA escalation emails.", status: delivery.email ? "Connected" : "Not connected", ok: delivery.email, href: "/admin/notifications?tab=delivery" },
            { name: "REST API", note: "Other systems create and look up tickets and customers.", status: `${activeKeys.length} key${activeKeys.length === 1 ? "" : "s"}`, ok: activeKeys.length > 0, href: "/admin/integrations?tab=keys" },
            { name: "Webhooks", note: "CX360 pushes events to other systems (core banking, BI, telephony).", status: `${webhooks.filter((w) => w.active).length} active`, ok: webhooks.some((w) => w.active), href: "/admin/integrations?tab=webhooks" },
          ].map((c) => (
            <Link key={c.name} href={c.href} className="card p-4 flex items-center justify-between gap-3 hover:ring-1 hover:ring-brand/40">
              <div><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-ink-950/50 dark:text-surface/50">{c.note}</div></div>
              <span className={c.ok ? "pill-ok" : "pill-warning"}>{c.status}</span>
            </Link>
          ))}
          <h2 className="text-sm font-semibold pt-3">Planned channels</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {[["Inbound email → tickets", "Customers email in, a ticket opens"], ["WhatsApp Business", "Two-way customer chat"], ["Voice / telephony", "Call logging and click-to-call"], ["Core banking lookup", "Live balances and transactions on the customer card"]].map(([n, d]) => (
              <div key={n} className="card p-3 flex items-center justify-between gap-2 text-sm"><div><div className="font-medium">{n}</div><div className="text-xs text-ink-950/50 dark:text-surface/50">{d}</div></div><span className="pill-neutral shrink-0">Planned</span></div>
            ))}
          </div>
          <p className="text-xs text-ink-950/50 dark:text-surface/50">Until these are built, any of them can already talk to CX360 through the REST API and webhooks above.</p>
        </section>
      )}

      {tab === "docs" && (
        <section className="space-y-6 text-sm">
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Calling the API</h2>
            <p className="text-ink-950/60 dark:text-surface/60">Send your key in the <code className="kbd">X-API-Key</code> header. Keys with <b>read</b> permission can look things up; <b>write</b> permission is needed to create.</p>
            <Code>{`curl ${base}/api/v1/cases?status=OPEN&limit=25 \\\n  -H "X-API-Key: cx360_xxxxxxxx"`}</Code>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-950/50 dark:text-surface/50"><th className="py-1 pr-3">Endpoint</th><th className="pr-3">Needs</th><th>What it does</th></tr></thead>
              <tbody className="font-mono">
                {[["GET /api/v1/cases", "read", "List tickets (status, limit up to 100)"], ["GET /api/v1/cases/{id}", "read", "One ticket"], ["POST /api/v1/cases", "write", "Log a ticket for an existing customer"], ["GET /api/v1/customers", "read", "Search customers"], ["GET /api/v1/customers/{id}", "read", "One customer"], ["POST /api/v1/customers", "write", "Create a customer"]].map(([e, n, d]) => (
                  <tr key={e} className="border-t border-line-light dark:border-line-dark"><td className="py-1.5 pr-3">{e}</td><td className="pr-3">{n}</td><td className="font-sans">{d}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-950/50 dark:text-surface/50">Errors come back as <code className="kbd">{`{"error": "..."}`}</code> with status 400 (bad input), 401 (missing/invalid key), 403 (key lacks permission) or 404.</p>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Receiving webhooks</h2>
            <p className="text-ink-950/60 dark:text-surface/60">Each event is POSTed as JSON. Answer with any <b>2xx</b> status within 8 seconds; otherwise CX360 retries after 1, 5, 15 and 60 minutes, then marks it failed. The same event can arrive twice, so use the <code className="kbd">id</code> to ignore repeats.</p>
            <Code>{`POST /your/endpoint\nX-CX360-Event: case.created\nX-CX360-Delivery: <id>\nX-CX360-Signature: <hmac-sha256 hex of the raw body>\n\n{"id":"<id>","type":"case.created","payload":{...},"sentAt":"2026-10-04T08:00:00.000Z"}`}</Code>
            <p className="text-ink-950/60 dark:text-surface/60">Check the signature before trusting a message (use the raw request body, not re-serialised JSON):</p>
            <Code>{`// Node.js\nconst crypto = require("crypto");\nconst expected = crypto.createHmac("sha256", process.env.CX360_WEBHOOK_SECRET)\n  .update(rawBody).digest("hex");\nconst ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));\n\n# Python\nimport hmac, hashlib\nexpected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()\nok = hmac.compare_digest(expected, signature_header)`}</Code>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-3">Events</h2>
            <div className="divide-y divide-line-light dark:divide-line-dark">
              {EVENT_CATALOG.map((e) => (
                <div key={e.type} className="py-2.5">
                  <div className="flex items-center gap-2"><code className="kbd">{e.type}</code><span className="text-xs text-ink-950/50 dark:text-surface/50">{e.description}</span></div>
                  <pre className="text-[11px] font-mono mt-1 bg-surface dark:bg-ink-800 rounded p-2 overflow-x-auto">{JSON.stringify(e.sample)}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="text-[11px] font-mono bg-surface dark:bg-ink-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{children}</pre>;
}
