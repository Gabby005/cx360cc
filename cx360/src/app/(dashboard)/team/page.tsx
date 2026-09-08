import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { TeamQueueClient } from "@/components/team/team-queue-client";

export default async function TeamPage() {
  const ctx = await requireSession();
  if (ctx.role !== "SUPERVISOR" && ctx.role !== "ADMIN") redirect("/dashboard");

  const memberships = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, role: { in: ["AGENT", "SUPERVISOR"] } },
    include: { user: { select: { id: true, name: true } } },
  });
  const agents = memberships.map((m) => m.user);

  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));

  const perAgent = await Promise.all(
    agents.map(async (a) => {
      const [open, pending, resolvedToday] = await Promise.all([
        prisma.case.count({
          where: { tenantId: ctx.tenantId, assignedToId: a.id, status: { in: ["NEW", "OPEN", "ESCALATED"] } },
        }),
        prisma.case.count({
          where: { tenantId: ctx.tenantId, assignedToId: a.id, status: "PENDING_CUSTOMER" },
        }),
        prisma.case.count({
          where: { tenantId: ctx.tenantId, assignedToId: a.id, resolvedAt: { gte: startOfDay } },
        }),
      ]);
      return { agent: a, open, pending, resolvedToday };
    })
  );

  const teamCases = await prisma.case.findMany({
    where: { tenantId: ctx.tenantId, status: { notIn: ["CLOSED", "RESOLVED"] } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 150,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { id: true, name: true } },
      slaPolicy: true,
    },
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold mb-1">Team</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Every agent's queue in one view, with reassignment. QA reviews live on individual case pages.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {perAgent.map(({ agent, open, pending, resolvedToday }) => (
          <div key={agent.id} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="avatar w-8 h-8 text-xs">{agent.name[0]}</span>
              <span className="text-sm font-medium truncate">{agent.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Open" value={open} />
              <Metric label="Pending" value={pending} />
              <Metric label="Resolved" value={resolvedToday} accent="ok" />
            </div>
          </div>
        ))}
        {perAgent.length === 0 && (
          <p className="col-span-full text-sm text-ink-950/50 dark:text-surface/50 py-6 text-center card">
            No agents on this team yet.
          </p>
        )}
      </div>

      <TeamQueueClient cases={JSON.parse(JSON.stringify(teamCases))} agents={agents} />
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "ok" }) {
  return (
    <div>
      <div className={`text-lg font-semibold font-mono ${accent === "ok" ? "text-sla-ok" : ""}`}>{value}</div>
      <div className="text-[10px] text-ink-950/50 dark:text-surface/50">{label}</div>
    </div>
  );
}
