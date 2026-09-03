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

  return (
    <AgentWorkspaceClient
      cases={JSON.parse(JSON.stringify(myCases))}
      articles={relevantArticles}
    />
  );
}
