import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { AgentWorkspaceClient } from "@/components/agent-workspace/workspace-client";

export default async function AgentWorkspacePage() {
  const ctx = await requireSession();

  const myCases = await prisma.case.findMany({
    where: {
      tenantId: ctx.tenantId,
      assignedToId: ctx.userId,
      status: { notIn: ["CLOSED", "RESOLVED"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      customer: true,
      slaPolicy: true,
      interactions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const relevantArticles = await prisma.knowledgeArticle.findMany({
    where: { tenantId: ctx.tenantId, status: "PUBLISHED" },
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, category: true },
  });

  // "Today's top driver" per interaction type, for this agent specifically
  // — the most common category among cases assigned to them, created
  // today. A tighter, personal version of the tenant-wide "Top drivers"
  // panel on the Analytics page.
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const todaysCases = await prisma.case.findMany({
    where: { tenantId: ctx.tenantId, assignedToId: ctx.userId, createdAt: { gte: startOfDay }, caseCodeId: { not: null } },
    select: { type: true, caseCode: { select: { category: true } } },
  });

  function topDriverFor(type: "COMPLAINT" | "SERVICE_REQUEST" | "INQUIRY") {
    const counts = new Map<string, number>();
    for (const c of todaysCases) {
      if (c.type !== type || !c.caseCode) continue;
      counts.set(c.caseCode.category, (counts.get(c.caseCode.category) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { category: top[0], count: top[1] } : null;
  }

  const topDriversToday = {
    COMPLAINT: topDriverFor("COMPLAINT"),
    SERVICE_REQUEST: topDriverFor("SERVICE_REQUEST"),
    INQUIRY: topDriverFor("INQUIRY"),
  };

  return (
    <AgentWorkspaceClient
      cases={JSON.parse(JSON.stringify(myCases))}
      articles={relevantArticles}
      topDriversToday={topDriversToday}
    />
  );
}
