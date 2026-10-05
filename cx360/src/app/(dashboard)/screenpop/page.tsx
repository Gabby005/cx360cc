import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { phoneKey } from "@/lib/channels/text";

export const dynamic = "force-dynamic";

/**
 * Screen pop for the phone system. Avaya (or any softphone/CTI) opens
 *   https://<your-app>/screenpop?ani=<caller number>
 * when a call is answered. The agent sees who is calling and their history.
 */
export default async function ScreenPop({ searchParams }: { searchParams: { ani?: string; number?: string } }) {
  const ctx = await requireSession();
  const raw = (searchParams.ani ?? searchParams.number ?? "").trim();
  const key = phoneKey(raw);

  const ids = key.length >= 7
    ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE "tenantId" = ${ctx.tenantId} AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${key} LIMIT 10`
    : [];
  const customers = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids.map((i) => i.id) }, tenantId: ctx.tenantId },
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true, segment: true,
          cases: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, caseNumber: true, subject: true, status: true, createdAt: true } },
          interactions: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, channel: true, direction: true, summary: true, createdAt: true } },
        },
      })
    : [];

  const box = "rounded-lg border border-ink-950/10 dark:border-surface/10 p-4 bg-white dark:bg-ink-900";
  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <h1 className="text-lg font-semibold">Incoming call{raw ? ` · ${raw}` : ""}</h1>
      {!raw && <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-2">No caller number was passed. The phone system should open this page as <code>/screenpop?ani=&lt;number&gt;</code>.</p>}

      {raw && customers.length === 0 && (
        <div className={`${box} mt-4`}>
          <p className="text-sm font-medium">Unknown caller</p>
          <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-1">No customer has this number yet.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/customers" className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">Search customers</Link>
            <Link href="/cases/new" className="text-sm px-3 py-1.5 rounded-md border border-ink-950/15 dark:border-surface/15">Log a case anyway</Link>
          </div>
        </div>
      )}

      {customers.length > 1 && <p className="text-sm text-amber-700 dark:text-amber-400 mt-3">{customers.length} customers share this number — pick the right one.</p>}

      {customers.map((c) => (
        <div key={c.id} className={`${box} mt-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href={`/customers/${c.id}`} className="font-semibold hover:text-brand">{c.firstName} {c.lastName}</Link>
              <p className="text-xs text-ink-950/60 dark:text-surface/60">{[c.segment, c.phone, c.email].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/cases/new?customerId=${c.id}`} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">Log case</Link>
              <Link href={`/customers/${c.id}`} className="text-sm px-3 py-1.5 rounded-md border border-ink-950/15 dark:border-surface/15">Open profile</Link>
            </div>
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-950/50 dark:text-surface/50 mt-4 mb-1">Recent cases</h2>
          {c.cases.length === 0 ? <p className="text-sm text-ink-950/50 dark:text-surface/50">None</p> : (
            <ul className="text-sm space-y-1">
              {c.cases.map((k) => (
                <li key={k.id}><Link href={`/cases/${k.id}`} className="hover:text-brand">{k.caseNumber}</Link> — {k.subject} <span className="text-xs text-ink-950/50 dark:text-surface/50">({k.status.replace(/_/g, " ").toLowerCase()}, {formatDistanceToNow(k.createdAt, { addSuffix: true })})</span></li>
              ))}
            </ul>
          )}
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-950/50 dark:text-surface/50 mt-4 mb-1">Recent contacts</h2>
          {c.interactions.length === 0 ? <p className="text-sm text-ink-950/50 dark:text-surface/50">None</p> : (
            <ul className="text-sm space-y-1">
              {c.interactions.map((i) => (
                <li key={i.id}><span className="text-xs uppercase text-ink-950/50 dark:text-surface/50">{i.channel.toLowerCase()} {i.direction === "outbound" ? "out" : "in"}</span> {(i.summary ?? "").slice(0, 120)} <span className="text-xs text-ink-950/50 dark:text-surface/50">· {formatDistanceToNow(i.createdAt, { addSuffix: true })}</span></li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
