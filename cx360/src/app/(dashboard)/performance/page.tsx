import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export default async function PerformancePage() {
  const ctx = await requireSession();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));

  const [open, pending, resolvedToday, resolvedTotal, reviews] = await Promise.all([
    prisma.case.count({
      where: { tenantId: ctx.tenantId, assignedToId: ctx.userId, status: { in: ["NEW", "OPEN", "ESCALATED"] } },
    }),
    prisma.case.count({
      where: { tenantId: ctx.tenantId, assignedToId: ctx.userId, status: "PENDING_CUSTOMER" },
    }),
    prisma.case.count({
      where: { tenantId: ctx.tenantId, assignedToId: ctx.userId, resolvedAt: { gte: startOfDay } },
    }),
    prisma.case.count({
      where: { tenantId: ctx.tenantId, assignedToId: ctx.userId, status: { in: ["RESOLVED", "CLOSED"] } },
    }),
    // Every QA review ever written about this person, across every case —
    // not just the one they happen to be looking at. This is the whole
    // point of a personal performance view: feedback shouldn't be
    // something an agent has to stumble onto case-by-case.
    prisma.qaReview.findMany({
      where: { reviewedAgentId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: {
        reviewer: { select: { name: true } },
        case: { select: { id: true, subject: true } },
      },
      take: 50,
    }),
  ]);

  const avgScore =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.overallScore, 0) / reviews.length : null;

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">My performance</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Your own case load and every QA review written about your work.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Metric label="Open" value={open} />
        <Metric label="Pending" value={pending} />
        <Metric label="Resolved today" value={resolvedToday} accent="ok" />
        <Metric label="Total resolved" value={resolvedTotal} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">QA reviews</h2>
          {avgScore !== null && <span className="pill-brand font-mono">Avg {avgScore.toFixed(1)}/5</span>}
        </div>

        {reviews.length === 0 ? (
          <p className="text-sm text-ink-950/50 dark:text-surface/50 py-8 text-center">
            No QA reviews yet. Once a supervisor reviews one of your cases, it'll show up here.
          </p>
        ) : (
          <ul className="space-y-4 divide-y divide-line-light dark:divide-line-dark">
            {reviews.map((r) => (
              <li key={r.id} className={r !== reviews[0] ? "pt-4" : ""}>
                <div className="flex items-center justify-between mb-1">
                  <Link href={`/cases/${r.case.id}`} className="text-sm font-medium hover:text-brand truncate">
                    {r.case.subject}
                  </Link>
                  <span className="pill-brand font-mono shrink-0">{r.overallScore.toFixed(1)}/5</span>
                </div>
                <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-1.5">
                  Reviewed by {r.reviewer.name} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(r.scorecard as { criterion: string; score: number }[]).map((s) => (
                    <span key={s.criterion} className="pill-neutral !py-0.5">
                      {s.criterion}: {s.score}/5
                    </span>
                  ))}
                </div>
                {r.coachingNotes && (
                  <p className="text-sm text-ink-950/70 dark:text-surface/70">{r.coachingNotes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "ok" }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-semibold font-mono ${accent === "ok" ? "text-sla-ok" : ""}`}>{value}</div>
      <div className="text-xs text-ink-950/50 dark:text-surface/50 mt-0.5">{label}</div>
    </div>
  );
}
