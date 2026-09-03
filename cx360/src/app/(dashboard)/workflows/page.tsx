import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { WorkflowsClient } from "@/components/workflows/workflows-client";

export default async function WorkflowsPage() {
  const ctx = await requireSession();

  const rules = await prisma.workflowRule.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <WorkflowsClient
      rules={JSON.parse(JSON.stringify(rules))}
      canEdit={ctx.role === "ADMIN" || ctx.role === "SUPERVISOR"}
    />
  );
}
